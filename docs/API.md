# API 契约与端点

最后核对：2026-09-07。权威实现位于 `apps/api/app/api/routes`，运行后以 FastAPI OpenAPI `/docs` 为字段级事实源。

## 1. 通用约定

- 基础路径：`/api/v1`。
- 普通请求/响应使用 JSON；SSE 对话使用 `text/event-stream`。
- 受保护接口使用 `Authorization: Bearer <access_token>`。
- 时间字段使用 ISO 8601。数据库内部当前为 naive UTC，用户自然日按 `users.timezone` 换算。
- 删除成功通常返回 204 且无响应体。
- 普通业务错误通常为 `{"detail": "可操作的错误信息"}`；Pydantic 422 保持 FastAPI 标准校验结构。
- 私有资源不存在或不属于当前用户时按 404 处理，避免泄露资源存在性。

当前 JWT 默认有效期为 10080 分钟，可由后端环境变量调整。前端会在普通 API 收到 401 时清除本地 Token。

## 2. 无需登录的端点

- `GET /health`：服务健康检查。
- `POST /auth/register`：注册并返回 Bearer Token 与用户资料。
- `POST /auth/login`：登录并返回 Bearer Token 与用户资料。
- `GET /articles`：仅列出 `is_published=true` 的文章摘要。

文章详情、查词、收藏、学习和 AI 能力都需要登录。新增公共端点必须单独评估数据来源、滥用、限流和隐私，不能仅为前端方便移除鉴权。

## 3. 账号与仪表盘

### 账号

- `POST /auth/register`
- `POST /auth/login`
- `GET /users/me`
- `PATCH /users/me`

资料更新支持昵称、CEFR 等级、每日新词目标和有效 IANA 时区。

### 仪表盘

- `GET /dashboard`

返回今日待复习、今日已学、累计掌握、生词数、连续学习、当前词书和最近活动。统计必须按当前用户和其时区计算。

## 4. 词书与学习

- `GET /wordbooks`：公共词书及当前用户进度。
- `POST /wordbooks/{wordbook_id}/select`：选择当前词书。
- `GET /study/queue?limit=20`：先返回到期复习，再按每日上限补新词；`limit` 范围 1～50。
- `POST /study/reviews`：提交评分并更新进度、历史和当日计划完成状态。

评分枚举：`again`、`hard`、`good`、`easy`。复习算法是确定性领域规则，客户端和模型都不能自行计算并覆盖结果。

## 5. 生词与多生词本

- `GET /vocabulary?q=`：搜索当前用户生词。
- `POST /vocabulary`：按全局 `word_id` 加入生词；重复添加返回已有项。
- `DELETE /vocabulary/{word_id}`：彻底移除当前用户的生词项及其分类关联。
- `GET /vocabulary/collections`：当前用户生词本及数量；按需创建默认本。
- `POST /vocabulary/collections`：新建生词本。
- `PATCH /vocabulary/collections/{collection_id}`：重命名非默认生词本。

当前普通 HTTP API 没有删除 collection 的直接端点；删除通过 Agent 工具并要求二次确认。同一单词可位于多个 collection，从某个本移除不等于删除全局 `Word` 或学习进度。

## 6. 文章、查词与收藏

- `GET /articles`：公开文章列表，仅返回已发布内容。
- `GET /articles/{article_id}`：登录后读取文章和句子；允许已发布文章或当前用户自己的私有草稿。
- `GET /words/lookup?term=`：登录后查询内置词典，term 长度 1～100。
- `GET /articles/bookmarks`：当前用户收藏。
- `POST /articles/sentences/{sentence_id}/bookmark`：收藏句子，重复请求复用已有记录。
- `DELETE /articles/sentences/{sentence_id}/bookmark`：取消收藏，未收藏时仍返回 204。

对外部或生成文章的可见性规则发生变化时，必须同时更新查询条件、用户隔离测试和本文。

## 7. AI 模型设置

全部需要登录：

- `GET /ai/providers/catalog`：支持厂商、官方地址、模型和能力。
- `GET /ai/providers`：当前用户配置，只返回 Key 掩码。
- `PUT /ai/providers/{provider}`：新增/更新 DeepSeek 或 MiniMax 配置。
- `POST /ai/providers/{provider}/test`：使用已保存密钥做最小连接测试。
- `DELETE /ai/providers/{provider}`：删除配置。

Provider 枚举当前为 `deepseek|minimax`。保存前服务器必须配置 `AI_CREDENTIAL_ENCRYPTION_KEY`。用户不能自定义 `base_url`，完整 Key 不能出现在读取响应、日志或 SSE 中。

常见错误：

- 400：配置/模型/Key 不符合业务规则或认证失败；
- 404：Provider/配置不存在；
- 409：旧 Key 无法解密等状态冲突；
- 429：厂商限流；
- 502：厂商返回无法解析或异常响应；
- 503：服务端主密钥未配置或厂商不可用。

## 8. AI 会话

- `GET /ai/conversations`：未归档会话。
- `POST /ai/conversations`：创建会话；可选 Provider，模型固定为当前配置。
- `GET /ai/conversations/{id}/messages`：按消息 ID 顺序恢复完整消息。
- `GET /ai/conversations/{id}/tool-runs`：恢复工具执行和确认卡片。
- `PATCH /ai/conversations/{id}`：重命名、归档或取消归档。
- `DELETE /ai/conversations/{id}`：删除会话及其消息/工具记录。
- `POST /ai/chat/stream`：发送消息并接收 SSE。
- `POST /ai/tool-runs/{id}/confirm`：确认或取消待处理危险操作。

已有会话不能中途切换 Provider。创建对话和保存用户消息在流开始前完成，因此即使浏览器随后断开，该用户消息仍可能已经持久化。

## 9. SSE 请求与事件

请求：

```http
POST /api/v1/ai/chat/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "查看我今天的学习计划",
  "conversation_id": 123,
  "provider": "minimax"
}
```

- `message`：trim 后 1～4000 字符。
- `conversation_id`：可选；存在时必须属于当前用户。
- `provider`：新会话可选；续接会话时若提供必须与会话一致。

每个 SSE block 使用 `event:` 和 JSON `data:`。当前事件：

| 事件 | 用途 |
|---|---|
| `conversation.created` | 返回本次使用的会话 ID；续接会话也会发送 |
| `message.delta` | assistant 文本增量 |
| `message.completed` | 最终消息 ID 和完整内容 |
| `usage.completed` | Provider、模型、Token 和耗时 |
| `tool.started` | 工具开始 |
| `tool.completed` | 普通工具成功及结构化结果 |
| `tool.failed` | 工具失败及安全化信息 |
| `confirmation.required` | 危险工具暂停，返回锁定参数和 tool run ID |
| `navigation.requested` | 受限站内页面跳转结果 |
| `error` | 流内错误；HTTP 可能已是 200，客户端必须按事件处理 |

连接中止不等于服务器事务回滚或后台取消。当前实现没有断点续传；重新打开会话应通过 messages 和 tool-runs 接口恢复持久化状态。

## 10. 确认协议

收到 `confirmation.required` 后，客户端调用：

```json
{ "confirmed": true }
```

或：

```json
{ "confirmed": false }
```

后端按 `tool_run_id + current_user.id` 读取数据库中已校验的工具名和参数。状态不是 `pending_confirmation` 时返回 409，防止重复执行。确认成功后当前版本直接执行并保存结果摘要，不自动恢复原 Agent 循环。

## 11. 兼容性和新增端点

- `/api/v1` 内优先向后兼容地新增可选字段；删除、重命名、改变类型/含义属于破坏性变更。
- 破坏性变更先设计迁移期或新 API 版本，并同步前端、测试和文档。
- 当前列表直接返回数组，尚未统一分页。词书、文章、会话或生词规模增长时，应先定义共同分页契约再逐端点迁移。
- 每个新私有端点都要有 401、越权和他人资源测试；每个写端点还要有重复请求和失败事务测试。
- API 错误消息是用户体验的一部分，但客户端不应依赖任意自然语言全文做程序分支；需要稳定分支时新增明确错误码字段。

## 12. 调试入口

本地 API：`http://localhost:8000`；交互 OpenAPI：`http://localhost:8000/docs`。生产是否暴露 `/docs` 需要单独安全决策，不应在公开环境展示不必要的内部操作面。

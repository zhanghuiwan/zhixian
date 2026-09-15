# API 契约与端点

最后核对：2026-09-10。权威实现位于 `apps/api/app/api/routes`，运行后以 FastAPI OpenAPI `/docs` 为字段级事实源。

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
- `GET /articles`：仅列出公开已发布文章；携带有效 Token 时附加当前用户阅读进度，并包含其私有文章。

文章详情、查词、收藏、学习和 AI 能力都需要登录。新增公共端点必须单独评估数据来源、滥用、限流和隐私，不能仅为前端方便移除鉴权。

## 3. 账号与仪表盘

### 账号

- `POST /auth/register`
- `POST /auth/login`
- `GET /users/me`
- `PATCH /users/me`

资料更新的当前产品入口支持昵称、每日新词目标和有效 IANA 时区。旧客户端仍可提交 CEFR `level`，但该兼容字段已不参与当前界面和 Agent 上下文。

### 仪表盘

- `GET /dashboard`

返回今日待复习、今日已学、累计掌握、生词数、连续学习、当前词书和最近活动。统计必须按当前用户和其时区计算。

## 4. 词书与学习

- `GET /wordbooks`：公共词书及当前用户进度。
- `POST /wordbooks/{wordbook_id}/select`：选择当前词书。
- `GET /library`：统一返回已发布系统词书与当前用户个人词书。
- `POST /library/personal`：创建个人词书。
- `GET /library/{kind}/{id}?q=&state=`：读取系统/个人词书详情并按学习状态筛选。
- `POST /library/{kind}/{id}/select`：选择当前系统或个人词书。
- `PATCH|DELETE /library/personal/{id}`：更新或删除当前用户的非默认个人词书。
- `POST /library/personal/{id}/words`：按词典 term 批量加入个人词书。
- `DELETE /library/personal/{id}/words/{word_id}`：只移出该个人词书。
- `GET /study/queue?limit=20&mode=all&kind=system&source_id=1`：先返回所选范围内到期复习，再按用户每日新词上限补充新词；`mode` 支持 `all|new|review`，`limit` 范围 1～50。
- `POST /study/reviews`：提交评分并更新进度、历史和当日计划完成状态；客户端应传 8～64 字符 `request_id`，相同用户的网络重试返回首次结果，不重复计分。

评分枚举：`again`、`hard`、`good`、`easy`。复习算法是确定性领域规则，客户端和模型都不能自行计算并覆盖结果。

## 5. 生词与多生词本

- `GET /vocabulary?q=&dictionary_source=`：搜索当前用户生词；来源支持 `all|system|custom`。
- `POST /vocabulary`：按当前用户可见的 `word_id` 加入生词；系统词全局可见，自定义词必须属于当前用户，重复添加返回已有项。
- `GET /vocabulary/custom-words`：只列出当前用户拥有、且尚未被系统词库收录的自定义词。
- `POST /vocabulary/custom-words`：创建或取得当前用户对自定义词的所有权，并加入指定或默认生词本；同一用户重复请求复用词条和关系。
- `DELETE /vocabulary/{word_id}`：彻底移除当前用户的生词项及其分类关联。
- `GET /vocabulary/collections`：当前用户生词本及数量；按需创建默认本。
- `POST /vocabulary/collections`：新建生词本。
- `PATCH /vocabulary/collections/{collection_id}`：重命名非默认生词本。

旧 `/vocabulary/collections` 接口继续供 Agent 和兼容页面使用；新产品词书入口使用 `/library`。同一单词可位于多个 collection，从某个本移除不等于删除全局 `Word` 或学习进度。

## 6. 文章、查词与收藏

- `GET /articles`：公开文章列表，仅返回已发布内容。
- `POST /articles/import-text`：登录用户把 20～20,000 字符、至少含一个英文字母的文本幂等保存为私有阅读文章；可选标题，重复正文返回同一文章。
- `GET /articles/{article_id}`：登录后读取文章和句子；允许已发布文章或当前用户自己的私有草稿。
- `GET /words/lookup?term=`：登录后查询系统词和当前用户拥有的自定义词，term 长度 1～100；不泄露其他用户的自定义词。
- `GET /articles/bookmarks`：当前用户收藏。
- `GET /sentences?q=&source=`：分页搜索句子收藏；来源支持 `all|article|manual|ai|example`。
- `POST /sentences`：保存文章选区、AI 对话片段或手动句子；按来源和规范化文本幂等。
- `PATCH /sentences/{id}`：更新译文、笔记和标签。
- `DELETE /sentences/{id}`：删除当前用户收藏。
- `POST /articles/sentences/{sentence_id}/bookmark`：收藏句子，重复请求复用已有记录。
- `DELETE /articles/sentences/{sentence_id}/bookmark`：取消收藏，未收藏时仍返回 204。
- `PUT /articles/{article_id}/progress`：保存阅读位置、百分比和完成状态，并写入用户自然日阅读活动。

收藏保存文本与来源快照，即使原文章随后删除也能保留。对外部或生成文章的可见性规则发生变化时，必须同时更新查询条件、用户隔离测试和本文。

## 7. 学习记录

- `GET /records?month=YYYY-MM`：按用户 IANA 时区返回整月每天的新学词、复习词、评分次数、阅读、收藏及明细。
- `GET /records/{YYYY-MM-DD}`：返回某一天的相同结构。

示例句子收藏使用 `is_example=true`，不计入收藏统计；学习日历只聚合数据库中实际评分、阅读进度和用户新增收藏。

## 8. AI 模型设置

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

## 9. AI 会话

- `GET /ai/conversations`：未归档会话。
- `GET /ai/conversations/today`：返回用户本地日期对应的未归档默认会话；尚未发送消息时返回 `null`。
- `POST /ai/conversations`：显式创建 `manual` 会话；可选 Provider，模型固定为当前配置。
- `GET /ai/conversations/{id}/messages`：按消息 ID 顺序恢复完整消息。
- `GET /ai/conversations/{id}/tool-runs`：恢复工具执行和确认卡片。
- `PATCH /ai/conversations/{id}`：重命名、归档或取消归档。
- `DELETE /ai/conversations/{id}`：删除会话及其消息/工具记录。
- `POST /ai/chat/stream`：发送消息并接收 SSE。
- `POST /ai/tool-runs/{id}/confirm`：确认或取消待处理危险操作。

会话响应增加 `conversation_type=daily|manual` 和可空 `local_date`。未传 `conversation_id` 的聊天按用户 IANA 时区复用当天 `daily` 会话；只有显式新建才产生 `manual` 会话。当日默认会话被归档后，`/today` 返回 `null`；用户当天再次发送默认消息时会重新激活原会话，避免重复当日会话。对话主页默认不显示历史侧栏，但会话仍完整持久化并在进入页面时恢复当天会话。Agent 提供 `search_conversation_history` 领域工具，可按关键词扫描当前用户全部会话并返回每次最多 30 条受限片段；这不是向量检索，也不会把全部历史在每轮发送给模型。

消息读取响应中的 assistant 消息可包含 `actions`。每项包含稳定 `id`、白名单 `type`、显示 `label` 和结构化 `payload`；当前类型为 `add_word_to_collection`、`request_custom_word`、`save_sentence`、`import_article`、`navigate`。这些操作来自服务端规则和已校验工具结果，不把模型正文解析为指令。

已有会话不能中途切换 Provider。创建对话和保存用户消息在流开始前完成，因此即使浏览器随后断开，该用户消息仍可能已经持久化。

## 10. SSE 请求与事件

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
| `message.completed` | 最终消息 ID、完整内容和可选白名单 `actions` |
| `usage.completed` | Provider、模型、Token 和耗时 |
| `tool.started` | 工具开始 |
| `tool.completed` | 普通工具成功及结构化结果 |
| `tool.failed` | 工具失败及安全化信息 |
| `confirmation.required` | 危险工具暂停，返回锁定参数和 tool run ID |
| `navigation.requested` | 受限站内页面跳转结果 |
| `error` | 流内错误；HTTP 可能已是 200，客户端必须按事件处理 |

连接中止不等于服务器事务回滚或后台取消。当前实现没有断点续传；重新打开会话应通过 messages 和 tool-runs 接口恢复持久化状态。

前端恢复工具记录时只保留写操作、确认和需要长期展示的结果。查词、学习历史、复习计划、易错词、生词本列表和历史检索等只读状态只在当前请求期间显示，并在最终回答完成后清理。回答 `actions` 随 assistant 消息持久化，刷新后仍可恢复；前端再次验证类型、参数和站内路径白名单。

## 11. 确认协议

收到 `confirmation.required` 后，客户端调用：

```json
{ "confirmed": true }
```

或：

```json
{ "confirmed": false }
```

后端按 `tool_run_id + current_user.id` 读取数据库中已校验的工具名和参数。状态不是 `pending_confirmation` 时返回 409，防止重复执行。确认成功后当前版本直接执行并保存结果摘要，不自动恢复原 Agent 循环。

## 12. 兼容性和新增端点

- `/api/v1` 内优先向后兼容地新增可选字段；删除、重命名、改变类型/含义属于破坏性变更。
- 破坏性变更先设计迁移期或新 API 版本，并同步前端、测试和文档。
- 当前列表直接返回数组，尚未统一分页。词书、文章、会话或生词规模增长时，应先定义共同分页契约再逐端点迁移。
- 每个新私有端点都要有 401、越权和他人资源测试；每个写端点还要有重复请求和失败事务测试。
- API 错误消息是用户体验的一部分，但客户端不应依赖任意自然语言全文做程序分支；需要稳定分支时新增明确错误码字段。

## 13. 调试入口

本地 API：`http://localhost:8000`；交互 OpenAPI：`http://localhost:8000/docs`。生产是否暴露 `/docs` 需要单独安全决策，不应在公开环境展示不必要的内部操作面。

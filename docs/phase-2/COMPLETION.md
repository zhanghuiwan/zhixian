# 第二阶段交付报告

完成日期：2026-09-02

## 已交付

### AI Provider 与安全

- DeepSeek、MiniMax Provider 配置、默认切换和连接测试；
- 用户 API Key 使用 Fernet 加密，接口只返回掩码；
- MiniMax-M3 为 MiniMax 默认推荐模型；
- OpenAI 兼容普通回答、SSE 和 Tool Calls 归一化；
- 厂商鉴权、限流、额度、服务不可用和格式异常映射。

### Agent 与会话

- 持久化会话、消息、摘要、用量和工具审计；
- 单轮最多 6 次模型往返、10 次工具调用；
- 最近消息加较早对话摘要控制上下文；
- 危险操作等待确认，确认时执行锁定参数；
- SSE 文本、工具、确认、导航、用量和错误事件。

### 学习工具

- 查词及当前掌握状态；
- 指定本地日期的真实学习历史；
- 今日计划快照和未来七天预测；
- 近期易错词分析；
- 白名单站内导航；
- 多生词本列表、新建、重命名、加词、移词和确认删除；
- 结构化例句、分级文章草稿；
- 明确请求后保存稳定学习偏好。

### 前端

- 首页 AI 主输入框和快捷问题；
- 完整对话页、会话历史、停止生成和错误提示；
- 工具状态、确认卡片和受限导航；
- 桌面侧栏与移动端抽屉布局；
- 模型设置入口和无配置引导。

## 数据库版本

第二阶段 Alembic 版本为 `0003`。新增会话、消息、工具审计、长期偏好、每日计划、多生词本关联和文章草稿归属模型。

## 验证结果

- 后端自动化：18 项通过；
- Alembic：`0001 → 0003 → 0002 → 0003` 通过；
- 前端 ESLint：通过；
- Next.js 生产构建：通过；
- Docker Compose 配置与镜像构建：通过；
- PostgreSQL 容器迁移：`0003 (head)`；
- API、PostgreSQL 容器健康：通过；
- Nginx 登录页 HTTP 200；
- MiniMax-M3 模型列表、普通回答、SSE、Tool Call：通过；
- MiniMax-M3 到知闲会话、加密配置、查词工具和持久化全链路：通过；
- 真实测试临时数据库：已清理；
- 自动浏览器视觉巡检：受当前 Windows 浏览器控制沙箱初始化错误限制，未完成；生产构建、HTTP 和响应式 CSS 检查已通过。

## 本地使用前必须完成

根目录 `.env` 需要配置一次稳定的 `AI_CREDENTIAL_ENCRYPTION_KEY`：

```powershell
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

把输出填写到 `.env` 后重新创建 API 容器：

```powershell
docker compose up -d --force-recreate api
```

随后登录知闲，在“我的 → AI 模型设置”里保存 MiniMax 或 DeepSeek Key。不要把 Key 放入 Git 仓库。

## 第三阶段边界

PDF 解析、OCR、单词语音、句子语音和长任务 worker 未包含在第二阶段。本阶段已经保留 Provider 和工具扩展位置，第三阶段再增加文件表、任务队列、临时文件清理和磁盘配额。

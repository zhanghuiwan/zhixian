# 知闲项目协作指引

本文是任何开发者或 AI 模型进入本仓库后的第一入口。它约束整个仓库；子目录若以后增加自己的 `AGENTS.md`，只补充该目录的局部规则，不能放宽本文的安全、数据隔离和验证要求。

## 1. 项目边界

- 唯一主项目和代码事实源是本仓库：`git@github.com:zhanghuiwan/zhixian.git`。
- `apps/web` 是 Next.js 前端，`apps/api` 是 FastAPI 后端；生产目标是阿里云单机 Docker Compose。
- 相邻目录 `../qwerty-learner` 仅是候选词库来源，不是知闲的第二个开发仓库。不要在那里实现知闲功能、提交改动或建立运行时依赖。
- “梧桐形象”当前明确暂缓。除非用户重新授权，不设计、不实现，也不把它夹带进其他任务。
- 当前阶段状态、已知限制和下一步以 `docs/PROJECT_STATUS.md` 为准。

## 2. 无上下文接手顺序

开始工作前至少阅读：

1. 本文件；
2. `docs/README.md`；
3. `docs/PROJECT_STATUS.md`；
4. 与任务直接相关的专项文档；
5. 对应源码、测试和配置。

常用路由：

- 环境、跨电脑与日常命令：`docs/development/README.md`
- 分支、提交、Pull Request 与完成定义：`CONTRIBUTING.md`
- 架构和模块边界：`docs/ARCHITECTURE.md`
- 编码规范：`docs/CODING_STANDARDS.md`
- 数据表和所有权：`docs/DATA_MODEL.md`
- API 与 SSE：`docs/API.md`
- 测试要求：`docs/TESTING.md`
- 词库提取：`docs/WORDLIST_PIPELINE.md`
- 阿里云发布与恢复：`docs/DEPLOYMENT.md`
- 安全红线：`docs/SECURITY.md`
- 决策背景：`docs/DECISIONS.md`
- 跨对话交接：`docs/TASK_HANDOFF.md`

文档与源码冲突时，不要静默选择其中一个。以当前源码、迁移、测试和运行配置为行为事实，确认差异后在同一任务中更新失真的文档。需求范围则以用户最新明确指示和状态文档为准。

## 3. 开工前必做

```bash
git status --short --branch
git log -5 --oneline --decorate
```

- 先识别工作区已有改动；未确认归属的改动属于用户，不覆盖、不删除、不回退。
- 阅读相关测试，再修改实现。
- 任务较大时先写清计划；不要借任务之名重构无关代码。
- 需要外部资料时记录来源和版本，不能把聊天上下文当成永久项目事实。

## 4. 实现约束

### 后端

- HTTP 边界放在 `apps/api/app/api/routes`，Pydantic 契约放在 `schemas`，领域逻辑放在 `services`。
- 所有用户私有数据查询和写入必须显式绑定当前 `user_id`；只按资源 ID 查询属于越权风险。
- 事务在明确边界提交。写操作要考虑重复请求、幂等性、失败回滚和审计。
- 数据模型变更必须新增 Alembic 迁移。已部署的 `0001`、`0002`、`0003` 不得改写。
- 时间在数据库中按 naive UTC 的既有约定存储；面向用户的“今天/昨天”必须通过用户 IANA 时区换算。
- Agent 只能使用注册的领域工具。不得增加任意 SQL、任意 HTTP、文件系统或通用代码执行能力。

### 前端

- API 和 SSE 请求统一经 `apps/web/lib/api.ts`；共享契约集中在 `apps/web/lib/types.ts`。
- 页面必须覆盖加载、空状态、失败、未登录和移动端布局。
- `NEXT_PUBLIC_*` 是公开构建信息，禁止放服务端密钥。
- 改动认证、SSE 或写操作时，同时检查 401、流中断、重复提交和恢复后的界面状态。

### 数据与词库

- `words` 是全局词典，用户学习状态只能进入用户表。
- 词书导入必须走可重复执行、可审计的转换流程，不能把大型 JSON 手工粘进种子脚本。
- 从 qwerty-learner 或其他来源提取前，必须完成单个词库的数据来源和授权核验；GPL-3.0 仓库许可证不能自动证明每份第三方词典数据均可重新分发。
- 保留来源仓库、提交哈希、源文件、校验和、转换版本和导入统计。

## 5. 安全红线

- 不读取、打印、提交或写入真实 `.env`、Token、API Key、数据库密码和用户内容。
- 不把凭证放进命令参数、日志、截图、测试夹具、提交信息或环境模板。
- 不对公网开放 PostgreSQL 5432、FastAPI 8000 或 Next.js 3000。
- 删除数据卷、生产数据、备份或迁移回滚属于破坏性操作，必须获得明确授权并先确认目标和恢复方案。
- 不在阿里云服务器直接改源码。代码从本地经 GitHub 进入 `main`，服务器只拉取可部署版本。

## 6. 最低验证

按改动范围执行；跳过某项必须在交接中说明原因：

```bash
cd apps/api
python -m pytest

cd ../web
npm run lint
npm run build

cd ../..
docker compose config
git diff --check
```

涉及数据库时还要验证 Alembic head 和 SQLite/PostgreSQL 升级路径；涉及 UI 时人工检查 360px 移动端和常见桌面宽度；涉及外部模型时只使用仓库外临时凭证。

## 7. 文档同步规则

代码变更同时检查：

| 变化 | 必须检查的文档 |
|---|---|
| 新功能、范围或完成度 | `docs/PROJECT_STATUS.md`、`README.md` |
| 模块、数据流或技术选型 | `docs/ARCHITECTURE.md`、`docs/DECISIONS.md` |
| API、SSE、错误或鉴权 | `docs/API.md` |
| 表、字段、索引或迁移 | `docs/DATA_MODEL.md` |
| 环境变量、启动命令、依赖版本 | `README.md`、`docs/development/README.md` |
| 部署、挂载、备份或回滚 | `docs/DEPLOYMENT.md`、`docs/SECURITY.md` |
| 词库来源或转换规则 | `docs/WORDLIST_PIPELINE.md` |
| 新验证路径 | `docs/TESTING.md` |

历史计划文档可以保留，但必须明确其历史属性，不能让旧计划覆盖当前源码事实。

## 8. 交付与交接

完成任务时报告：

- 改了什么以及为什么；
- 关键文件；
- 实际执行的验证和结果；
- 未验证项、风险和待办；
- 是否涉及迁移、环境变量、部署或数据兼容性。

跨对话或未完成任务按 `docs/TASK_HANDOFF.md` 留下可复制的交接记录。除非用户明确要求，不擅自提交、推送、部署或修改生产环境。

# 测试与验证规范

最后核对：2026-09-10。

## 1. 当前自动化基线

| 层 | 当前门禁 | 位置 |
|---|---|---|
| 后端 | pytest，当前 35 个测试函数 | `apps/api/tests` |
| 前端 | ESLint + TypeScript/Next.js production build | `apps/web` |
| CI | Python 3.13、Node 24；push `main` 和 PR 触发 | `.github/workflows/ci.yml` |
| 容器 | Compose 配置解析、镜像构建、健康检查 | `compose.yaml` |

当前前端没有组件测试或 E2E 测试。不能把 lint/build 描述成完整的交互回归覆盖。

## 2. 标准命令

先按 `development/README.md` 创建 Python 环境和安装 Node 依赖，然后执行：

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

使用根目录 `.venv` 时，macOS/Linux 可把后端命令替换为：

```bash
cd apps/api
../../.venv/bin/python -m pytest
```

Windows PowerShell 使用 `..\..\.venv\Scripts\python.exe -m pytest`。不要依赖系统 `python` 恰好是正确版本。

## 3. 按变更选择测试

| 变更 | 最低验证 |
|---|---|
| 复习算法 | 单元测试覆盖每种评分、边界掌握分、重复次数和确定时间 |
| 路由/schema | 成功、422 校验、401、资源不存在、他人资源隔离 |
| 用户写操作 | 重复请求/唯一约束、事务失败、越权和删除语义 |
| ORM/迁移 | 空库升级、旧库升级、SQLite、Docker PostgreSQL、head 检查 |
| Agent 工具 | 参数校验、用户隔离、幂等、确认/取消、审计、工具上限、每日会话和上下文操作 |
| Provider | 使用 mock 覆盖流式分片、工具调用、用量和错误映射 |
| 前端页面 | lint/build + 加载/空/错误/401 + 360px/桌面人工检查 |
| SSE | 文本分片、多个 data 行、工具事件、未知事件、中止和刷新恢复 |
| 词库导入 | schema、重复、排序、统计、dry-run、重复导入和回滚 |
| 部署配置 | Compose 解析、镜像构建、迁移、seed、健康接口、备份恢复演练 |

## 4. 后端测试约定

- 测试默认使用独立临时 SQLite，不能连接开发或生产数据库。
- 时间相关测试传入固定时间或构造明确 UTC 边界，避免依赖运行当天。
- 每个用户域测试至少使用两个用户证明隔离，而不只验证正常用户。
- 外部 Provider 使用 monkeypatch/fake，不在常规测试中消费真实额度或访问网络。
- 缺陷修复测试应在未修复代码上失败，在修复后通过。
- 测试断言业务结果和安全边界，不只断言状态码。

当前测试模块职责：

- `test_spaced_repetition.py`：复习算法。
- `test_api_flow.py`：账号、学习、阅读和用户隔离主流程。
- `test_ai_providers.py`：凭证加密、Provider 配置与协议归一化。
- `test_agent_core.py`：学习事实、Agent 会话、工具、确认、内容生成和记忆。
- `test_migrations.py`：从带旧数据的生产前一 head 升级到当前迁移。

## 5. 数据库与迁移验证

本地快速测试使用 SQLite，但发布数据库是 PostgreSQL，因此涉及模型、SQL、约束或并发的变更不能只测 SQLite。

容器环境建议执行：

```bash
docker compose up -d --build db api
docker compose exec -T api alembic current
curl http://127.0.0.1/api/v1/health
```

当前预期 Alembic 为 `0007 (head)`，新增迁移后预期值随之更新并同步修改部署文档。

迁移至少验证两条路径：

1. 空数据库直接 `alembic upgrade head`；
2. 生产当前 head 的带数据副本升级到新 head。

`0005` 还要确认旧句子收藏回填原文、译文、文章来源和去重键，并分别检查 SQLite 与 PostgreSQL 的 `SET NULL` 外键。`0006` 要确认旧词标记为系统词、自定义词用户隔离、猜测其他用户词 ID 无法绕过权限，以及个人词能进入学习队列。`0007` 要确认旧会话成为 `manual`、日期为空、同一用户同一本地日期只能有一条 `daily` 会话，手动会话仍可创建多条。

降级只在明确支持时测试。不可安全降级的迁移必须在发布说明中使用数据库恢复方案，不能提供虚假的回滚保证。

## 6. 前端人工验收

自动化通过后，改动相关页面检查：

- 约 360px 移动宽度、常见桌面宽度；
- 首次加载、无数据、慢请求、API 错误、登录过期；
- 键盘导航、焦点、标签、按钮禁用和文字反馈；
- 写操作重复点击和失败恢复；
- 页面刷新后服务端数据、会话和工具卡片能恢复；
- 浏览器控制台无新增错误或 hydration 警告。

涉及视觉变更时在 PR 或交接中附关键状态截图，不只附理想成功页。

## 7. 真实 Provider 冒烟测试

常规 CI 不使用真实 Key。只有 Provider 协议变化或发布前需要时，才运行：

```bash
python scripts/verify_minimax.py
python scripts/verify_live_agent.py
```

先阅读脚本所需环境变量。Key 从仓库外的安全文件临时注入；测试后清除环境变量。输出不得包含 Key、Authorization header 或完整敏感回答。

如果没有用户授权、有效凭证或额度，记录“未执行真实 Provider 冒烟测试”，不要把 mock 结果说成真实连通。

`verify_live_agent.py` 当前以一次性 SQLite 数据库验证 MiniMax-M3 的详细查词与翻译栏目、查词 Tool Call、精简入本/收藏 payload、SSE、加密配置和会话持久化。脚本只输出布尔结果，不打印模型正文或 Key。

## 8. 词库质量门禁

每个候选词库至少产生机器可读报告：

- 来源仓库、固定提交、源文件和 SHA-256；
- 声明数量、解析数量、有效数量、去重后数量；
- 空词、空翻译、超长字段、非法字符和大小写碰撞；
- 与现有 `words.term` 的重合、复用、冲突和新增统计；
- 前后 10 条有序样本；
- 重复 dry-run 结果一致；
- 数据授权审核状态。

授权未通过时只允许分析报告，不生成将要分发的派生词库或写入生产数据库。当前数据包已获项目所有者批准并进入 Git，每次校验必须同时验证 manifest SHA-256 和 7,416 个唯一词条。

当前核心词库验证命令：

```bash
cd apps/api
python -m pytest tests/test_wordlist_import.py
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json
```

第二条命令默认 dry-run，并校验已提交数据包的 SHA-256、schema、数量、顺序和来源关联。有固定上游仓库时可增加 `--source-repo ../../../qwerty-learner` 做逐字节重建核对。重复执行 `--apply` 时，第二次结果的新增、删除和重排应全部为 0。

## 9. 交付证据

最终说明中逐项写实际结果，例如：

```text
- Backend: 35 passed
- Web lint: passed
- Web build: passed
- Compose config: passed
- PostgreSQL bootstrap: 0007 (head), 7,416 dictionary terms, 6 published preset books
- Manual: AI Markdown/actions, learning hub, reading, sentences and records at 360px/desktop passed
```

不要只写“测试完成”。失败、跳过、警告和环境限制都应保留，这些信息是下一位接手者的起点。

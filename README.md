# 知闲 Zhixian

知闲是一个面向个人使用与小规模开放的英语学习项目。项目围绕“阅读遇见生词 → 加入生词本 → 记忆与复习 → 回到文章巩固”构建学习闭环，并在第二阶段加入可查询真实学习事实、可执行站内操作的 AI 学习助手。

当前界面以 AI 对话为主页，并把词书、连续阅读、句子收藏和学习日历组织成五个稳定入口。全局词典统一去重，四级、六级、考研通用、考研英语一/二和雅思作为六本独立系统预设词书展示；用户也可以创建自己的词书。

## 第一阶段已包含

- 用户注册、登录、资料与学习目标设置
- 内置词书、词书选择和学习进度
- 单词卡片学习及 SM-2 风格间隔复习
- 自定义生词本、熟练度和来源记录
- 英文文章列表、逐句阅读、单词释义
- 单句翻译、句子收藏、文章生词入本
- 学习仪表盘、连续学习天数和基础统计
- 响应式桌面端与移动端界面
- SQLite 本地开发、PostgreSQL 生产部署
- Docker Compose、Nginx、备份脚本和健康检查
- 统一英文核心词库的固定来源清单、去重校验和幂等数据库导入

## 第二阶段已包含

- DeepSeek、MiniMax 用户级配置和加密 API Key 存储
- MiniMax-M3 / DeepSeek 兼容的 SSE 流式对话与 Tool Calls
- 持久化会话、消息、对话摘要、Token 用量和工具审计
- 按用户时区查询今天、昨天及指定日期的真实学习记录
- 今日计划快照、未来七天预测计划和近期易错词分析
- AI 查词、站内导航、多生词本增删改和危险操作确认
- 结构化例句、分级文章草稿和明确授权的长期学习偏好
- AI 首页、桌面/移动端对话界面、历史会话和结果卡片

## AI 学习工作台已包含

- AI 对话独占主页，词书、阅读、句子和记录作为固定导航
- 六本独立系统预设词书，以及可创建、选中和维护的个人词书
- 按词书学习新词或复习到期词，显示实际间隔并防止重复评分
- 连续文章阅读、阅读位置恢复、自由划选翻译/收藏/问 AI、查词与生词收集
- 独立句子收藏页，支持文章、AI 和手动来源、笔记、标签、搜索与删除
- 按用户时区生成的学习月历和每日单词、词书、阅读概况
- 5 篇默认文章；账号首次创建时写入 4 条示例句子收藏，删除后不会重新出现

## 仓库结构

```text
apps/web       Next.js 前端
apps/api       FastAPI 后端与数据库模型
deploy         Nginx 和服务器配置
docs           产品、架构、开发计划与部署文档
scripts        备份等运维脚本
data           词库版本数据、本地上传与备份挂载目录
```

## 本地启动

要求：Node.js 24、Python 3.13。版本与 CI、Dockerfile 保持一致；PostgreSQL 不是本地开发的必需项。

### 1. 后端（Conda）

```bash
conda env create -f environment.yml
conda activate zhixian
cd apps/api
cp .env.example .env  # Windows PowerShell 使用 Copy-Item
alembic upgrade head
python -m app.db.seed
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json \
  --apply
uvicorn app.main:app --reload --port 8000
```

也可以使用普通 Python 虚拟环境：

```bash
python3.13 -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r apps/api/requirements.txt
cd apps/api
cp .env.example .env  # Windows PowerShell 使用 Copy-Item
alembic upgrade head
python -m app.db.seed
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json \
  --apply
uvicorn app.main:app --reload --port 8000
```

API 文档：http://localhost:8000/docs

### 词库导入

应用查询的正式单词存放在数据库中；Git 同时保存可重建数据库的固定版本 JSONL 数据包。当前数据包将 CET-4、CET-6、考研通用、考研英语一/英语二和 IELTS 合并去重为 7,416 个词典条目，再按来源发布为六本独立系统预设词书。合并记录只作为底层导入载体，不出现在产品词书入口。从 GitHub 克隆后不需要 `qwerty-learner` 目录即可校验和导入：

```bash
cd apps/api
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json

# 校验通过后写入当前 DATABASE_URL
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json \
  --apply
```

命令默认只校验数据包的 SHA-256、格式、数量和来源关联。Docker API 容器每次启动都会在迁移和 seed 后幂等导入该数据包，因此新电脑或阿里云的空 PostgreSQL volume 会自动获得基础词库。上游固定快照、许可副本与第三方权利提示见 [词库流水线](docs/WORDLIST_PIPELINE.md) 和 [数据来源说明](data/wordlists/NOTICE.md)。

### 2. 前端

```bash
cd apps/web
npm ci
cp .env.example .env.local  # Windows PowerShell 使用 Copy-Item
npm run dev
```

访问：http://localhost:3000

当 `apps/api/.env` 中 `CREATE_DEMO_USER=true`，且 `apps/web/.env.local` 中 `NEXT_PUBLIC_DEMO_MODE=true` 时，可使用演示账号：`demo@zhixian.app` / `Demo1234!`。

## Docker 一键运行

```bash
cp .env.example .env
# 修改 .env 中的密码、SECRET_KEY；使用 AI 设置时还要配置加密主密钥
docker compose up -d --build
```

访问：http://localhost 。首次启动会自动迁移数据库、写入 5 篇示例文章，并从 Git 数据包导入统一词典和六本系统预设词书。生产环境默认不创建演示账号；用户注册时会获得 4 条可编辑、可删除的示例句子收藏。

## 验证

```bash
(cd apps/api && python -m pytest)
(cd apps/web && npm run lint && npm run build)
docker compose config
```

新开发者或无上下文模型从 [仓库协作指引](AGENTS.md) 和 [文档索引](docs/README.md) 开始。当前完成度见 [项目状态](docs/PROJECT_STATUS.md)，完整规范包括 [跨电脑开发](docs/development/README.md)、[编码规范](docs/CODING_STANDARDS.md)、[测试规范](docs/TESTING.md)、[词库流水线](docs/WORDLIST_PIPELINE.md)、[架构设计](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[服务器部署](docs/DEPLOYMENT.md)、[安全规范](docs/SECURITY.md) 和 [API 说明](docs/API.md)。

阶段背景和历史交付记录保留在 [开发计划](docs/DEVELOPMENT_PLAN.md) 与 [第二阶段文档](docs/phase-2/README.md) 中；若历史计划与当前源码冲突，以源码、测试和 [项目状态](docs/PROJECT_STATUS.md) 为准。

## 安全提醒

- 不要把 `.env`、数据库、上传文件或备份提交到 GitHub；`data/wordlists` 中的 manifest、报告、许可说明和规范化数据包是例外，必须跟随代码版本。
- 上线前务必更换数据库密码和 `SECRET_KEY`，并启用 HTTPS。
- 当前定位是个人/小规模项目；如果未来开放大量用户，应增加邮件验证、密码找回、限流、异步任务队列和集中式文件存储。

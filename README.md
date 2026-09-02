# 知闲 Zhixian

知闲是一个面向个人使用与小规模开放的英语学习项目。项目围绕“阅读遇见生词 → 加入生词本 → 记忆与复习 → 回到文章巩固”构建学习闭环，并在第二阶段加入可查询真实学习事实、可执行站内操作的 AI 学习助手。

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

## 第二阶段已包含

- DeepSeek、MiniMax 用户级配置和加密 API Key 存储
- MiniMax-M3 / DeepSeek 兼容的 SSE 流式对话与 Tool Calls
- 持久化会话、消息、对话摘要、Token 用量和工具审计
- 按用户时区查询今天、昨天及指定日期的真实学习记录
- 今日计划快照、未来七天预测计划和近期易错词分析
- AI 查词、站内导航、多生词本增删改和危险操作确认
- 结构化例句、分级文章草稿和明确授权的长期学习偏好
- AI 首页、桌面/移动端对话界面、历史会话和结果卡片

## 仓库结构

```text
apps/web       Next.js 前端
apps/api       FastAPI 后端与数据库模型
deploy         Nginx 和服务器配置
docs           产品、架构、开发计划与部署文档
scripts        备份等运维脚本
data           本地上传与备份挂载目录（内容不入库）
```

## 本地启动

要求：Node.js 22+、Python 3.12+。PostgreSQL 不是本地开发的必需项。

### 1. 后端（Conda）

```bash
conda env create -f environment.yml
conda activate zhixian
cd apps/api
copy .env.example .env  # Linux/macOS 使用 cp
python -m app.db.seed
uvicorn app.main:app --reload --port 8000
```

也可以使用普通 Python 虚拟环境：

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env  # Linux/macOS 使用 cp
python -m app.db.seed
uvicorn app.main:app --reload --port 8000
```

API 文档：http://localhost:8000/docs

### 2. 前端

```bash
cd apps/web
npm install
copy .env.example .env.local  # Linux/macOS 使用 cp
npm run dev
```

访问：http://localhost:3000

当 `apps/api/.env` 中 `CREATE_DEMO_USER=true`，且 `apps/web/.env.local` 中 `NEXT_PUBLIC_DEMO_MODE=true` 时，可使用演示账号：`demo@zhixian.app` / `Demo1234!`。

## Docker 一键运行

```bash
cp .env.example .env
# 修改 .env 中的密码与 SECRET_KEY
docker compose up -d --build
```

访问：http://localhost 。首次启动会自动建表并写入示例词书、单词和文章。生产环境默认不创建演示账号，请自行注册第一个用户。

## 验证

```bash
cd apps/api && python -m pytest
cd apps/web && npm run lint && npm run build
docker compose config
```

完整说明见 [跨电脑开发规范](docs/development/README.md)、[开发计划](docs/DEVELOPMENT_PLAN.md)、[第二阶段 Agent 设计](docs/phase-2/README.md)、[第二阶段交付报告](docs/phase-2/COMPLETION.md)、[架构设计](docs/ARCHITECTURE.md)、[服务器部署](docs/DEPLOYMENT.md) 和 [API 说明](docs/API.md)。

## 安全提醒

- 不要把 `.env`、数据库、上传文件或备份提交到 GitHub。
- 上线前务必更换数据库密码和 `SECRET_KEY`，并启用 HTTPS。
- 当前定位是个人/小规模项目；如果未来开放大量用户，应增加邮件验证、密码找回、限流、异步任务队列和集中式文件存储。

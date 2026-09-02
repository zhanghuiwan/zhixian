# 知闲跨电脑开发规范

本文用于规范知闲在不同电脑上的开发、测试、同步和部署。目标是让新电脑可以从 GitHub 重建开发环境，同时避免密钥、数据库和用户文件进入仓库。

## 1. 核心原则

1. GitHub 是源代码的唯一同步中心，不用网盘、U 盘或复制整个项目目录同步代码。
2. 日常开发在本地完成；阿里云服务器只运行 `main` 的可部署版本。
3. `main` 必须保持可构建、可测试、可部署；较大功能使用短生命周期分支。
4. 数据库、上传文件、备份和密钥不是源代码，必须独立管理。
5. 离开一台电脑前先提交并推送；换电脑后先拉取，再开始修改。
6. 密钥一旦进入 Git 历史，应立即撤销或轮换，不能只删除工作区文件。

## 2. 新电脑首次准备

安装 Git、Node.js 24、Python 3.13（或 Conda）和 Docker Desktop/Docker Engine，然后配置 Git：

```bash
git config --global user.name "zhanghuiwan"
git config --global user.email "543565403@qq.com"
```

每台电脑独立配置 GitHub 认证。长期使用优先选择 SSH 密钥或系统凭据管理器；临时 PAT 只能放在仓库外部，不能写入环境模板、脚本、远端 URL 或提交信息。

## 3. 克隆与初始化

优先使用 SSH：

```bash
git clone git@github.com:zhanghuiwan/zhixian.git
cd zhixian
git switch main
git status
```

也可以使用 HTTPS：

```bash
git clone https://github.com/zhanghuiwan/zhixian.git
```

如果出现 `detected dubious ownership`，只信任项目的明确绝对路径，不要信任整个磁盘：

```bash
git config --global --add safe.directory D:/project/zhixian
```

在其他目录克隆时，把路径改成实际项目路径。

## 4. 环境变量与密钥

可以提交的文件只有模板：

```text
.env.example
apps/api/.env.example
apps/web/.env.example
```

真实的 `.env`、`apps/api/.env` 和 `apps/web/.env.local` 不能提交。

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item .env.example .env
```

首次启用 AI 模型设置时，为本地 `apps/api/.env` 和 Docker 根目录 `.env` 分别生成开发密钥：

```powershell
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

把输出填写到 `AI_CREDENTIAL_ENCRYPTION_KEY`。不同电脑可以使用不同的开发密钥，但由一台服务器恢复数据库备份时必须使用该服务器原来的密钥，否则已保存的厂商 API Key 无法解密。

注意：

- `.env.example` 只能包含占位值，禁止临时保存真实 Token。
- `NEXT_PUBLIC_*` 会进入浏览器产物，必须视为公开信息。
- AI Key、`SECRET_KEY` 和数据库密码只能放后端或服务器环境变量。
- `AI_CREDENTIAL_ENCRYPTION_KEY` 只用于加密 AI Key，需要和数据库分开备份。
- 不在日志、截图、报错或聊天记录中输出完整 Token。
- 每台电脑使用自己的环境文件，不通过 GitHub 同步。

## 5. 本地源码开发

后端首次安装和启动：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/api/requirements.txt
cd apps/api
Copy-Item .env.example .env
..\..\.venv\Scripts\python.exe -m app.db.seed
..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

源码开发默认使用 SQLite。本机 SQLite 数据不会通过 GitHub 同步。

前端另开终端：

```powershell
cd apps/web
npm ci
Copy-Item .env.example .env.local
npm run dev
```

访问 `http://localhost:3000`；API 文档位于 `http://localhost:8000/docs`。开发模式下 Next.js 会把 `/api/*` 代理到 `localhost:8000`。

## 6. 本地 Docker 演练

```powershell
cd D:\project\zhixian
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost/api/v1/health
```

查看日志：

```powershell
docker compose logs --tail=200 api
docker compose logs --tail=200 web
docker compose logs --tail=200 db
docker compose logs --tail=200 nginx
```

停止容器但保留数据库：

```powershell
docker compose down
```

未确认后果时禁止执行：

```powershell
docker compose down -v
docker system prune --volumes
```

这些命令可能删除 PostgreSQL 数据卷。不同电脑的 Docker 数据卷相互独立，不会通过 GitHub 同步。

## 7. 分支与跨电脑同步

开始工作前：

```bash
git switch main
git status
git pull --ff-only origin main
```

较大功能创建短分支：

```bash
git switch -c feat/ai-sentence-explanation
```

推荐分支前缀：`feat/`、`fix/`、`docs/`、`refactor/`、`chore/`。

提交前：

```bash
git status
git diff --check
git add <明确的文件>
git commit -m "feat: add AI sentence explanation"
git push -u origin feat/ai-sentence-explanation
```

提交类型使用 `feat`、`fix`、`docs`、`test`、`refactor` 或 `chore`。一个提交只解决一个明确问题。

不要在两台电脑上同时修改同一分支。上一台电脑的未提交内容不会出现在 GitHub，也无法在另一台电脑自动恢复。

## 8. 提交前验证

```powershell
cd apps/api
..\..\.venv\Scripts\python.exe -m pytest

cd ..\web
npm run lint
npm run build

cd ..\..
docker compose config
```

最低完成标准：

- 后端测试通过。
- ESLint、TypeScript 和生产构建通过。
- 新功能完成桌面端与移动端人工验收。
- API 数据按用户隔离。
- 没有密钥、数据库、上传文件或构建缓存进入 Git。
- 数据模型变化包含 Alembic 迁移。

## 9. 编码约定

后端：

- 路由层处理 HTTP 输入输出，复杂逻辑放入服务层。
- 请求和响应使用 Pydantic 模型，不直接暴露数据库内部对象。
- 用户数据查询必须包含当前用户条件。
- 数据结构变化创建新 Alembic 迁移，不修改已部署迁移。
- AI、OCR、TTS 调用设置超时、重试上限、额度和错误日志。
- 不记录密码、Token 或上传文件正文。

前端：

- API 请求统一通过 `apps/web/lib/api.ts`。
- 页面不直接拼接后端地址，统一使用 `NEXT_PUBLIC_API_URL`。
- 保持桌面端和移动端响应式布局。
- 明确处理加载、空数据、失败和未登录状态。
- 不在浏览器代码中保存服务端密钥。
- `next-env.d.ts` 由 Next.js 自动生成；提交前排除开发/构建模式切换产生的无意义差异。

## 10. 数据库迁移

修改 SQLAlchemy 模型后：

1. 创建新的 Alembic 迁移。
2. 检查删除字段、类型变化和唯一约束。
3. 在 SQLite 测试基本流程。
4. 在 Docker PostgreSQL 测试升级。
5. 部署前备份生产数据库。
6. 启动新 API，由入口脚本执行 `alembic upgrade head`。

禁止直接登录生产数据库手工修改表结构。不可逆迁移必须在发布说明中标注。

## 11. 上传文件与运行数据

GitHub 不保存数据库、PDF、图片、OCR 文件、TTS 缓存、日志和备份。数据库保存文件元数据和路径，文件本体保存在挂载目录。

生产环境计划使用：

```text
/data/zhixian/uploads
/data/zhixian/audio
/data/zhixian/temp
/data/zhixian/backups
```

已知注意项：当前 `compose.yaml` 使用项目相对上传目录，而备份脚本默认使用 `/data/zhixian/uploads`。正式部署前必须统一路径，否则上传文件可能未被备份。

没有对象存储时，必须限制文件类型、大小、用户配额和临时文件保留时间，并至少每周把一份备份下载到另一台电脑。

## 12. 阿里云部署边界

服务器只部署 `main`：

```bash
cd /opt/zhixian
bash scripts/backup.sh
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl http://127.0.0.1/api/v1/health
```

生产规则：

- 不在服务器直接修改仓库代码。
- 公开仓库的服务器拉取不需要保存本地开发 PAT。
- 生产 `.env` 只存在服务器并使用独立强密码。
- 不向公网开放 5432、8000 或 3000。
- 部署前备份，部署后检查健康接口和核心页面。
- 代码回滚不等于数据库回滚；涉及迁移时必须有恢复方案。

## 13. 换电脑检查清单

离开当前电脑前运行 `git status` 和 `git push`，确认代码已推送、密钥不在暂存区，并判断测试数据是否需要单独导出。

在另一台电脑开始前：

```bash
git status
git switch main
git pull --ff-only origin main
```

重新创建 Python/Node 依赖和环境文件。不要复制 `.venv`、`node_modules`、`.next` 或 Docker 数据目录。

## 14. 常见问题

- Git 所有者不可信：只把实际项目绝对路径加入 `safe.directory`。
- Docker 找不到 `dockerDesktopLinuxEngine`：启动 Docker Desktop，等待 Linux Engine 就绪。
- `next-env.d.ts` 自动修改：检查是否只是 `.next/types` 与 `.next/dev/types` 切换，避免提交无意义差异。
- 新电脑没有旧电脑的学习数据：这是正常现象，GitHub 不同步数据库卷和上传文件。
- 拉取发生冲突：不要直接使用 `git reset --hard`；先检查并保存当前改动，再人工处理。

## 15. 推荐日常循环

```text
拉取 main
→ 创建短分支
→ 编码
→ 自动化测试
→ 桌面/移动端验收
→ 检查密钥和差异
→ 提交并推送
→ CI 通过
→ 合并 main
→ 生产备份
→ 阿里云拉取并重建
→ 健康检查
```

# 知闲跨电脑开发规范

本文用于规范知闲在不同电脑上的开发、测试、同步和部署。目标是让新电脑可以从 GitHub 重建开发环境，同时避免密钥、数据库和用户文件进入仓库。

进入仓库后先阅读根目录 `AGENTS.md`、`docs/README.md` 和 `docs/PROJECT_STATUS.md`。本文负责环境与同步流程；编码、测试、安全和词库规则分别以对应专项文档为准。

## 1. 核心原则

1. GitHub 是源代码的唯一同步中心，不用网盘、U 盘或复制整个项目目录同步代码。
2. 日常开发在本地完成；阿里云服务器只运行 `main` 的可部署版本。
3. `main` 必须保持可构建、可测试、可部署；较大功能使用短生命周期分支。
4. 运行时数据库、上传文件、备份和密钥必须独立管理；`data/wordlists` 中的规范化基础词库、manifest、报告和许可说明是版本资产，必须进入 Git。
5. 离开一台电脑前先提交并推送；换电脑后先拉取，再开始修改。
6. 密钥一旦进入 Git 历史，应立即撤销或轮换，不能只删除工作区文件。

## 2. 新电脑首次准备

安装 Git、Node.js 24、Python 3.13（或 Conda）和 Docker Desktop/Docker Engine。完成下一节克隆并进入仓库后，为本项目配置自己的 Git 身份，避免覆盖整台机器的全局身份：

```bash
git config --local user.name "<your-name>"
git config --local user.email "<your-email>"
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

如果出现 `detected dubious ownership`，又不希望写入全局信任列表，可以只对本次命令传入明确的项目绝对路径：

```bash
git -c safe.directory=D:/project/zhixian status
git -c safe.directory=D:/project/zhixian pull --ff-only origin main
```

在其他目录克隆时，把路径改成实际项目路径。`-c safe.directory=...` 只对当前这一条 Git 命令生效，不会修改全局 Git 配置；不要把整个磁盘或通配路径加入信任列表。

### 临时使用 Fine-grained PAT 推送

当 SSH 暂时不可用且不希望把 Token 写入凭据管理器时，可以使用仓库外的 Fine-grained PAT 文件临时推送。Token 至少需要对目标仓库授予 `Contents: Read and write`；只有提交包含 `.github/workflows/*` 时才需要 `Workflows: Read and write`。

以下 PowerShell 示例不修改现有 `origin`，不会把 Token 写入 Git 配置或命令历史。把示例路径替换成当前电脑的仓库外 Token 文件：

```powershell
$pat = (Get-Content -Raw -LiteralPath 'C:\安全目录\github-pat.txt').Trim()
$basic = [Convert]::ToBase64String(
  [Text.Encoding]::UTF8.GetBytes("x-access-token:$pat")
)
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'
$env:GIT_CONFIG_VALUE_0 = "AUTHORIZATION: basic $basic"

try {
  git -c safe.directory=D:/project/zhixian push `
    https://github.com/zhanghuiwan/zhixian.git main:main
} finally {
  Remove-Item Env:GIT_CONFIG_COUNT -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_CONFIG_KEY_0 -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_CONFIG_VALUE_0 -ErrorAction SilentlyContinue
  $pat = $null
  $basic = $null
}
```

Token 文件仍是高敏感凭证：只能保存在仓库外，不能提交、截图、打印或同步到公共网盘。Token 到期、泄露或电脑丢失时，应立即在 GitHub 撤销并重新生成。

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

日常启动按项目约定优先使用下一节的 Docker Compose。只有需要热更新、调试器或单服务排障时，才使用本节的源码进程。

后端首次安装和启动：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/api/requirements.txt
cd apps/api
Copy-Item .env.example .env
..\..\.venv\Scripts\python.exe -m alembic upgrade head
..\..\.venv\Scripts\python.exe -m app.db.seed
..\..\.venv\Scripts\python.exe -m app.db.import_wordlist `
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json `
  --apply
..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

源码开发默认使用 SQLite。本机 SQLite 数据不会通过 GitHub 同步，但上述导入命令会从 Git 内的数据包重建 7,416 个基础词条，不需要另行克隆 qwerty-learner。

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
# 如果本机访问 PyPI 很慢，可在 .env 中把 PIP_INDEX_URL 改为可信的 HTTPS 镜像
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost/api/v1/health
```

API 容器入口会自动执行 Alembic、seed 和词库数据包导入。导入是幂等的，重启容器不会重复创建单词。

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

第二阶段还可以在仓库根目录执行不输出凭证内容的真实厂商冒烟测试：

```powershell
$env:MINIMAX_API_KEY = (Get-Content -LiteralPath 'C:\安全目录\minimax.txt' -Raw).Trim()
$env:MINIMAX_MODEL = 'MiniMax-M3'
.\.venv\Scripts\python.exe scripts\verify_minimax.py
Remove-Item Env:MINIMAX_API_KEY
Remove-Item Env:MINIMAX_MODEL
```

该测试只输出连接、流式和 Tool Call 是否成功，不输出模型回答或 Key。真实测试必须使用仓库外文件，不能把 Key 放入测试代码、命令历史中的明文参数或 `.env.example`。

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

当前部署约定和后续预留路径：

```text
/opt/zhixian/data/uploads   # 当前 Compose 实际宿主机路径
/data/zhixian/audio         # 后续预留，尚未接入
/data/zhixian/temp          # 后续预留，尚未接入
/data/zhixian/backups
```

备份脚本默认从项目根目录的 `data/uploads` 归档上传文件，与 Compose 的相对挂载保持一致；数据库备份目录默认是 `/data/zhixian/backups`。

没有对象存储时，必须限制文件类型、大小、用户配额和临时文件保留时间，并至少每周把一份备份下载到另一台电脑。

## 12. 阿里云部署边界

服务器只部署 `main`：

```bash
cd /opt/zhixian
ZHIXIAN_BACKUP_DIR=/data/zhixian/backups \
bash scripts/update-production.sh
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

- Git 所有者不可信：优先用 `git -c safe.directory=<项目绝对路径> ...` 仅信任当前命令，不修改全局配置。
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

# 常见故障排查

最后核对：2026-09-07。先保留原始错误和运行环境，再按最小范围定位；不要以删除数据库、数据卷或依赖锁文件作为第一反应。

## 1. 通用信息收集

```bash
git status --short --branch
git log -3 --oneline
python --version
node --version
npm --version
```

有 Docker 时再运行：

```bash
docker --version
docker compose version
docker compose ps
```

报告错误时附命令、工作目录、退出码、关键报错和最近相关改动。删除 Token、邮箱、服务器地址和用户内容后再分享日志。

## 2. Python 版本或模块错误

症状：系统 `python` 仍是 3.9/3.10、`ModuleNotFoundError: app`、Pydantic/类型语法错误。

检查：

- 项目目标 Python 3.13；确认激活的是项目 venv/Conda，不是系统 Python。
- FastAPI 命令应从 `apps/api` 执行，因为 `pyproject.toml` 和相对 SQLite 路径位于这里。
- 从根目录 venv 调用时使用明确解释器，例如 `../../.venv/bin/python`。

重建环境时删除 venv 属于本地可重建操作，但先确认路径正是项目 `.venv`，不要递归删除宽泛目录。按 `development/README.md` 重装固定依赖。

## 3. `.env` 没有生效

后端 `Settings` 从当前后端工作目录的 `.env` 读取。本地源码运行需要：

```text
apps/api/.env
```

前端需要 `apps/web/.env.local`；Docker Compose 使用仓库根目录 `.env`。三个文件用途不同，不要用 Git 同步。

修改环境变量后重启对应进程/容器。不要用打印整个 settings 或 `env` 的方式排障，避免泄露凭证。

## 4. AI Key 无法保存或解密

常见原因：

- `AI_CREDENTIAL_ENCRYPTION_KEY` 为空或不是有效 Fernet Key；
- 恢复数据库后用了另一把主密钥；
- 修改 `.env` 后 API 未重启；
- 用户配置被绑定到不同用户/Provider。

生成新开发密钥的命令见 `.env.example`。新密钥不能解密旧密文；生产恢复必须使用原服务器密钥。遇到 409“无法解密”时，让用户重新输入 Provider Key，除非能够安全恢复原主密钥。

## 5. SQLite 测试或开发库异常

- 本地源码数据库默认是 `apps/api/zhixian.db`。
- 测试数据库是 `apps/api/test_zhixian.db`，fixture 会重建表。
- `database is locked` 通常说明仍有 API/测试进程持有连接；先停止相关进程，再重试。
- 不要删除有价值的开发数据来解决迁移问题；先复制备份并确认实际连接串。

测试绝不能指向生产 `DATABASE_URL`。

## 6. Alembic 或 PostgreSQL 启动失败

检查：

```bash
docker compose logs --tail=200 db
docker compose logs --tail=200 api
docker compose exec -T api alembic current
```

API 入口会先 `alembic upgrade head` 再 seed。失败常见于数据库未健康、`.env` 用户/密码不一致、旧数据违反新约束或迁移被改写。

不要手工把 Alembic 版本表改成 head。用生产副本复现，修复迁移或数据回填后重新演练。生产已写入新数据时不要直接 downgrade。

## 7. 前端无法请求 API

- 本地开发确认 API 在 `http://localhost:8000`，Web 在 `http://localhost:3000`。
- `NEXT_PUBLIC_API_URL` 默认 `/api/v1`；开发 rewrite 把 `/api/*` 转到 8000。
- 如果改过 `.env.local`，重启 `npm run dev`。
- 401：检查 Token 是否过期、`SECRET_KEY` 是否改变、用户是否有效。
- CORS：只有浏览器跨源直连 API 时相关；把实际可信来源加入后端 `CORS_ORIGINS`，不要使用通配符放宽生产。

`npm ci` 失败时先确认 Node 24 和 lockfile 未被手工破坏。不要随意删除 `package-lock.json` 后重新解析全部依赖。

## 8. SSE 对话无增量或中途断开

按顺序检查：

1. Provider 配置已启用且连接测试成功；
2. API 日志中的安全化错误类别；
3. `AI_PROVIDER_TIMEOUT_SECONDS`、步骤/工具/Token 上限；
4. Nginx `/api/` 的 `proxy_read_timeout` 和 `X-Accel-Buffering: no` 响应头；
5. 浏览器是否主动 Abort、切页或网络断开；
6. Provider 是否返回兼容的流式 Tool Call 分片。

不要通过无限增大超时或循环次数掩盖卡死。当前中止浏览器流不会形成通用后台任务取消。

## 9. Docker 命令不可用

症状：`docker: command not found` 或 Docker Desktop engine 未启动。

- 安装/启动 Docker Engine 或 Docker Desktop，等待引擎就绪。
- 没有 Docker 时仍可运行源码后端测试和前端 lint/build。
- 在交接中把 Compose 检查标为“未执行”，不要声称通过。
- 不运行 `docker compose down -v` 或 `docker system prune --volumes` 来排障，除非明确接受数据卷删除。

## 10. Docker 页面 502/504

```bash
docker compose ps
docker compose logs --tail=200 nginx
docker compose logs --tail=200 web
docker compose logs --tail=200 api
curl http://127.0.0.1/api/v1/health
```

- API unhealthy：先查迁移、数据库和必需环境变量。
- Web 未启动：查 `npm run build` 和 standalone 产物。
- SSE 超时：查 Nginx read timeout、Provider 响应和 API worker 状态。
- 只重启失败服务前先保存日志；反复重建镜像不会修复数据或配置错误。

## 11. 备份没有包含上传文件

当前 Compose 使用 `/opt/zhixian/data/uploads`（即仓库相对 `./data/uploads`），而脚本默认源目录是 `/data/zhixian/uploads`。在代码统一挂载前，生产执行备份必须显式设置：

```bash
POSTGRES_USER=zhixian \
POSTGRES_DB=zhixian \
ZHIXIAN_UPLOAD_DIR=/opt/zhixian/data/uploads \
bash scripts/backup.sh
```

并按 `DEPLOYMENT.md` 显式传入与根 `.env` 一致的 `POSTGRES_USER`、`POSTGRES_DB`；不要把 Docker env 文件直接当 shell 脚本加载。检查生成的上传 tar 包内容和恢复结果，而不只看命令退出码。

## 12. qwerty-learner 看不到词典文件

本机参考仓库使用 partial clone + sparse checkout，默认只检出元数据文件，这是正常现象。

```bash
git -C ../qwerty-learner status --short --branch
git -C ../qwerty-learner ls-tree -r --name-only \
  122acd90b4079dd040c28a14356447f6553cff83 public/dicts
```

用 `git show <commit>:<path>` 按需读取单个词典，或调整 sparse checkout。导入规范见 `WORDLIST_PIPELINE.md`。不要直接从浮动 `master` 写生产数据库。

## 13. Git 跨电脑问题

- 开工前 `git pull --ff-only`，离开电脑前确认提交已 push。
- `dubious ownership` 使用 `git -c safe.directory=<明确仓库路径> ...`，不要信任整块磁盘。
- 有冲突时先保存并理解本地改动，不使用 `git reset --hard` 清场。
- 未提交文件不会自动出现在另一台电脑；GitHub 也不同步 `.env`、数据库、上传或 Docker volume。

## 14. 仍无法解决时

按 `TASK_HANDOFF.md` 记录最小复现、期望/实际、完整安全化错误、已尝试步骤、Git 提交、环境版本和未触碰的数据。明确哪些操作因可能破坏数据而没有执行。

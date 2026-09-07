# 阿里云单机部署

最后核对：2026-09-08。本文描述当前手工发布方案；仓库尚未配置域名、TLS 或自动生产部署。执行生产操作前先阅读 `SECURITY.md`。

## 1. 服务器准备

建议最低 2 核 4GB、Ubuntu 22.04/24.04，并安装 Git、Docker Engine 和 Docker Compose 插件。开放安全组端口 22、80、443；数据库端口不对公网开放。

## 2. 首次部署

```bash
sudo mkdir -p /opt/zhixian /data/zhixian/backups
sudo chown -R "$USER":"$USER" /opt/zhixian /data/zhixian
git clone https://github.com/zhanghuiwan/zhixian.git /opt/zhixian
cd /opt/zhixian
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
python3 -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

编辑 `.env`：

- 为 `POSTGRES_PASSWORD` 设置独立强密码；当前 Compose 会把它直接插入数据库 URL，暂时使用足够长的 URL-safe 字符（字母、数字、`-`、`_`），避免 `: / @ ? # %` 等保留字符导致连接串解析错误；
- 把 `openssl` 输出写入 `SECRET_KEY`；
- 把 Python 命令输出写入 `AI_CREDENTIAL_ENCRYPTION_KEY`。

`AI_CREDENTIAL_ENCRYPTION_KEY` 用来加密用户配置的 DeepSeek、MiniMax 等 API Key。丢失后数据库内的厂商 Key 无法解密，必须在安全的离线位置单独备份，且不能提交 GitHub。

然后运行：

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1/api/v1/health
docker compose exec -T api alembic current
```

当前数据库版本应显示 `0004 (head)`。API 容器入口会在迁移和 seed 后，自动校验并幂等导入 Git 内的 `zhixian-core-en-v1` 数据包。新服务器的空 PostgreSQL volume 应得到 7,416 个词书成员；无需在服务器另行克隆 qwerty-learner。

生产环境保持 `CREATE_DEMO_USER=false`，通过注册页创建账号，避免公开默认密码。

首次对公网开放前还必须确认：

- 域名解析和 HTTPS 终止方案已完成并能自动续期；
- 安全组只开放必要的 22/80/443，22 限制管理来源；
- 5432、8000、3000 未映射到公网；
- `.env`、数据库 volume、上传目录和备份目录权限正确；
- 至少一份数据库备份和 `AI_CREDENTIAL_ENCRYPTION_KEY` 的离线副本可恢复；
- `main` 对应提交的后端测试、前端 lint/build 和 Compose 检查已通过。

## 3. 更新部署

```bash
cd /opt/zhixian
POSTGRES_USER=zhixian \
POSTGRES_DB=zhixian \
ZHIXIAN_UPLOAD_DIR=/opt/zhixian/data/uploads \
bash scripts/backup.sh
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl http://127.0.0.1/api/v1/health
docker compose exec -T api alembic current
```

第二阶段发布前必须确认服务器原有 `AI_CREDENTIAL_ENCRYPTION_KEY` 已备份，不要重新生成并覆盖，否则旧的用户模型 Key 将无法解密。更新后再次检查容器状态、Alembic 版本和健康接口。

部署前建议先执行备份。生产服务器不要直接编辑仓库文件；所有代码改动从本地推送 GitHub。

确认新版本稳定后才清理未使用镜像；保留至少一个已知可用版本以便快速恢复。发布时记录部署时间、Git SHA、迁移前后版本、备份文件和验证结果。

## 4. HTTPS

仓库内 Nginx 配置当前只提供 HTTP。绑定域名后必须选择并实现一种明确方案：宿主机 Nginx + Certbot、Compose 中的 Caddy，或阿里云负载均衡/证书服务。方案需要覆盖证书自动续期、HTTP 到 HTTPS 跳转、SSE 长连接、安全响应头和配置备份。

在实现和实机验证前，不把“计划使用 Certbot/Caddy”写成已经启用。正式公开注册、登录或用户 API Key 设置前必须启用 HTTPS，否则 Bearer Token 和敏感请求可能在网络中泄露。

## 5. 备份

```bash
cd /opt/zhixian
POSTGRES_USER=zhixian \
POSTGRES_DB=zhixian \
ZHIXIAN_UPLOAD_DIR=/opt/zhixian/data/uploads \
bash scripts/backup.sh
```

`scripts/backup.sh` 直接读取宿主机的 `POSTGRES_USER`、`POSTGRES_DB`，而 Compose 的 `.env` 不会自动成为脚本环境变量。上例按模板默认值显式传入；如果生产 `.env` 改过用户名或库名，必须把命令中的值改成完全一致的非占位值。不要直接 `source .env`，因为 Docker env 文件不保证是安全的 shell 脚本。

当前 Compose 把上传目录挂载为宿主机 `/opt/zhixian/data/uploads`，脚本默认值则是 `/data/zhixian/uploads`，所以必须显式传入 `ZHIXIAN_UPLOAD_DIR`。正式启用文件上传前应在代码中统一路径并更新本文。

使用 cron 每日运行：

```cron
20 3 * * * cd /opt/zhixian && POSTGRES_USER=zhixian POSTGRES_DB=zhixian ZHIXIAN_UPLOAD_DIR=/opt/zhixian/data/uploads /usr/bin/bash scripts/backup.sh >> /var/log/zhixian-backup.log 2>&1
```

备份保存在 `/data/zhixian/backups`，默认保留 14 天。还应每周下载一份到本地；单服务器上的备份无法防止整块云盘故障。数据库备份不包含 `.env`，因此必须另外安全备份 `AI_CREDENTIAL_ENCRYPTION_KEY`，不要把完整 `.env` 放进公开网盘或 Git 仓库。

定期检查备份文件非空、上传压缩包包含预期文件，并在隔离环境做恢复演练。磁盘快照不能替代可验证的逻辑备份。

## 6. 恢复数据库

```bash
cd /opt/zhixian
gunzip -c /data/zhixian/backups/db_YYYYmmdd_HHMMSS.sql.gz | \
  docker compose exec -T db psql -U zhixian -d zhixian
```

如果生产修改了 `POSTGRES_USER` 或 `POSTGRES_DB`，将恢复命令中的两个 `zhixian` 替换为生产实际值。

恢复前先停止 Web/API 写入并再次备份当前数据库。

在生产执行恢复前，先在隔离 PostgreSQL 中验证备份；确认目标数据库、时间点、对应代码提交和 `AI_CREDENTIAL_ENCRYPTION_KEY`。恢复数据库不会自动恢复 `.env`、上传文件或加密主密钥。

## 7. 发布回滚

代码回滚与数据库回滚分开：

1. 部署前记录旧 Git SHA、Alembic head 和备份路径。
2. 若新版本没有不可兼容迁移，可临时部署已知可用 SHA，并尽快通过正常分支修复 `main`。
3. 若迁移改变/删除数据，不自动执行 `alembic downgrade`；停止写入，评估用部署前备份恢复数据库和配套上传文件。
4. 回滚后检查登录、健康接口、学习队列、文章、AI 配置解密和核心写操作。

不得在未确认工作树干净、提交 SHA 和备份可用时用 `git reset --hard` 处理生产故障。

## 8. 日志与故障排查

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 web
docker compose logs --tail=200 db
```

健康检查：`GET /api/v1/health`。如果服务器内存较小，可配置 2–4GB Swap，但不应在服务器本地运行大型模型。

日志不得上传完整 `.env`、Authorization header、用户对话、API Key 或数据库导出。进一步排查见 `TROUBLESHOOTING.md`。

## 9. 发布后验收

- `docker compose ps` 全部预期服务 healthy/running；
- `/api/v1/health` 返回 ok；
- Alembic 为发布预期 head；
- `zhixian-core-en-v1` 已发布且包含 7,416 个成员；
- HTTPS 证书、跳转和续期状态正常；
- 注册/登录策略符合当前环境，演示账号关闭；
- Web 首页、登录、学习队列、文章和仪表盘可用；
- 配置了 Provider 的测试账号能安全解密并完成最小连接测试；
- Nginx SSE 不缓冲，长对话无异常 504；
- 数据库和上传目录使用预期持久化位置；
- 备份任务下一次执行时间、异地副本和磁盘容量已检查。

## 10. 当前未完成的生产项

- 域名、TLS 终止和自动续期尚未在仓库落地；
- 发布仍为手工流程，没有 CD；
- 上传挂载与备份默认路径尚未在代码中统一；
- 没有集中日志、告警和服务级指标；
- 没有托管数据库或跨主机高可用。

这些限制适合当前个人/小规模定位，但必须在公开服务扩展前重新评估。

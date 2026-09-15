# 阿里云单机部署

最后核对：2026-09-14。当前生产方案使用 GitHub `main` 作为唯一代码来源：宿主机 Nginx 继续承载现有站点，并把 `zhixian.zhanghuiwan.com` 反向代理到只监听 `127.0.0.1:8080` 的 Docker Compose 服务。PostgreSQL 数据保存在命名卷 `zhixian_postgres_data`，更新代码和重建容器不会删除该卷。

## 架构与目录

- `/opt/zhixian`：从 GitHub 克隆的生产代码，只跟踪 `main`，服务器上不直接修改源码；
- `/opt/zhixian/.env`：生产密钥和运行参数，不进入 Git；
- `zhixian_postgres_data`：PostgreSQL 命名卷；
- `/opt/zhixian/data/uploads`：上传文件；
- `/data/zhixian/backups`：数据库和上传文件备份；
- `127.0.0.1:8080`：Compose 内 Nginx 的宿主机入口；
- `80/443`：宿主机 Nginx 的公网入口。

## 首次部署

服务器需要 Git、Docker Engine、Docker Compose 插件和宿主机 Nginx。仓库提供的宿主机配置为 `deploy/zhixian.nginx.conf`。

```bash
sudo mkdir -p /opt/zhixian /data/zhixian/backups
sudo git clone --branch main --single-branch https://github.com/zhanghuiwan/zhixian.git /opt/zhixian
cd /opt/zhixian
sudo cp .env.example .env
sudo chmod 600 .env
```

生产 `.env` 至少需要修改：

```dotenv
PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/
POSTGRES_PASSWORD=<URL-safe 强密码>
SECRET_KEY=<随机密钥>
AI_CREDENTIAL_ENCRYPTION_KEY=<Fernet 兼容密钥>
CORS_ORIGINS=https://zhixian.zhanghuiwan.com
CREATE_DEMO_USER=false
NGINX_BIND_ADDRESS=127.0.0.1
NGINX_HTTP_PORT=8080
WEB_CONCURRENCY=1
```

可用以下命令生成密钥。`POSTGRES_PASSWORD` 使用 URL-safe 字符，避免数据库连接串解析歧义。

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
python3 -c "import secrets; print(secrets.token_hex(32))"
python3 -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

`AI_CREDENTIAL_ENCRYPTION_KEY` 用来加密用户配置的模型 API Key。必须单独安全备份；丢失后数据库中的厂商 Key 无法解密。

构建和启动：

```bash
cd /opt/zhixian
sudo mkdir -p data/uploads /data/zhixian/backups
sudo docker compose build api
sudo docker compose build web
sudo docker compose up -d --wait
sudo docker compose ps
curl --fail http://127.0.0.1:8080/api/v1/health
sudo docker compose exec -T api alembic current
```

API 容器启动时自动执行 Alembic 迁移、seed 和词书幂等导入。空数据库会创建系统预设词书、默认文章；用户注册后会得到示例句子收藏。

当前应用迁移 head 为 `0007`。该迁移给旧 AI 会话补充 `manual` 类型，并新增按用户本地日期唯一的默认会话。发布前必须先备份数据库；此迁移不提供有损降级，回退代码时应恢复升级前备份。

安装宿主机 Nginx 配置：

```bash
sudo install -m 644 deploy/zhixian.nginx.conf /etc/nginx/sites-available/zhixian.conf
sudo ln -sfn /etc/nginx/sites-available/zhixian.conf /etc/nginx/sites-enabled/zhixian.conf
sudo nginx -t
sudo systemctl reload nginx
curl --fail -H 'Host: zhixian.zhanghuiwan.com' http://127.0.0.1/api/v1/health
```

## 域名与 HTTPS

在阿里云 DNS 控制台为 `zhanghuiwan.com` 添加记录：记录类型 `A`，主机记录 `zhixian`，记录值填写 ECS 公网 IPv4。等待解析生效后检查：

```bash
dig +short zhixian.zhanghuiwan.com
curl --fail http://zhixian.zhanghuiwan.com/api/v1/health
```

然后在服务器安装 Certbot 并签发证书。命令会询问邮箱和服务条款，因此由服务器管理员交互执行：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d zhixian.zhanghuiwan.com --redirect
sudo nginx -t
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
curl --fail https://zhixian.zhanghuiwan.com/api/v1/health
```

证书签发前只适合做 HTTP 连通性验证，不应通过公网提交密码、Token 或模型 API Key。

## 更新生产服务

本地开发完成后，先把代码合并并推送到 GitHub `main`。由于当前服务器只有 2GB 内存且没有 Swap，Web 生产构建在开发机按 Linux AMD64 完成；服务器仍会自行从 GitHub 拉取并核对完全相同的 `main` 提交。开发机执行：

```bash
git switch main
git pull --ff-only origin main
bash scripts/deploy-production.sh
```

本地脚本会拒绝非 `main` 分支、有改动的工作树或未与 `origin/main` 对齐的提交。它构建并传输 AMD64 Web 镜像；服务器随后从 GitHub 快进到同一 SHA，执行数据库和上传文件备份，构建 API，使用已核验架构的 Web 镜像，启动服务并检查 Compose 和 Alembic 状态。可用 `ZHIXIAN_DEPLOY_HOST` 覆盖默认 SSH 别名 `aliyun`。

服务器脚本 `scripts/update-production.sh` 是这个流程的内部步骤。内存小于 3GB 时，如果没有传入预构建镜像标签，它会主动停止，避免服务器再次因 Web 构建失去响应。

不要运行 `docker compose down -v`、`docker volume rm zhixian_postgres_data` 或更改 Compose 项目名；这些操作会删除或脱离现有数据库卷。普通的 `docker compose up -d --build`、容器重建和 `docker compose down` 会保留命名卷。

## 自动备份

手动备份：

```bash
cd /opt/zhixian
sudo ZHIXIAN_BACKUP_DIR=/data/zhixian/backups bash scripts/backup.sh
sudo find /data/zhixian/backups -maxdepth 1 -type f -size +0 -ls
```

脚本从数据库容器读取实际的 `POSTGRES_USER` 和 `POSTGRES_DB`，不需要 `source .env`。上传目录默认对应 Compose 的 `/opt/zhixian/data/uploads`。数据库压缩包通过完整性和非空检查后才成为正式备份，默认保留 14 天。

每日备份可写入 `/etc/cron.d/zhixian-backup`：

```cron
20 3 * * * root cd /opt/zhixian && ZHIXIAN_BACKUP_DIR=/data/zhixian/backups /usr/bin/bash scripts/backup.sh >> /var/log/zhixian-backup.log 2>&1
```

至少定期把一份备份和 `AI_CREDENTIAL_ENCRYPTION_KEY` 保存到服务器之外。数据库备份不包含 `.env`。

恢复前先停止 API 写入并再次备份。使用数据库容器的实际环境变量恢复：

```bash
gunzip -c /data/zhixian/backups/db_YYYYmmdd_HHMMSS.sql.gz | \
  sudo docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 验收和排查

```bash
cd /opt/zhixian
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
sudo docker compose ps
sudo docker compose logs --tail=200 api
curl --fail http://127.0.0.1:8080/api/v1/health
sudo docker compose exec -T api alembic current
sudo docker volume inspect zhixian_postgres_data
```

`alembic current` 当前应输出 `0007 (head)`；若不是，不继续开放流量，先检查 API 启动日志和数据库备份。

发布后还应验证注册、登录、主页 AI 对话、词书、学习队列、文章划词、句子收藏和学习记录。服务器资源有限时保持 `WEB_CONCURRENCY=1`；生产服务器不运行本地大模型。

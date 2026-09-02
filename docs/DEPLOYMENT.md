# 阿里云单机部署

## 1. 服务器准备

建议最低 2 核 4GB、Ubuntu 22.04/24.04，并安装 Git、Docker Engine 和 Docker Compose 插件。开放安全组端口 22、80、443；数据库端口不对公网开放。

## 2. 首次部署

```bash
sudo mkdir -p /opt/zhixian /data/zhixian/uploads /data/zhixian/backups
sudo chown -R "$USER":"$USER" /opt/zhixian /data/zhixian
git clone https://github.com/<your-account>/zhixian.git /opt/zhixian
cd /opt/zhixian
cp .env.example .env
openssl rand -hex 32
python3 -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

编辑 `.env`：

- 为 `POSTGRES_PASSWORD` 设置独立强密码；
- 把 `openssl` 输出写入 `SECRET_KEY`；
- 把 Python 命令输出写入 `AI_CREDENTIAL_ENCRYPTION_KEY`。

`AI_CREDENTIAL_ENCRYPTION_KEY` 用来加密用户配置的 DeepSeek、MiniMax 等 API Key。丢失后数据库内的厂商 Key 无法解密，必须在安全的离线位置单独备份，且不能提交 GitHub。

然后运行：

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1/api/v1/health
```

生产环境保持 `CREATE_DEMO_USER=false`，通过注册页创建账号，避免公开默认密码。

## 3. 更新部署

```bash
cd /opt/zhixian
git pull --ff-only origin main
docker compose up -d --build
docker image prune -f
```

部署前建议先执行备份。生产服务器不要直接编辑仓库文件；所有代码改动从本地推送 GitHub。

## 4. HTTPS

仓库内 Nginx 配置默认提供 HTTP。绑定域名后可在宿主机使用 Certbot，或增加专门的 Caddy 容器自动申请证书。正式公开注册功能前必须启用 HTTPS，否则登录令牌可能在网络中泄露。

## 5. 备份

```bash
cd /opt/zhixian
bash scripts/backup.sh
```

使用 cron 每日运行：

```cron
20 3 * * * cd /opt/zhixian && /usr/bin/bash scripts/backup.sh >> /var/log/zhixian-backup.log 2>&1
```

备份保存在 `/data/zhixian/backups`，默认保留 14 天。还应每周下载一份到本地；单服务器上的备份无法防止整块云盘故障。数据库备份不包含 `.env`，因此必须另外安全备份 `AI_CREDENTIAL_ENCRYPTION_KEY`，不要把完整 `.env` 放进公开网盘或 Git 仓库。

## 6. 恢复数据库

```bash
gunzip -c /data/zhixian/backups/db_YYYYmmdd_HHMMSS.sql.gz | \
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

恢复前先停止 Web/API 写入并再次备份当前数据库。

## 7. 日志与故障排查

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 web
docker compose logs --tail=200 db
```

健康检查：`GET /api/v1/health`。如果服务器内存较小，可配置 2–4GB Swap，但不应在服务器本地运行大型模型。

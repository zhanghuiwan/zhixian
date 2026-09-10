# 安全规范

最后核对：2026-09-10。本文记录当前安全边界和开发/部署必须遵守的控制，不替代针对公开服务的正式安全审计。

## 1. 保护对象

| 等级 | 示例 | 处理要求 |
|---|---|---|
| 高敏感 | 密码、JWT、用户 Provider API Key、`SECRET_KEY`、`AI_CREDENTIAL_ENCRYPTION_KEY`、数据库密码 | 只在必要的后端内存或服务器秘密文件中出现，不记录、不提交、不下发 |
| 私有数据 | 学习记录、生词、自定义词所有权、收藏、对话、生成文章、长期偏好 | 严格按用户隔离，备份加密并限制访问 |
| 内部运维 | 服务器 IP、日志、备份路径、部署记录、错误详情 | 最小权限、脱敏、限制保留期 |
| 公共数据 | 已发布词书、公共文章、公开静态资源 | 发布前仍需检查来源、授权和恶意内容 |

## 2. 当前信任边界

```text
Browser (untrusted input, JWT)
  → Nginx (public edge, TLS required in production)
    → FastAPI (authentication, validation, ownership)
      → PostgreSQL (private network only)
      → approved AI provider endpoints (outbound, user-scoped key)
```

浏览器、模型输出、外部词库、上传文件和 Provider 响应全部是不可信输入。只有经过 schema、所有权和领域规则校验后才能影响数据库或导航。

## 3. 凭证与环境变量

允许提交的只有模板：

```text
.env.example
apps/api/.env.example
apps/web/.env.example
```

禁止提交真实 `.env`、Key、Token、密码、数据库、备份或凭证截图。

生产至少需要独立生成：

- `POSTGRES_PASSWORD`：数据库强密码；当前 Compose 直接拼接连接 URL，部署时先使用足够长的 URL-safe 随机字符，避免 URL 保留字符造成认证值歧义；
- `SECRET_KEY`：JWT 签名密钥；
- `AI_CREDENTIAL_ENCRYPTION_KEY`：Fernet 兼容密钥，用于加密用户 Provider Key。

三者用途不同，不能复用。生产值不得沿用示例或本地值。`.env` 权限限制为部署用户可读，并与数据库备份分开安全备份。

`AI_CREDENTIAL_ENCRYPTION_KEY` 丢失后，已保存的用户 Provider Key 无法解密；泄露后需要轮换并设计密文重加密流程，不能只替换环境变量。

`NEXT_PUBLIC_*` 会进入浏览器产物，永远按公开信息处理。

## 4. 认证与会话

- 密码使用 bcrypt 哈希，明文不保存。
- JWT 使用 HS256 和 `sub=user_id`，默认有效期 10080 分钟（7 天）。
- 所有私有 API 使用 Bearer Token；无效、过期或停用用户返回 401。
- 当前前端把 JWT 存在 localStorage。这降低了实现复杂度，但令 Token 暴露于成功的 XSS，因此禁止插入未清理 HTML，并应在生产增加严格 CSP、安全响应头和依赖审查。
- 公开规模扩大时评估短期访问令牌、刷新/撤销机制和 Secure + HttpOnly + SameSite Cookie。改变会话机制属于架构变更，需兼顾 CSRF。
- 登录接口当前没有限流、锁定、邮箱验证或找回密码；公开服务前至少在 Nginx/API 层增加合理限流和监控。

## 5. 授权与用户隔离

- 用户私有资源查询必须同时验证资源 ID 和 `current_user.id`。
- 子资源必须通过父资源或直接 `user_id` 证明归属。
- 对他人资源优先返回 404，避免枚举存在性。
- 所有列表、统计和导出都要按用户过滤；聚合查询同样不能漏掉条件。
- 测试使用至少两个用户覆盖读取、写入、删除和 Agent 工具。
- 管理员能力当前不存在。不要通过硬编码邮箱、特殊 ID 或隐藏参数绕过所有权。
- `words` 的全局去重不代表全部词条公开。自定义词必须通过 `user_custom_words` 验证当前用户所有权；查词、按 ID 加生词、个人词书和评分接口都必须重复执行该检查。

## 6. AI Provider 与 Agent

- 用户 API Key 只从浏览器提交到后端一次；读取接口只返回掩码末四位。
- 密文绑定用户和 Provider，不能复制给另一用户/厂商解密。
- Provider `base_url` 来自代码白名单，禁止任意 URL，防止 SSRF 和凭证外送。
- 日志、审计、异常、SSE、数据库 fixture 和 mock 断言都不得包含完整 Key。
- 模型输出不是授权。工具名和参数需白名单/Pydantic 校验，数据库服务再次验证用户所有权。
- 删除等破坏性写入要求确认；确认端点执行数据库中锁定的已校验参数。
- 工具轮数、数量、Token 和超时保持上限，避免失控费用和拒绝服务。
- Prompt injection 不能获得任意 SQL、HTTP、文件系统或代码执行工具。
- 跨会话检索必须经 `ai_conversations.user_id` 绑定当前用户，并限制结果条数和单条长度；不能让模型提供任意用户 ID 或绕过所有权。

## 7. API、CORS 与网络

- 生产只公开 80/443；22 仅限管理来源。5432、8000、3000 留在 Docker 内部网络。
- 正式登录和 API Key 配置前必须启用 HTTPS；HTTP 会暴露 Bearer Token。
- `CORS_ORIGINS` 只配置实际可信站点，不使用 `*` 配合凭证。
- Nginx 保持请求体限制、连接/读取超时，并为 SSE 禁用代理缓冲。
- 生产添加 HSTS（确认 HTTPS 稳定后）、CSP、`X-Content-Type-Options`、合适的 frame/referrer 策略。
- 健康检查不返回配置、版本控制详情或数据库内容。

## 8. 输入、内容和未来上传

- 所有 API 输入声明长度、类型、枚举和范围；数据库再用唯一约束/外键防守。
- 输出到 HTML 的外部内容按文本渲染，不使用未经消毒的 `dangerouslySetInnerHTML`。
- 外部词库过滤控制字符、HTML/script、超长字段和异常 Unicode，详见 `WORDLIST_PIPELINE.md`。
- PDF/OCR/图片上传启用前必须实现：扩展名与 MIME 双检、大小/页数限制、随机存储名、目录穿越防护、用户配额、隔离处理、超时、临时文件清理和恶意文件策略。
- 上传文件不得由 Nginx 直接按用户提供的内容类型执行或内联展示。

## 9. 日志、审计和隐私

允许记录：请求路径、状态码、耗时、内部请求/会话 ID、工具名、结果状态和安全化错误类别。

禁止记录：

- Authorization header、JWT、密码、API Key、Cookie；
- 完整 `.env`、数据库连接串中的密码；
- 用户对话/上传正文（除非有明确、最小化且告知的调试策略）；
- Provider 原始错误中可能回显的请求头或敏感正文。

日志和 `ai_tool_runs` 的保留/删除政策在开放多用户前需要确定。用户删除请求应覆盖业务数据、AI 对话、备份保留窗口和无法即时清除的审计数据说明。

## 10. 依赖与供应链

- Python 使用固定 `requirements.txt`，Node 使用提交的 `package-lock.json` 和 `npm ci`。
- GitHub Actions 使用明确主版本；高安全要求时可进一步固定 action commit SHA。
- 新依赖评估维护活跃度、已知漏洞、许可证、安装脚本和必要性。
- 不执行来源不明的安装脚本、词库转换器或模型生成命令。
- qwerty-learner 只按固定提交读取候选数据，不跟随浮动分支直接进入生产。

## 11. 备份与生产权限

- 数据库备份和上传备份属于高敏感数据；限制目录权限并加密异地副本。
- 数据库与 `AI_CREDENTIAL_ENCRYPTION_KEY` 分开存放，但两者都必须可恢复。
- 恢复演练使用隔离环境，不能覆盖生产来“测试”。
- 阿里云日常部署用户不应共享 root 凭证；SSH 使用密钥、最小安全组和操作审计。
- 不把服务器私钥、云 AccessKey 或完整 `.env` 放进 GitHub、聊天、公共网盘或构建镜像。

## 12. 泄露与事件处理

发现疑似泄露时：

1. 立即停止继续输出或传播敏感值；
2. 确定凭证种类、暴露范围、日志/Git 历史和使用时间；
3. 先撤销/轮换 Token、Provider Key、数据库密码或签名密钥；
4. 清理工作区和公开位置。仅从最新提交删除不足以清除 Git 历史；
5. 检查异常登录、Provider 用量、数据库和工具审计；
6. 记录事件、影响和后续防护，但记录中不再次粘贴秘密；
7. 必要时通知受影响用户。

不得为了隐藏泄露擅自重写共享 Git 历史；先与仓库所有者协调撤销和历史清理方案。

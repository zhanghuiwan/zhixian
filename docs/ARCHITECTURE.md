# 架构设计

最后核对：2026-09-09。当前完成度和已知限制见 [项目状态](PROJECT_STATUS.md)，表级细节见 [数据模型](DATA_MODEL.md)。

## 1. 总体方案

项目采用单仓库、模块化单体架构，适合个人维护和单台阿里云服务器部署。

```text
浏览器
  │
  ▼
Nginx :80/:443
  ├── /       → Next.js Web
  └── /api/*  → FastAPI API
                    ├── PostgreSQL
                    └── DeepSeek / MiniMax / 后续模型厂商
```

本地开发默认使用 SQLite；生产环境通过 `DATABASE_URL` 使用 PostgreSQL。SQLAlchemy 屏蔽数据库差异，业务层不需要分叉。

## 2. 技术选择

| 层 | 技术 | 原因 |
|---|---|---|
| Web | Next.js、React、TypeScript | 响应式体验、路由清晰、生态成熟 |
| API | FastAPI、Pydantic | AI/PDF/OCR 的 Python 生态好，接口文档自动生成 |
| ORM | SQLAlchemy 2 | 支持 SQLite/PostgreSQL，事务边界明确 |
| 数据库 | 开发 SQLite、生产 PostgreSQL | 降低本地门槛，同时保留生产可靠性 |
| 认证 | JWT Bearer + bcrypt | 第一阶段足够轻量，后续可替换为更完整会话体系 |
| 部署 | Docker Compose + Nginx | 单机成本低、环境可重复、数据卷可持久化 |

## 3. 后端模块

- `api/routes`：HTTP 路由、鉴权和参数边界
- `models`：用户、词典、词书、学习状态、文章、收藏等实体
- `schemas`：请求响应契约
- `services`：复习算法和领域逻辑
- `db`：连接、会话、初始化和种子数据
- `core`：配置、安全和共享依赖

## 4. 数据模型边界

- `words` 保存全局词典条目，不存放用户进度。
- `wordbooks` 与 `wordbook_words` 描述系统词书和顺序；六本来源预设共享同一全局词典，合并记录只承担可重建导入。
- `wordlist_sources` 与 `wordlist_source_entries` 保存固定上游文件及每个词的来源位置，支持去重后溯源。
- `user_word_progress` 保存每位用户每个单词的间隔、熟练度和下次复习时间。
- `vocabulary_items` 保存用户拥有某个生词的事实，`vocabulary_collections` 将这些生词组织为独立个人词书。
- `articles`、`article_sentences` 保存公共阅读内容。
- `sentence_bookmarks` 保存用户句子收藏及稳定文本/来源快照。
- `reading_progress` 和 `reading_activity` 分别保存跨设备阅读位置与自然日阅读事实。
- `study_reviews` 保存评分历史、当次词书来源和幂等结果，支持日历与 AI 分析。

## 5. 复习算法

第一阶段使用可解释的 SM-2 风格算法。评分映射为：忘记 0、困难 2、认识 4、简单 5。系统根据评分更新重复次数、难度因子、间隔天数与下次复习日期。AI 后续可以建议参数或学习量，但基础算法始终可独立运行。

## 6. AI 扩展边界

第二阶段通过 Provider 适配层统一 DeepSeek、MiniMax 等厂商。用户 API Key 由服务端使用 `AI_CREDENTIAL_ENCRYPTION_KEY` 加密后按用户保存，读取接口只返回末四位掩码，完整 Key 不下发浏览器。厂商官方地址由服务端白名单控制。

Agent 只调用注册过的领域工具，不提供任意 SQL、任意 HTTP 或文件系统能力。模型产生的工具参数必须经过 Pydantic 校验；学习历史由数据库实时查询，模型不能作为事实来源。高风险写操作需要确认，所有写操作最终通过领域服务和数据库事务执行。

完整设计见 [第二阶段：知闲学习 Agent](phase-2/README.md)。

## 7. 文件与备份

当前方案无对象存储，数据库使用 Docker Volume。按标准 `/opt/zhixian` 部署时，Compose 将容器 `/data/uploads` 映射到宿主机 `/opt/zhixian/data/uploads`；备份输出到 `/data/zhixian/backups`，再定期下载到本地或配合阿里云磁盘快照。第一阶段尚未开放文件上传，但目录与部署挂载已预留。

注意：当前 `compose.yaml` 实际把 API 的 `/data/uploads` 挂载到宿主机仓库相对路径 `./data/uploads`，而备份脚本默认读取宿主机 `/data/zhixian/uploads`。在代码统一前，生产按 [部署文档](DEPLOYMENT.md) 显式将 `ZHIXIAN_UPLOAD_DIR` 指向 `/opt/zhixian/data/uploads`。启用上传前必须关闭这个差异。

## 8. 关键请求流

### 普通业务请求

```text
Page / Component
  → apps/web/lib/api.ts（API prefix + Bearer Token）
  → Nginx /api/*
  → FastAPI route + Pydantic + get_current_user
  → domain service / SQLAlchemy Session
  → SQLite（本地）或 PostgreSQL（生产）
  → Pydantic response
```

用户私有数据的权限在 API/服务查询中按 `current_user.id` 强制执行，不能只依靠前端隐藏入口。

### Agent 请求

```text
Assistant page
  → POST /api/v1/ai/chat/stream
  → 持久化 user message
  → 有界 Agent loop
      → 解密当前用户 Provider Key
      → 发送最近上下文 + 工具 schema
      → 校验 Tool Call
      → 领域服务查询/写入/等待确认
      → 持久化 message + tool audit
  → SSE events
  → 前端增量渲染并可从数据库恢复
```

模型不是权限主体，也不是学习事实源。Provider 适配、工具清单和记忆细节见 `phase-2/AGENT_IMPLEMENTATION.md`。

### 离线词库导入

```text
固定 qwerty-learner commit
  → 规范化、合并和去重
  → Git manifest + JSONL 数据包 + SHA-256
  → 新环境启动时校验 7,416 个唯一英文词条
  → 单事务写入 words / wordbook_words / wordlist_source_entries
  → 隐藏合并导入载体，发布六本来源预设并迁移原合并词书选择
  → SQLite（本地）或 PostgreSQL（Docker / 生产）
```

业务请求只查询数据库。JSONL 只在初始化/更新时读取；Docker API 入口会在迁移和 seed 后幂等导入。相邻 qwerty-learner 目录只用于可选的上游重建核对，不是新电脑或生产环境依赖。

## 9. 开发与生产差异

| 项目 | 本地源码 | Docker / 生产 |
|---|---|---|
| 数据库 | SQLite 文件 | PostgreSQL 17 volume |
| 建表 | development/test lifespan 可 `create_all` | 容器入口必须 `alembic upgrade head` |
| Seed / 词库 | 手工 seed 和数据包导入 | API 容器启动自动幂等执行 |
| Web API | Next.js rewrite 到 `localhost:8000` | 同源 `/api/v1` 经 Nginx |
| 进程 | uvicorn reload + next dev | 多 worker API + Next standalone |
| TLS | 可用 HTTP localhost | 公开登录前必须 HTTPS，目前仓库未内置终止方案 |

所有结构变化以 Alembic 为生产事实，不能因为本地 `create_all` 成功就认为迁移完整。

## 10. 扩展原则

- 普通功能继续在模块化单体内按 route/schema/service/model 分层。
- 第三阶段 PDF/OCR/TTS 属于耗时任务，应先引入持久化任务表和单机 worker，再评估 Redis/队列；不能塞入当前同步 SSE 循环。
- 用户上传增长后将文件存储抽象到服务边界，再评估阿里云 OSS。数据库只保存可迁移的元数据/对象键。
- 多 Agent、向量库、微服务或托管基础设施必须由真实负载和独立边界驱动，并记录新决策。
- 外部词库通过离线、固定版本、可审计的导入流水线进入公共词典，不能形成对相邻仓库的运行时依赖。

## 11. 架构不变量

- GitHub 主仓库是代码事实源，阿里云不直接改源码。
- PostgreSQL 是生产业务事实源；模型输出、浏览器状态和对话摘要都不能替代它。
- 全局词典与用户学习状态分离。
- 私有资源按用户隔离；危险 Agent 写入确认并审计。
- 密钥只在服务端处理，`NEXT_PUBLIC_*` 中无秘密。
- `main` 保持可测试、可构建、可部署；实现变化同步迁移和文档。

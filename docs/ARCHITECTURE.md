# 架构设计

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
- `wordbooks` 与 `wordbook_words` 描述公共词书和顺序。
- `user_word_progress` 保存每位用户每个单词的间隔、熟练度和下次复习时间。
- `vocabulary_items` 保存用户的自定义生词集合与来源。
- `articles`、`article_sentences` 保存公共阅读内容。
- `sentence_bookmarks` 保存用户句子收藏。
- `study_reviews` 保存评分历史，支持统计与后续 AI 分析。

## 5. 复习算法

第一阶段使用可解释的 SM-2 风格算法。评分映射为：忘记 0、困难 2、认识 4、简单 5。系统根据评分更新重复次数、难度因子、间隔天数与下次复习日期。AI 后续可以建议参数或学习量，但基础算法始终可独立运行。

## 6. AI 扩展边界

第二阶段通过 Provider 适配层统一 DeepSeek、MiniMax 等厂商。用户 API Key 由服务端使用 `AI_CREDENTIAL_ENCRYPTION_KEY` 加密后按用户保存，读取接口只返回末四位掩码，完整 Key 不下发浏览器。厂商官方地址由服务端白名单控制。

Agent 只调用注册过的领域工具，不提供任意 SQL、任意 HTTP 或文件系统能力。模型产生的工具参数必须经过 Pydantic 校验；学习历史由数据库实时查询，模型不能作为事实来源。高风险写操作需要确认，所有写操作最终通过领域服务和数据库事务执行。

完整设计见 [第二阶段：知闲学习 Agent](phase-2/README.md)。

## 7. 文件与备份

当前服务器无对象存储，文件挂载到 `/data/zhixian/uploads`，数据库使用 Docker Volume。备份脚本输出到 `/data/zhixian/backups`，再由用户定期下载到本地或配合阿里云磁盘快照。第一阶段尚未开放文件上传，但目录与部署挂载已预留。

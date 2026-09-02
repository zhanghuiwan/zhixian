# API 说明

基础路径：`/api/v1`。除注册、登录、健康检查和公共文章列表外，业务接口均使用：

```http
Authorization: Bearer <access_token>
```

## 账号

- `POST /auth/register` 注册
- `POST /auth/login` 登录
- `GET /users/me` 当前资料
- `PATCH /users/me` 更新昵称、等级和每日目标

## 仪表盘

- `GET /dashboard` 今日数据、总进度和最近活动

## AI 模型设置

- `GET /ai/providers/catalog` 支持的厂商、官方地址和推荐模型
- `GET /ai/providers` 当前用户已保存的厂商配置（只返回 Key 掩码）
- `PUT /ai/providers/{provider}` 新增或更新 DeepSeek、MiniMax 配置
- `POST /ai/providers/{provider}/test` 使用已保存的 Key 执行最小连接测试
- `DELETE /ai/providers/{provider}` 删除配置

保存 API Key 前，服务器必须配置 `AI_CREDENTIAL_ENCRYPTION_KEY`。完整 Key 不会通过读取接口返回。

## 词书与学习

- `GET /wordbooks` 词书列表和用户进度
- `POST /wordbooks/{id}/select` 选择当前词书
- `GET /study/queue?limit=20` 当日到期复习 + 新词
- `POST /study/reviews` 提交评分

评分：`again`、`hard`、`good`、`easy`。

## 生词本

- `GET /vocabulary?q=` 查询生词
- `POST /vocabulary` 加入生词
- `DELETE /vocabulary/{word_id}` 删除生词

## 文章

- `GET /articles` 文章列表
- `GET /articles/{id}` 文章与句子详情
- `GET /words/lookup?term=` 查询内置词典
- `POST /articles/sentences/{id}/bookmark` 收藏句子
- `DELETE /articles/sentences/{id}/bookmark` 取消收藏
- `GET /articles/bookmarks` 收藏句子列表

启动后访问 `/docs` 查看由 OpenAPI 自动生成的完整交互文档。

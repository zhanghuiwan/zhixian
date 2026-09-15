# 学习 Agent 实现说明

本文描述第二阶段学习 Agent 的当前真实实现，供后续开发、排障和跨电脑接手使用。它回答四个核心问题：一条用户消息如何被处理、对话如何存储、短期与长期记忆如何工作、当前是否使用子 Agent。

最后核对日期：2026-09-15。代码行为发生变化时，应同时更新本文和相关自动化测试。

## 1. 结论先行

- 当前是一个运行在 FastAPI 进程内的单 Agent 工具调用循环。
- 当前没有子 Agent，也没有规划 Agent、执行 Agent、审查 Agent 或多 Agent 框架。
- 模型负责识别意图、生成回复和选择工具；后端工具负责查询真实学习数据和执行写操作。
- 完整会话消息、工具调用和 Token 用量持久化到数据库；它们不会只保存在浏览器内存中。
- 模型每轮只接收当前会话最近 24 条消息、较早对话的简化摘要、用户资料和明确保存的长期偏好，不会把全部历史消息原样发送给厂商。
- 学习记录、复习计划、生词本和文章等属于业务事实，不当作模型记忆，而是需要时从数据库实时查询。
- 所有会话消息都可以按所属会话从数据库恢复。用户引用以前聊过的内容时，Agent 可调用 `search_conversation_history` 在当前用户的全部会话中做关键词检索；当前没有语义搜索、向量库或 RAG。
- 未显式指定会话时，后端按用户本地日期自动复用当天唯一 `daily` 会话；只有用户点击“新对话”才创建 `manual` 会话。
- 纯英文单词、句子和长文在进入模型前由确定性规则分类，分别约束为详细查词、详细句子翻译和完整长文翻译；普通回答不再例行追加泛化建议。
- 对话历史侧栏在桌面和移动端都默认收起。只读查询工具卡只在当前请求期间显示，最终回答完成后清理；回答后的词本、句子、文章和学习操作随消息持久化并可恢复。

## 2. 核心代码位置

| 职责 | 文件 |
|---|---|
| 对话、消息、确认 API | `apps/api/app/api/routes/agent.py` |
| Agent 循环与上下文组装 | `apps/api/app/services/ai/agent.py` |
| 输入分类与回答操作生成 | `apps/api/app/services/ai/interaction.py` |
| 工具参数、注册表和执行器 | `apps/api/app/services/ai/tools.py` |
| 学习历史与计划计算 | `apps/api/app/services/learning_insights.py` |
| 多生词本领域逻辑 | `apps/api/app/services/vocabulary_collections.py` |
| 自定义词所有权与可见性 | `apps/api/app/services/custom_words.py` |
| Provider 接口和事件类型 | `apps/api/app/services/ai/providers/base.py` |
| DeepSeek、MiniMax 兼容适配 | `apps/api/app/services/ai/providers/openai_compatible.py` |
| Provider 目录和官方地址 | `apps/api/app/services/ai/catalog.py` |
| API Key 加密 | `apps/api/app/services/ai/credentials.py` |
| AI 数据表 | `apps/api/app/models/entities.py` |
| 对话页面 | `apps/web/app/(main)/assistant/page.tsx` |
| Markdown 正文组件 | `apps/web/components/markdown-message.tsx` |
| HTTP 与 SSE 客户端 | `apps/web/lib/api.ts` |

## 3. 一条消息的完整生命周期

```text
用户输入
  → 浏览器携带 JWT 发起 POST /api/v1/ai/chat/stream
  → FastAPI 校验用户、消息和会话归属
  → 未指定会话时查找/创建当天 daily 会话
  → 保存 user 消息并提交事务
  → 确定性分类普通问题、英文单词、英文句子或英文长文
  → 数据库会话进入 Agent 循环
  → 解密当前用户的 Provider Key
  → 组装系统提示词、摘要、最近消息和长期偏好
  → 调用 DeepSeek 或 MiniMax 流式接口
      ├─ 无工具：生成白名单操作、保存 assistant 消息并结束
      └─ 有工具：校验参数、审计、执行、保存 tool 消息，再次调用模型
  → 通过 SSE 持续返回文本、工具卡片、导航、确认和用量事件
  → 浏览器安全渲染 Markdown 和上下文操作；刷新后再从数据库恢复
```

### 3.1 浏览器发起请求

对话页调用 `streamApi()`，请求体包含：

- `message`：去除首尾空白后长度为 1～4000；
- `conversation_id`：继续已有或显式手动会话时传入；省略时复用当天默认会话；
- `provider`：首次创建当天会话时可选，未指定时使用已启用的默认厂商。

请求使用 `Authorization: Bearer <JWT>`。前端通过 `AbortController` 停止读取当前流；当前版本没有独立的后台任务取消、事务补偿或断点续传机制。

### 3.2 API 鉴权并落库用户消息

`chat_stream()` 首先完成以下同步步骤：

1. 从 JWT 解析当前用户；
2. 如果传入会话 ID，按 `conversation_id + user_id` 查询，阻止访问其他用户的会话；
3. 如果未传会话 ID，按用户 IANA 时区计算本地日期，复用或并发安全地创建唯一 `daily` 会话；已归档的当日会话会在再次发送时重新激活，显式新建接口创建 `manual` 会话；
4. 已有会话不能在中途切换 Provider；
5. 保存 `role=user` 的消息，更新会话时间，并在必要时用消息前 24 个字符作为标题；
6. 提交数据库事务后才开始 SSE 响应。

流式生成阶段使用新的 `SessionLocal`，避免继续依赖创建响应时的请求数据库会话。

### 3.3 读取模型配置

Agent 按会话中固定的 Provider 查找当前用户配置，只接受已启用配置。API Key 的处理方式为：

1. 浏览器保存时只把明文 Key 提交给后端；
2. 后端用 `AI_CREDENTIAL_ENCRYPTION_KEY` 和 Fernet 加密；
3. 密文同时绑定 `user_id` 与 `provider`；
4. 数据库只保存密文和末四位；
5. Agent 调用厂商前在内存中短暂解密；
6. 读取配置的接口只返回掩码，不返回完整 Key。

厂商地址来自后端白名单，用户不能填写任意 `base_url`。当前内置 DeepSeek 和 MiniMax，模型名称保存在用户配置与会话中。

### 3.4 组装模型上下文

每次调用模型时，上下文按以下顺序构建：

1. 系统提示词；
2. 本轮输入分类对应的确定性任务约束；
3. 较早对话摘要（存在时）；
4. 当前会话最近消息；
5. 本轮工具循环中新产生、尚未重新从数据库读取的 assistant/tool 消息。

系统提示词包含当前用户的本地日期、IANA 时区、每日新词目标和明确保存的长期偏好。CEFR 等级已从 Agent 上下文撤下。提示词要求模型对学习事实和数据操作必须调用工具，不得自行猜测；引用旧对话时调用跨会话检索；查词缺失时先询问，只有用户明确同意后才能创建私有词条；回答只完成当前目标，不例行以“要不要我”等建议收尾。

输入分类不调用模型：单个英文 token 是 `english_word`；较长文本、至少三个句末或多段落文本是 `english_article`；其他纯英文是 `english_sentence`；包含中文、URL、邮箱或没有英文字母的是 `general`。它只改变本轮任务约束和可用的界面操作，不改变数据库权限。

查词正文采用固定 Markdown 契约：标题行包含单词、英美音标和主要词性，随后依次输出核心中英释义、分义项与语境、词形与语法、常见用法、3～5 个双语例句和易混词。词形只列适用项，不能为凑格式捏造。句子翻译先在“中文翻译”引用块中给出一条规范译文，再解释语义、关键表达、句型语法和不同语境译法；长文以完整分段翻译优先，再补充重点词句、语篇语境和易误译处。

### 3.5 Provider 流式响应归一化

DeepSeek 与 MiniMax 都通过统一 Provider 契约调用。适配器把厂商的流式响应归一化为：

- 文本增量；
- Tool Call 分片；
- Token 用量；
- 结束原因。

文本增量立即以 `message.delta` 发给前端。Tool Call 的 ID、名称和 JSON 参数可能分多段到达，Agent 会先按索引拼接完整，再进入校验和执行。

### 3.6 无工具调用时结束

如果模型没有请求工具，Agent：

1. 根据输入分类与本轮已验证工具结果生成白名单 `actions`；
2. 保存完整 assistant 消息、结束原因、输入分类、`actions` 和用量；
3. 提交事务；
4. 发送含 `actions` 的 `message.completed`；
5. 发送 `usage.completed`，其中包含厂商、模型、累计 Token 和本轮延迟；
6. 结束 SSE。

### 3.7 有工具调用时继续循环

模型请求工具后，Agent 按顺序执行每个 Tool Call：

1. 工具名必须存在于静态 `TOOL_REGISTRY`；
2. JSON 参数必须能解析；
3. 参数必须通过对应 Pydantic 模型校验；
4. 创建或复用 `ai_tool_runs` 审计记录；
5. 非危险工具发送 `tool.started`，执行领域函数，再发送完成、导航或失败事件；
6. 工具结果以 `role=tool` 消息保存，并追加到本轮模型上下文；
7. 模型读取工具结果后继续回答或调用下一个工具。

单轮最多 6 次模型往返、10 次工具调用。当前工具顺序执行，没有并行执行。

幂等键为 `conversation_id + provider tool_call_id`。相同 Tool Call 已成功执行时会复用审计结果，避免同一调用重复写入；它不是跨会话、跨任意自然语言请求的全局去重机制。

### 3.8 危险操作确认

当前 `delete_vocabulary_collection` 要求确认。模型提出删除后：

1. 已通过校验的工具名和参数先保存到 `ai_tool_runs`；
2. 状态变为 `pending_confirmation`；
3. SSE 发送 `confirmation.required` 后结束本轮 Agent 循环；
4. 用户点击确认时，请求 `/ai/tool-runs/{id}/confirm`；
5. 后端按当前用户读取原先锁定的参数，模型不能在确认后更换目标；
6. 确认后直接执行并更新工具记录，取消则标记为 `cancelled`。

当前确认成功后不会自动恢复原 Agent 循环再生成一段模型回复；前端通过工具卡片显示执行结果，后端另存一条结果摘要消息。

## 4. 数据如何存储

| 表 | 保存内容 | 生命周期 |
|---|---|---|
| `ai_provider_configs` | Provider、模型、Key 密文、末四位、启用/默认状态 | 随用户配置存在 |
| `ai_conversations` | 用户、标题、固定 Provider/模型、`daily/manual` 类型、本地日期、较早摘要、归档状态 | 删除会话时级联清理 |
| `ai_messages` | user/assistant/tool 内容、Tool Calls、用量、输入分类、回答操作和厂商元数据 | 完整持久化 |
| `ai_tool_runs` | 工具名、已校验参数、结果、状态、幂等键、确认时间 | 用于审计和恢复工具卡片 |
| `ai_user_memories` | 明确保存的长期偏好键值 | 跨会话使用，随用户存在 |
| `user_custom_words` | 用户与 AI/手动补充词条的所有权关系 | 控制私有词可见性，随用户存在 |
| 学习业务表 | 学习评分、进度、计划快照、生词本、文章等事实 | 由领域服务维护 |

本地源码开发默认使用 SQLite；Docker Compose 和阿里云生产环境使用 PostgreSQL。数据库位置不同不会改变 Agent 的业务流程。

## 5. 短期记忆、摘要和长期记忆

### 5.1 短期记忆

短期上下文来自当前会话最近 `AI_MAX_CONTEXT_MESSAGES` 条数据库消息，默认值为 24。这里按消息行计数，user、assistant 和 tool 都占一条，不是 24 轮对话。

这些消息会在每次新请求时从数据库读取，因此刷新页面或重新登录不会丢失。浏览器状态只负责显示，不是事实来源。

### 5.2 较早对话摘要

当会话超过 24 条消息时，当前实现会：

- 从窗口外的较早消息中只取用户消息；
- 每条最多取前 100 个字符；
- 取最近 8 个片段；
- 拼成“较早对话主题”并写入 `ai_conversations.summary`。

这是确定性的轻量摘要，不是另一次大模型语义总结。它成本低、行为可预测，但会遗漏早期 assistant 回答、工具结果和较长消息后半段。后续若升级摘要算法，需要保留可测试性、版本号和成本上限。

### 5.3 长期记忆

长期偏好只在用户明确要求“记住”时，由 `remember_learning_preference` 工具保存。目前只允许三个键：

- `preferred_topics`：偏好的文章或学习主题；
- `response_style`：偏好的回答风格；
- `learning_goal`：稳定的学习目标。

同一用户和键只有一条记录，后续保存会更新旧值。所有长期偏好会加入每轮系统提示词。当前没有自动推断记忆、向量记忆、过期时间、版本历史或对话中的“忘记偏好”工具；需要删除时应增加明确 API/工具，而不是直接改数据库。

### 5.4 学习事实不是模型记忆

“昨天复习了哪些词”“明天计划是什么”“某个词是否在生词本”等问题必须调用数据库工具。这样即使会话摘要不包含这些信息，回答仍来自最新业务数据。

- 历史学习按用户时区和指定日期查询 `study_reviews` 等业务表；
- 今日计划使用快照，防止完成学习后原计划被覆盖；
- 未来七天是预测计划，必须标记为可能变化；
- 生词本读写按当前登录用户隔离；
- 文章草稿由工具校验结构后保存为当前用户私有草稿。

### 5.5 跨会话检索

`search_conversation_history` 查询 `ai_messages` 并通过 `ai_conversations.user_id` 强制绑定当前用户。空关键词返回最近消息，指定关键词同时匹配会话标题和消息正文；单次最多返回 30 条、每条最多 600 字符。它覆盖全部持久化会话的按需检索，但不是语义检索，也不会把全部历史自动塞入每轮上下文。模型可用更具体的关键词再次调用。

## 6. 当前工具清单

| 工具 | 类型 | 行为 |
|---|---|---|
| `lookup_word` | 只读 | 查系统词或当前用户私有词、掌握度和是否在生词本；缺词返回 `found=false` |
| `search_conversation_history` | 只读 | 在当前用户全部会话中做有界关键词检索 |
| `get_learning_history` | 只读 | 查指定本地日期的真实学习记录 |
| `get_review_plan` | 只读 | 查今日快照或未来七天预测 |
| `get_difficult_words` | 只读 | 按近期评分和掌握度查易错词 |
| `navigate_to_page` | 导航 | 只允许站内白名单页面 |
| `list_vocabulary_collections` | 只读 | 列出生词本及数量 |
| `create_vocabulary_collection` | 写入 | 新建生词本 |
| `rename_vocabulary_collection` | 写入 | 重命名生词本 |
| `add_word_to_vocabulary_collection` | 写入 | 向指定或默认生词本加词 |
| `create_custom_word` | 写入 | 用户明确同意后创建/取得私有词所有权并加入生词本 |
| `remove_word_from_vocabulary_collection` | 写入 | 移除分类关系，保留其他学习数据 |
| `delete_vocabulary_collection` | 破坏性写入 | 等待用户确认后删除非默认生词本 |
| `present_generated_examples` | 结构化输出 | 校验并展示 1～5 个双语例句 |
| `generate_article_draft` | 生成并写入 | 校验并保存 2～30 句个人文章草稿 |
| `remember_learning_preference` | 长期记忆写入 | 明确请求后保存允许的稳定偏好 |

工具不具备任意 SQL、任意网络请求、文件系统访问或代码执行能力。

## 7. 前端如何消费 SSE

对话页逐块解析 `event:` 和 `data:`：

- `conversation.created`：记录新会话 ID；
- `message.delta`：追加流式文本；
- `tool.started/completed/failed`：更新工具卡片；
- `confirmation.required`：展示确认或取消按钮；
- `navigation.requested`：把页面枚举映射为本地路由并跳转；
- `message.completed`：把临时消息替换为持久化消息 ID，并挂载服务端返回的白名单操作；
- `error`：显示安全化错误信息。

Assistant 正文通过 `react-markdown + remark-gfm` 渲染标题、列表、表格、链接和代码；没有启用原始 HTML。用户消息仍按纯文本显示。重新打开会话时，前端分别读取消息和工具记录。普通对话区过滤 `role=tool` 消息。写操作、确认等需要保留的工具结果从 `ai_tool_runs` 恢复为卡片；查词、历史、计划、易错词、生词本列表和跨会话检索属于短生命周期状态，在 `message.completed` 后清理，避免长期堆积在回答下方。

回答操作由 `interaction.py` 生成并保存在 assistant 消息元数据中：查到的单词可加入默认及最近两本个人词本；缺词进入明确的私有补词确认消息；英文句子可收藏；英文长文可幂等保存为当前用户私有文章并进入阅读页；复习计划可进入学习页。前端只接受已知 `type`、有效参数和受限站内路径，重复点击在请求期间禁用。

详细展示和学习数据严格分离。系统已有词的加入按钮只传单词与词本标识，数据库只新增关联；私有新词仍由 `CreateCustomWordArgs` 限制为单词、音标、词性、核心翻译、结构化义项和一组例句；句子收藏通过确定性解析器只提取回答中“中文翻译”章节的规范译文，不保存后续 Markdown 分析。解析不到规范译文时不生成收藏操作，避免污染收藏数据。

历史会话抽屉由用户主动打开，初始状态在桌面和移动端均为关闭。页面首次进入时只恢复当天 `daily` 会话，不自动创建新会话；点击“新对话”会立刻通过 API 创建 `manual` 会话。默认收起只改变界面，不删除数据库会话，也不限制 Agent 的受控历史检索。

导航采用双重限制：后端参数只能是允许的页面枚举，前端也只映射已知路由。模型不能让浏览器跳到任意外部 URL。

## 8. 是否需要子 Agent

当前不需要，也没有实现子 Agent。现阶段任务共享同一个用户、数据库事务边界和工具集合，单编排循环更容易保证用户隔离、确认流程、审计和成本控制。

以下概念不能误称为子 Agent：

- DeepSeek 和 MiniMax 是可替换的模型 Provider；
- `TOOL_REGISTRY` 中的领域函数是工具；
- PDF/OCR/TTS 后续使用的后台 worker 是任务执行器；
- 同一轮中连续调用多个工具仍然是一个 Agent。

只有当后续出现明确独立的角色、上下文和验收边界，例如“资料检索规划”和“长文质量审校”确实需要独立循环时，才评估多 Agent。即使增加多 Agent，所有学习事实写入仍必须经过同一领域服务和权限边界，子 Agent 不能直接获得数据库或文件系统的通用权限。

## 9. 当前限制与后续改进

1. 较早摘要只是用户片段拼接，不是高质量语义摘要。
2. 跨会话目前是数据库关键词匹配，没有分词、相关性排序、语义/向量检索或分页游标。
3. 长期记忆只支持三个白名单偏好键，尚无用户可视化管理和删除工具。
4. 危险操作确认后直接执行，不会恢复模型循环生成最终自然语言总结。
5. 浏览器停止生成只会中止当前 HTTP 流，尚无独立任务取消与补偿协议。
6. 工具当前串行执行；互不依赖的只读调用尚未并行。
7. 当前在 API 进程中完成模型请求，不适合 PDF、OCR、长音频等耗时任务。
8. 每日会话标题使用本地日期；手动会话默认是“新对话”，尚未做智能标题生成。

优先改进顺序建议：根据真实使用反馈升级跨会话相关性和长期记忆管理，再升级摘要；第三阶段处理文件时引入持久化任务表和单机 worker，不应直接把耗时任务塞进当前 SSE 请求。

## 10. 扩展规范

### 新增工具

1. 为参数创建严格的 Pydantic 模型；
2. 在领域服务实现按当前用户隔离的逻辑；
3. 返回结构化 `ToolOutcome`；
4. 注册到 `TOOL_REGISTRY`；
5. 明确只读、可撤销写入或破坏性写入风险；
6. 为越权、参数错误、幂等、确认和正常路径补测试；
7. 同步更新本文、API 文档和前端卡片。

### 新增 Provider

1. 在 `catalog.py` 增加官方地址、默认模型和能力；
2. 实现或复用 `LLMProvider` 适配器；
3. 归一化文本、Tool Call、用量、结束原因和错误；
4. 不允许用户覆盖为任意地址；
5. 使用仓库外测试 Key 验证普通、流式和 Tool Call；
6. 确认日志、异常、Git 和构建产物不包含 Key。

### 修改记忆策略

记忆逻辑变化必须分别回答：保存什么、何时保存、何时读取、用户如何查看/修改/删除、如何限制长度和成本、如何避免把模型推测当事实。涉及新字段时创建新的 Alembic 迁移，不修改已部署迁移。

## 11. 验证清单

Agent 相关改动至少验证：

```powershell
cd apps/api
..\..\.venv\Scripts\python.exe -m pytest

cd ..\web
npm run lint
npm run build

cd ..\..
docker compose config
```

真实 Provider 测试只从仓库外读取临时 Key。禁止把 Key 写入 `.env.example`、源码、测试夹具、Git 远端 URL 或命令输出。

# 外部词库提取与导入规范

最后核对：2026-09-08。当前状态：固定来源清单、规范化 JSONL 数据包、转换校验、来源模型和幂等导入已经实现。`zhixian-core-en-v1` 已进入 Git，新电脑和 Docker/PostgreSQL 均可不依赖相邻上游仓库完成导入。

## 1. 边界与目标

外部词库只提供候选词条和排序。知闲必须通过自己的可重复流水线完成来源审核、格式转换、质量校验、数据库写入和审计。

- 主仓库永远是 `zhixian`；运行时和构建时不得依赖某台机器上的 `../qwerty-learner`。
- 相邻 qwerty-learner 仓库只读，不在其中实现知闲功能或推送修改。
- 不把大型词典数组继续写进 `apps/api/app/db/seed.py`。种子脚本只保留最小演示数据。
- 词条事实、词书成员关系和用户学习进度分开处理；导入不能破坏已有用户数据。

## 2. 当前参考源快照

| 项目 | 固定值 |
|---|---|
| 上游仓库 | `https://github.com/RealKai42/qwerty-learner` |
| 上游分支 | `master` |
| 本次审查提交 | `122acd90b4079dd040c28a14356447f6553cff83` |
| 提交日期 | 2026-08-11 |
| 词典索引 | `src/resources/dictionary.ts` |
| 词典目录 | `public/dicts` |
| 该提交目录文件数 | 380（包含不同语言、考试、短语和 API 词库，不代表都适合知闲） |
| 上游代码许可证 | GPL-3.0，见上游 `LICENSE` |

本机 `/Users/tom/Documents/知闲/qwerty-learner` 仅用于上游对照和重建检查。其他机器不能假设此目录存在；日常校验、本地开发和生产启动只读取知闲仓库已提交的数据包。

本次抽样已从固定提交读取 `public/dicts/CET4_T.json`：JSON 可解析，共 2607 条，首条字段为 `name`、`trans`、`usphone`、`ukphone`，与 registry 声明数量一致。这只是格式抽样，不代表其授权和内容质量已经获批。

### 当前合并词库

权威清单位于 `data/wordlists/manifests/zhixian-core-en-v1.json`，固定选择：

| 来源 | 文件 | 原始条数 | 源内唯一 |
|---|---|---:|---:|
| CET-4 | `CET4_T.json` | 2,607 | 2,607 |
| CET-6 | `CET6_T.json` | 2,345 | 2,345 |
| 考研通用 | `KaoYan_3_T.json` | 3,728 | 3,727 |
| 考研英语一 | `DanCiDeMimi_1.json` | 5,657 | 4,264 |
| 考研英语二 | `DanCiDeMimi_2.json` | 3,827 | 2,854 |
| IELTS | `IELTS_3_T.json` | 3,575 | 3,575 |

合计 21,739 条原始记录；源内重复 2,367 条，跨来源重复 11,956 条，最终得到 7,416 个唯一英文词条（其中 29 个英文短语）。稳定统计见 `data/wordlists/reports/zhixian-core-en-v1.json`。

## 3. 授权门禁

上游 README 说明词典包含社区贡献，并提到部分字典数据来自 kajweb、语音来自有道、API 词库来自其他项目。仓库整体的 GPL-3.0 许可证不自动解决每个数据集本身的版权、数据库权或商标问题。

因此每个词库必须单独记录：

- 原始数据作者/发布者和公开页面；
- 上游文件、引入 PR/提交（能找到时）；
- 数据许可证或明确授权文本；
- 是否允许复制、修改、公开分发和商业使用；
- 署名、同许可证分发或通知文件要求；
- 审核人、日期和结论。

审核结果只能是：

- `approved`：项目所有者已批准当前引入和分发方式，可以进入 Git 和生产导入；
- `internal-evaluation-only`：只允许本地分析或显式写入本地开发数据库；不提交派生正文、不进生产；
- `blocked`：来源或授权不清，禁止导入；
- `needs-owner-decision`：可能触发 GPL/署名/项目许可证选择，交项目所有者决定。

项目所有者已于 2026-09-08 明确批准将当前六个来源的规范化数据包纳入 Git 并用于其他开发主机和阿里云，因此当前 manifest 标记为 `approved`。这是项目内部发布决策，不是对每个原始词条独立权利的法律保证；知闲仓库仍需在更广泛的公开分发或接受外部贡献前确定自身项目许可证。上游 GPL-3.0 副本和第三方权利提示必须与数据包同时保留，详见 `data/wordlists/NOTICE.md`。

## 4. 上游格式

上游索引对象通常包含：

```text
id, name, description, category, tags,
url, length, language, languageCategory
```

常见英文 JSON 条目包含：

```json
{
  "name": "example",
  "trans": ["示例；例子"],
  "usphone": "ɪɡ'zæmpl",
  "ukphone": "ɪɡ'zɑːmpl"
}
```

不同词典可能有额外字段、缺字段、短语、专有名词、编程 API、非英语内容或非统一音标。转换器必须按输入 schema 校验，不能假定 380 个文件完全同构。

## 5. 知闲目标映射

当前目标模型是 `Word`、`Wordbook`、`WordbookWord`、`WordlistSource` 和 `WordlistSourceEntry`：

| 上游 | 知闲 | 默认规则 |
|---|---|---|
| registry `id` | manifest source slug/key | 原样记录，不仅依赖显示名称 |
| 合并 manifest `slug` | `Wordbook.slug` | 当前为 `zhixian-core-en-v1`，稳定唯一 |
| 合并 manifest 展示字段 | `Wordbook` | 保留未发布的导入载体，不进入产品词书入口 |
| 单个来源展示字段和顺序 | `Wordbook` / `WordbookWord` | 发布六本独立系统预设，共享全局词典进度 |
| 单个来源元数据 | `WordlistSource` | 保存仓库、提交、文件、哈希、数量和授权状态 |
| `language` | 导入过滤 | 首批只接受明确的 `en` |
| item `name` | `Word.term` | Unicode NFKC、trim、合并空白；英语普通词默认小写 |
| `trans[]` | `Word.translation` | 去空、保序、去重后用中文分号连接，最长 500 |
| `trans[]` | `Word.definitions` | 每项保存为 meaning；没有可靠结构时不猜词性 |
| `usphone` / `ukphone` | `Word.phonetic` | 由词库 manifest 声明优先口音；保留原值来源，不混拼 |
| 无可靠来源 | `part_of_speech` | 留空，不从中文字符串冒险解析 |
| 无字段 | `example*` | 留空，不在导入过程用 AI 无标记生成 |
| 数组位置 | `WordbookWord.position` | 从 1 开始，保持原始顺序 |
| 来源 + 数组位置 | `WordlistSourceEntry` | 去重后仍能查询每个词来自哪些原始词书 |

迁移 `0004` 已增加 `wordbooks.slug`、`wordlist_sources` 和 `wordlist_source_entries`。应用查询以数据库为准；Git 中的 JSONL 是新环境重建基础数据的版本输入，不替代数据库的唯一约束、事务和用户进度关联。当前 manifest 将合并记录标为未发布，并按六个来源分别生成系统预设词书；单词本体与用户掌握进度仍保持全局唯一。

## 6. 当前仓库结构

当前实现：

```text
apps/api/app/services/wordlist_import.py  # 提取、规范化、合并和事务写入
apps/api/app/db/import_wordlist.py        # dry-run / apply 命令入口
data/wordlists/
  manifests/zhixian-core-en-v1.json       # 来源、授权、哈希和映射
  normalized/zhixian-core-en-v1.jsonl     # 跟随 Git 的规范化全量数据包
  reports/zhixian-core-en-v1.json         # 稳定质量摘要
  licenses/qwerty-learner-GPL-3.0.txt     # 上游许可证副本
  NOTICE.md                               # 数据来源、转换和分发说明
```

原始上游大文件不重复复制进知闲仓库；只提交应用需要的去重数据和来源关联。默认路径直接校验已提交数据包。只有审查或更新词库时才传入 `--source-repo`，工具会从 manifest 固定提交重建并逐字节比对数据包；禁止硬编码某个用户的绝对路径。

## 7. Manifest 最低字段

合并词书 manifest 至少包含：

```json
{
  "schema_version": 1,
  "slug": "zhixian-core-en-v1",
  "display_name": "知闲 · 核心词汇",
  "language": "en",
  "include_phrases": true,
  "source_repository": "https://github.com/RealKai42/qwerty-learner",
  "source_commit": "122acd90b4079dd040c28a14356447f6553cff83",
  "transform_version": 1,
  "bundle_file": "normalized/zhixian-core-en-v1.jsonl",
  "bundle_sha256": "<required>",
  "bundle_count": 7416,
  "sources": [
    {
      "source_key": "qwerty-cet4-122acd90",
      "source_file": "public/dicts/CET4_T.json",
      "source_sha256": "<required>",
      "declared_count": 2607,
      "license_status": "approved",
      "license_evidence": ["data/wordlists/NOTICE.md"]
    }
  ]
}
```

命令默认 dry-run。`license_status` 未达到 `approved` 时，生产环境始终拒绝写入；非生产环境也必须显式增加 `--allow-internal-evaluation`，且只接受 `internal-evaluation-only`。没有通用 `--force` 绕过选项；状态改变需要审查记录和项目所有者确认。当前六个来源的决策记录在 `NOTICE.md`。

## 8. 转换与校验步骤

1. 固定源提交，不从浮动 `master` 直接导入生产。
2. 读取 registry，确认 id、语言、URL、声明数量和类别。
3. 对源文件计算 SHA-256，与 manifest 比对。
4. 解析 JSON 并验证每条类型、必填字段和最大长度。
5. 规范化 term/翻译/音标，保留原始顺序和源行索引。
6. 报告源内精确重复、大小写/NFKC 碰撞和无效项。
7. 与现有 `words` 比对，区分复用、新增和字段冲突。
8. 生成确定性的质量报告；同输入的统计和顺序一致。
9. 将确定性 JSONL 与数量、SHA-256 写入 Git；每次读取都重新验证。
10. 不传 `--apply` 时只校验，不写数据库。
11. 授权通过后在单个数据库事务中导入；`internal-evaluation-only` 只允许显式写本地非生产库。
12. 再次运行验证幂等，不新增重复 Word、Wordbook 或关联。

任一阶段失败都不得留下半本词书。

当前执行命令：

```bash
cd apps/api

# 默认校验 Git 数据包，不写数据库，不需要上游仓库
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json

# 写入当前 DATABASE_URL，可重复执行
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json \
  --apply

# 可选：从固定上游提交重建，并与 Git 数据包逐字节比对
python -m app.db.import_wordlist \
  --manifest ../../data/wordlists/manifests/zhixian-core-en-v1.json \
  --source-repo ../../../qwerty-learner
```

## 9. 冲突与更新策略

- 规范化 term 相同的现有 `Word` 默认复用。
- 默认不覆盖现有非空音标、翻译、词性和例句；字段不同进入冲突报告。
- 当前使用 manifest 顺序的 first-source-wins 生成主释义；已有非空全局词条字段不覆盖，空字段才补齐。
- 词书成员使用稳定来源键 + word + position 幂等更新。
- 已有用户进度后，不因上游删除词条而删除 `words`；只移除/停用词书关系，并评估对学习队列影响。
- 上游版本更新产生新的 manifest/source hash 和差异报告，不静默替换旧快照。

## 10. 质量门槛

- 文件可解析且顶层为数组。
- registry 声明数、源数组数、有效数和最终唯一数全部报告；不要求盲目相等，但差异必须解释。
- term 非空、长度不超过 100；翻译至少一项且目标拼接不超过 500。
- 首批词书必须为英语学习词汇；非英语、代码 API、整句和含复杂标记的数据分开评估。
- 不允许不可见控制字符、HTML/script、NUL 或路径内容进入字段。
- 顺序稳定，首尾样本人工复核；随机抽样检查音标和翻译。
- SQLite 与 PostgreSQL dry-run/导入结果统计一致。
- 重复导入无新增，事务失败后数据库保持原状。

详细测试证据见 `TESTING.md`。

## 11. 本地按需读取上游

查看固定提交中的文件列表，不下载全部 blob：

```bash
git -C ../qwerty-learner ls-tree -r --name-only \
  122acd90b4079dd040c28a14356447f6553cff83 public/dicts
```

读取单个候选文件可使用 `git show <commit>:<path>`，或把该文件加入 sparse checkout。不要为了一个词库检出声音、桌面应用等整个上游项目。任何自动脚本都应验证实际 commit 和 SHA-256，而不只验证目录名。

## 12. 首批导入完成定义

- 六个来源的项目导入状态均为 `approved`，上游许可和项目所有者决策可追溯。
- 上游许可副本和 `NOTICE.md` 与数据包一起进入 Git。
- 稳定来源标识的数据模型和 Alembic 迁移完成。
- manifest、数据包校验和事务 import 均可在新机器复现，无需相邻上游仓库。
- SQLite/PostgreSQL、重复导入、冲突和事务回滚测试通过。
- UI/API 能正确显示词数、顺序和学习队列。
- manifest、统计、版本更新和回滚说明进入 Git。
- 未把 qwerty-learner 变成生产运行依赖，未破坏任何用户进度。

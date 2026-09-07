# 词库数据来源与分发说明

`normalized/zhixian-core-en-v1.jsonl` 是知闲根据以下固定上游快照转换、合并并去重得到的数据包：

- 项目：RealKai42/qwerty-learner
- 仓库：https://github.com/RealKai42/qwerty-learner
- 提交：`122acd90b4079dd040c28a14356447f6553cff83`
- 上游声明许可证：GNU General Public License v3.0
- 本地许可证副本：`licenses/qwerty-learner-GPL-3.0.txt`

本数据包在 2026-09-08 生成，包含 CET-4、CET-6、考研通用、考研英语一、考研英语二和 IELTS 六个上游文件的规范化派生内容。转换包括 Unicode/空白/大小写规范化、释义清理、音标格式化、来源关联和重复词条合并；完整源文件、提交和 SHA-256 见 manifest。

上游 README 说明部分字典数据由社区贡献，并提到 kajweb/dict 和有道开放 API 等来源。保留本说明和 GPL-3.0 副本不等于对每个原始词条的独立权利作出保证。公开或商业分发前，项目维护者仍应确认适用的署名、数据库权及其他第三方义务。

知闲项目所有者已于 2026-09-08 明确要求将该规范化数据包纳入 Git，并用于其他开发主机及阿里云部署。不得删除本说明、manifest、固定来源信息或上游许可证副本。

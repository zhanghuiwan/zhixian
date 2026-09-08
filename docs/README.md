# 知闲文档索引

最后核对：2026-09-09。

本目录同时服务于项目维护者和无历史上下文的开发模型。入口文档保持简短，专项事实只在一个权威位置维护，其他文档通过链接引用，避免多处说明逐渐分叉。

## 快速选择

| 你要做什么 | 先读 |
|---|---|
| 第一次接手项目 | `../AGENTS.md` → `PROJECT_STATUS.md` → `ARCHITECTURE.md` |
| 本地启动或换电脑 | `../README.md`、`development/README.md` |
| 修改后端、前端或 Agent | `CODING_STANDARDS.md`、`API.md`、相关源码测试 |
| 修改数据表 | `DATA_MODEL.md`、`CODING_STANDARDS.md` 的迁移规则 |
| 导入 qwerty-learner 词库 | `WORDLIST_PIPELINE.md` |
| 写测试或做发布前验证 | `TESTING.md` |
| 部署阿里云 | `DEPLOYMENT.md`、`SECURITY.md` |
| 排查环境和运行问题 | `TROUBLESHOOTING.md` |
| 理解决策理由 | `DECISIONS.md` |
| 换模型或中断任务 | `TASK_HANDOFF.md` |

## 当前事实文档

| 文档 | 维护内容 |
|---|---|
| `../AGENTS.md` | 仓库级强制边界、开工顺序和最低验证 |
| `../CONTRIBUTING.md` | 分支、提交、PR 和完成定义 |
| `PROJECT_STATUS.md` | 已实现范围、当前限制、近期优先级 |
| `ARCHITECTURE.md` | 系统结构、模块边界、关键数据流 |
| `development/README.md` | 跨电脑环境、Git、启动和日常开发 |
| `CODING_STANDARDS.md` | Python、TypeScript、API、事务、日志规范 |
| `DATA_MODEL.md` | 数据实体、所有权、关系、迁移约束 |
| `API.md` | HTTP 端点、统一约定、SSE 事件 |
| `TESTING.md` | 测试矩阵、命令、完成标准 |
| `WORDLIST_PIPELINE.md` | 外部词库来源、字段映射、授权和导入流程 |
| `DEPLOYMENT.md` | 阿里云单机发布、备份、恢复和回滚 |
| `SECURITY.md` | 凭证、鉴权、用户隔离、供应链和生产安全 |
| `TROUBLESHOOTING.md` | 常见故障的定位顺序 |
| `DECISIONS.md` | 已接受的架构/流程决策及待决项 |
| `TASK_HANDOFF.md` | 可复制的跨对话交接模板 |

## 产品与历史文档

| 文档 | 属性 |
|---|---|
| `REQUIREMENTS.md` | 第一阶段需求基线，已完成，保留作验收背景 |
| `DEVELOPMENT_PLAN.md` | 阶段路线图；完成度以 `PROJECT_STATUS.md` 为准 |
| `phase-2/README.md` | 第二阶段 Agent 目标和总体设计，已完成 |
| `phase-2/IMPLEMENTATION_PLAN.md` | 第二阶段详细实施计划，历史基线 |
| `phase-2/AGENT_IMPLEMENTATION.md` | 第二阶段当前实现细节，仍需随 Agent 代码维护 |
| `phase-2/COMPLETION.md` | 第二阶段交付快照 |
| `AI_WORKSPACE_V1.md` | AI 学习工作台第一版范围、迁移与兼容约定 |

## 信息优先级

出现矛盾时按以下顺序处理：

1. 用户最新明确需求和安全约束；
2. 当前源码、数据库迁移、自动化测试、Docker/CI 配置；
3. `PROJECT_STATUS.md` 和当前事实文档；
4. 阶段需求、实施计划和完成报告；
5. 聊天记录或未写入仓库的口头背景。

不要只根据旧文档修改代码。先验证现状，再让实现、测试和文档在同一个变更中恢复一致。

## 文档维护标准

- 使用仓库相对路径和可复制命令，不写某台机器独有的绝对路径；外部参考目录除外。
- 明确区分“已实现”“计划中”“待确认”和“已暂缓”。
- 重要判断注明最后核对日期、来源文件或固定提交。
- 新增文档必须从本索引和根 README 至少有一个入口。
- 删除或重命名文件时同步修复全仓链接。
- 不在文档中保存真实域名凭证、服务器 IP、密钥或个人访问令牌。

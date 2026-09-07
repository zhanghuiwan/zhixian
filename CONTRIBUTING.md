# 参与知闲开发

完整环境说明见 `docs/development/README.md`，仓库级强制约束见 `AGENTS.md`。本文件定义从领取任务到合并 `main` 的共同流程。

## 1. 开始任务

```bash
git switch main
git status --short --branch
git pull --ff-only origin main
```

工作区不干净时先确认已有改动归属。不要删除、覆盖或顺手格式化无关文件。

除极小的文档修正外，使用短生命周期分支：

```bash
git switch -c feat/wordlist-import
```

推荐前缀：`feat/`、`fix/`、`docs/`、`test/`、`refactor/`、`chore/`。分支只承载一个可描述的目标。

## 2. 实施原则

- 先读相关代码、测试和文档，再修改。
- 保持模块化单体边界，不因单项需求引入微服务或新基础设施。
- 不做与目标无关的大范围重构。
- 行为变更要有测试；缺陷修复优先先写能复现问题的测试。
- API、数据模型、环境变量、部署流程发生变化时同步更新专项文档。
- 新依赖必须说明用途，提交锁文件，并评估维护状态、许可证和安全影响。

## 3. 提交规范

提交信息使用：

```text
<type>: <imperative summary>
```

允许的 `type`：`feat`、`fix`、`docs`、`test`、`refactor`、`chore`。

示例：

```text
feat: add deterministic wordlist importer
fix: scope collection lookup to current user
docs: record aliyun rollback procedure
```

一个提交解决一个明确问题。禁止提交 `.env`、数据库、备份、上传文件、构建产物、临时凭证或无意义的自动生成差异。

## 4. 提交前检查

```bash
git diff --check

cd apps/api
python -m pytest

cd ../web
npm run lint
npm run build

cd ../..
docker compose config
git status --short
```

按 `docs/TESTING.md` 增加与变更相匹配的专项验证。没有 Docker 时可以跳过 Compose 运行测试，但必须说明环境限制；`docker compose config` 在有 Docker 的开发机和 CI/发布机上仍是必检项。

## 5. Pull Request

PR 描述至少包含：

- 问题和目标；
- 方案及关键取舍；
- 修改文件或模块；
- 验证命令与结果；
- UI 截图或人工验收范围（如适用）；
- 数据迁移、环境变量和部署影响；
- 风险、回滚方式和遗留事项。

合并要求：

- CI 全部通过；
- 用户隔离、安全边界和危险操作确认未退化；
- 数据模型变化包含新的 Alembic 迁移；
- 文档与实现一致；
- `main` 合并后仍可构建和部署。

## 6. 合并与发布边界

- GitHub 是唯一源代码同步中心。
- 阿里云只部署 `main` 的已验证提交，不在服务器直接改代码。
- 合并不等于发布；发布按 `docs/DEPLOYMENT.md` 单独执行。
- 生产部署、数据库恢复、数据卷删除、推送或发布均需任务明确授权。

## 7. 完成定义

一项开发任务只有在实现、测试、文档、迁移/配置说明和交接都完整时才算完成。若因外部凭证、生产权限或硬件条件无法验证，必须准确记录未验证内容，不能写成“已完成”。

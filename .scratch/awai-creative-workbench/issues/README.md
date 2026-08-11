# AWAI创作工作台 Issues

本目录是 AWAI创作工作台的本地 issue tracker。父规格见 [PRD](../PRD.md)。

| Issue | 状态 | 依赖 |
|---|---|---|
| [001 AWAI 在线基础与浏览器存储](001-awai-online-foundation.md) | closed | 无 |
| [002 Sub2API 身份、Key 配置与 Gemini/Agent 生图](002-sub2api-gemini-agent.md) | closed | 001 |
| [003 在线素材保障：备份包与云端副本](003-online-asset-protection.md) | closed | 001、002 |
| [004 Tauri 桌面素材库与端到端生成](004-tauri-library-generation.md) | closed | 001、002 |
| [005 桌面数据运维、更新与安装包](005-desktop-operations-updates.md) | closed | 003、004 |
| [006 双运行模式最终集成与发布验收](006-release-integration.md) | open | 003、005 |
| [007 Agent 图片上下文预算与按需引用](007-agent-image-context-budget.md) | closed | 无 |
| [008 浏览器可恢复 Agent 执行](008-resumable-agent-runs.md) | closed | 007 |

关闭 issue 时必须完成其 Definition of done，将已满足的复选框改为 `[x]`，记录唯一实现提交和验证证据，然后把状态改为 `closed`。

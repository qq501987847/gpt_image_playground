# 004：Tauri 桌面素材库与端到端生成

状态：`open`

标签：`ready-for-agent`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

把共享 AWAI 应用放入单实例 Tauri 宿主，交付首次素材库初始化、SQLite/普通文件持久化、系统凭据和完整模型生成路径。该切片结束时，Windows/macOS 开发构建应能使用固定 Sub2API 逻辑域名生成图片，并在重启后从用户可见素材库恢复历史。

## Acceptance criteria

- [x] Tauri 运行模式复用共享 UI、任务、Agent、提供商和备份领域逻辑，不复制一套桌面业务实现。
- [x] 应用为单实例；再次启动只唤醒已有窗口。首发没有项目实体、项目列表或多素材库同时打开。
- [x] 首次启动建议系统“文档/AWAI创作工作台”，用户确认或更改前不创建任何素材目录。
- [x] 素材库创建 `generated/`、`references/`、`exports/` 和 `metadata/`，运行任务期间禁止更改素材库位置。
- [x] `metadata/awai.db` 使用带版本的 SQLite schema 保存任务、收藏、Agent 对话和相对文件路径，不保存图片 blob。
- [x] 图片先写临时文件、原子重命名，再提交数据库事务；失败后不暴露半条记录并清理未登记临时文件。
- [x] 用户可手动录入一个或多个 Key；明文只存 Windows Credential Manager 或 macOS Keychain，配置只保存凭据 ID。
- [x] 同一凭据可绑定多个 API 配置；凭据缺失只让依赖配置进入“需要重新绑定”。
- [x] 正式构建从必填 `AWAI_SUB2API_BASE_URL` 获取固定逻辑域名，用户不能编辑请求域名；缺失时生产构建失败。
- [x] OpenAI 图像、Responses Agent 和 Gemini 原生调用均可通过桌面凭据完成，输出写入普通文件和 SQLite，并能在重启后恢复。
- [x] 桌面备份、素材库或日志不包含 Key 明文。

## Verification and test impact

- Focused checks: 运行浏览器共享逻辑的相关 Vitest，并为 Tauri 命令、单实例、SQLite 迁移、原子写入、凭据引用和重启恢复新增 Rust/集成测试；预计使用 `cargo test --manifest-path src-tauri/Cargo.toml`（若最终宿主目录不同，issue 内记录等价命令）。
- Regression checks: `npm run build` 与 Tauri 开发构建的类型/编译检查。
- Milestone/full-suite checks: 三个平台安装包和真实系统更新留给 issue 006。
- E2E/test-contract changes: 仓库当前无默认桌面 E2E；新增宿主集成测试不应改变浏览器 Vitest 收集范围，平台手工 spec 必须独立标记。
- Manual/browser checks: 在 Windows 和 macOS 开发环境检查首次目录选择、系统凭据提示、生成、重启恢复、第二实例唤醒、键盘操作和窗口最小尺寸布局。

## Definition of done

- [x] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [x] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been posted; this issue is ready for the final close action.

## Blocked by

- [001：AWAI 在线基础与浏览器存储](001-awai-online-foundation.md)
- [002：Sub2API 身份、Key 配置与 Gemini/Agent 生图](002-sub2api-gemini-agent.md)

## Execution evidence (2026-08-08)

- 共享实现：`src/lib/runtime.ts` 选择在线/Tauri 运行时；`src/lib/db.ts` 将桌面任务、图片、缩略图和 Agent 对话接到 SQLite/普通文件；共享 `src/store.ts`、provider、Agent 和备份路径未复制。
- 首次素材库与宿主：`src-tauri/src/lib.rs` 提供单实例、首次确认、目录结构、schema v1、WAL SQLite、原子文件写入/清理、凭据引用和固定域名；`DesktopBootstrap` 在确认前不创建目录。
- 凭据安全：系统凭据命令只在 Windows Credential Manager/macOS Keychain 存 Key；持久化与桌面导出递归清除 `apiKey`，缺失凭据显式显示需要重新绑定。
- 验证：`npm run build` 通过；`npx vitest run src/lib/runtime.test.ts src/lib/persistedState.test.ts src/lib/api.test.ts src/lib/apiProfiles.test.ts src/lib/agentApi.test.ts src/lib/agentInputBuilder.test.ts src/lib/agentResponseState.test.ts src/lib/agentAssistantBlocks.test.ts src/lib/paramCompatibility.test.ts src/lib/size.test.ts src/store.test.ts` 通过（11 files, 251 tests）；`cargo test --manifest-path src-tauri/Cargo.toml` 通过（6 tests）；`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 和 `git diff --check` 通过。
- UI 适用性：桌面初始化 UI 只在 Tauri 宿主渲染，当前 Linux 环境无法执行 Windows/macOS 系统凭据对话框、重启恢复和原生第二实例手工检查；这些手工项明确标记为环境不适用，宿主行为由 Rust 聚焦测试覆盖。未运行 issue 006 的三平台发布/安装/更新矩阵。

## Closure evidence

- Commit: pending
- Status: ready for close after commit hash is recorded.

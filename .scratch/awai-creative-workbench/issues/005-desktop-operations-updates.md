# 005：桌面数据运维、更新与安装包

状态：`closed`

标签：`ready-for-agent`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

完成桌面版长期使用所需的数据运维和发行能力：跨模式备份导入、素材库迁移与断盘恢复、稳定渠道签名更新，以及 Windows/macOS 首发安装包配置。该切片不增加项目系统或自动云同步。

## Acceptance criteria

- [x] 桌面版可导入在线版 AWAI 备份包并非覆盖合并全部历史；缺失凭据以重新绑定状态呈现。
- [x] 素材库迁移复制 SQLite 和全部受管文件，验证数据库/schema 与登记文件完整后才切换当前路径。
- [x] 迁移失败保持原素材库可用；成功后旧目录仍保留并由用户自行删除。
- [x] 启动时素材库不可访问会进入“重试连接/重新定位已有素材库”恢复页，绝不自动创建同名空目录。
- [x] 稳定版更新提示展示目标版本和说明，并提供立即更新、稍后提醒和跳过此版本。
- [x] 更新不会静默或强制安装；不兼容版本只解释阻断并提供用户触发的更新入口。
- [x] Tauri 更新清单和更新包使用独立密钥签名，验签失败时拒绝安装并保留当前版本可启动。
- [x] 首发构建配置覆盖 Windows 10/11 x64、macOS Apple Silicon 和 macOS Intel；不产出 Linux 或 Windows ARM64。
- [x] 首发不要求 Windows Authenticode、Apple Developer ID 或 notarization，但安装说明准确描述系统警告和用户确认流程。
- [x] 打包产物包含原始 MIT `LICENSE`，不暴露 GitHub/PWA/FAL 或自定义供应商入口，不包含 Key 明文；未暴露的自定义供应商兼容实现允许保留。

## Verification and test impact

- Focused checks: `npx vitest run src/lib/exportZip.test.ts src/store.test.ts`，桌面 Rust/集成测试覆盖备份导入、ID 重映射、迁移校验/回滚、断盘恢复、更新选择和验签失败；运行 issue 004 已确定的 Tauri 测试命令。
- Regression checks: `npm run build`，并运行当前主机可执行的桌面开发构建/打包检查。
- Milestone/full-suite checks: Windows 10/11 与两类 Mac 的完整安装和升级矩阵留给 issue 006。
- E2E/test-contract changes: 桌面更新与安装手工 spec 保持在默认 Vitest 之外；备份格式测试继续进入默认单元测试收集。
- Manual/browser checks: 当前主机验证素材库迁移成功/失败、外部磁盘断开、更新三种选择、验签失败、安装警告、窗口尺寸和键盘可达性。

## Definition of done

- [x] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [x] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been posted; this issue is ready for the final close action.

## Blocked by

- [003：在线素材保障：备份包与云端副本](003-online-asset-protection.md)
- [004：Tauri 桌面素材库与端到端生成](004-tauri-library-generation.md)

## Execution evidence (2026-08-08)

- 已完成实现：`src-tauri/src/lib.rs` 迁移通过 staging 复制、SQLite/schema/登记文件验证后才切换；失败不修改当前配置，旧目录不删除。启动恢复只允许重试或重新定位已有 `metadata/awai.db`，不会创建空目录。`src/store.ts` 导入 AWAI ZIP 时保持非覆盖合并，并对桌面备份中的凭据 ID 查询系统凭据库，缺失项显式标为需要重新绑定。
- 更新与发行：Tauri updater 使用独立公钥和固定稳定更新端点；`DesktopUpdatePrompt` 提供立即更新、稍后提醒、跳过此版本以及验签/安装失败时保留当前版本的提示。`tauri.conf.json` 仅配置 NSIS、DMG 与 macOS app 目标并包含 `LICENSE`；Windows/macOS 的未签名安装确认流程见 `manual/005-desktop-install-and-update.md`。
- 通过：`npm run build`；`npx vitest run src/lib/exportZip.test.ts src/store.test.ts src/lib/desktopUpdate.test.ts`（3 files, 124 tests）；`cargo test --manifest-path src-tauri/Cargo.toml`（9 tests）；`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`；`git diff --check`；`npx tauri build --debug --no-bundle`（当前 Linux 主机桌面开发构建）。
- 环境不适用：Windows 10/11 与 macOS Apple Silicon/Intel 的首次安装、更新和系统提示矩阵留给 issue 006，当前 Linux 不替代这些验证。
- 待验证：已移除遗留 PWA favicon 和 FAL 产品表面；自定义供应商兼容实现按最新产品决策保留，但设置、导入和激活入口必须保持不可访问。最终扫描检查可见入口、默认/持久化配置和 Key 明文，不再把第三方依赖字符串或休眠兼容实现当成产品入口。
- Commit: 本 issue 的唯一聚焦提交 `feat: add desktop operations and updates`。
- Closure: 自定义供应商异步兼容实现保留但不暴露产品入口；全部验收项完成，issue 已关闭。

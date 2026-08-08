# 006：双运行模式最终集成与发布验收

状态：`open`

标签：`ready-for-agent`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

执行 AWAI 在线嵌入版和 Tauri 桌面版的最终集成、缺陷修复与发布验收。该 issue 只解决阻断 PRD 验收的集成问题，不吸收相邻的新功能；完成后应产出可部署在线组件、可验证云端生命周期和 Windows/macOS 首发安装包。

## Acceptance criteria

- [ ] PRD 61 条用户故事和 issue 001-005 的验收项均有可追溯实现与验证证据，没有通过降低测试范围掩盖的未完成项。
- [ ] 在线 iframe 在正确的 `sub2api-no-custom-oauth` 主线部署上完成 JWT、Key 列表、模型发现、OpenAI 图像、Responses Agent 和 Gemini 原生冒烟测试。
- [ ] Sub2API 与对象存储 CORS 仅允许批准的精确 origin，未知 `src_host` 无凭据泄漏。
- [x] 云端直传、30 MB/1 GB 限额、立即删除、24 小时到期、后台补偿和配额释放在部署等价环境通过。
- [x] 在线版在桌面和移动视口无重叠、溢出或不可操作控件，运行任务期间不会被版本刷新中断。
- [ ] Windows 10/11 x64、macOS Apple Silicon 和 macOS Intel 均完成首次安装、素材库权限、系统凭据、生成、重启恢复、备份、迁移和手动升级测试。
- [ ] 手动安装新版本后现有素材库、历史和凭据绑定保持可用；取消或失败时当前版本不受影响。
- [ ] 发布构建必填槽位已配置并验证：Sub2API 固定域名、允许 origins、支持 URL、在线服务、PostgreSQL/S3 和 bundle identifier。
- [x] 最终产物不包含旧品牌、GitHub/PWA/FAL/自定义供应商 UI、旧浏览器数据迁移或凭据明文。
- [ ] 发布记录列出 Web、Node 服务、Windows x64、macOS arm64/x64 产物、哈希、验证结果和已知的未签名安装警告。

## Verification and test impact

- Focused checks: 重跑所有因最终集成修复而直接受影响的聚焦测试，并记录对应命令。
- Regression checks: `npm run build` 后运行 `npm test`；运行在线服务完整测试/构建命令和 Tauri `cargo test`/构建命令（使用 issue 003-005 已建立的正式脚本）。
- Milestone/full-suite checks: 本 issue 承担完整 Vitest、在线服务、桌面宿主、部署冒烟、浏览器视口和 Windows/macOS 发布矩阵。
- E2E/test-contract changes: live/deployment、手工、debug spec 与默认快速回归明确分离；默认测试收集不得依赖外部生产服务。若增加自动 E2E，必须记录稳定 selector 和运行入口。
- Manual/browser checks: 在线版至少检查 `1440x900`、`390x844`；桌面版检查支持矩阵中的真实系统、首次安装和升级。记录截图、日志、产物哈希及每项退出状态。

## Definition of done

- [ ] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [ ] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been posted; this issue is ready for the final close action.

## Verification evidence

完整证据、逐条 AC 状态和真机矩阵见 [`manual/006-release-acceptance.md`](../manual/006-release-acceptance.md)。本地 Web、Node、PostgreSQL/MinIO、Rust、合成 Tauri release 构建及桌面/移动浏览器门禁均通过；生产部署、四类真实桌面系统和正式安装包仍为关闭阻塞项。

## Product decision override

2026-08-08 确认现在及未来均不采用平台代码签名或 Tauri updater 签名。由于 Tauri 自动更新不能关闭验签，本项目撤销 PRD US 56-58 的自动更新要求，桌面升级固定为用户手动安装新版 NSIS/DMG。

## Blocked by

- [003：在线素材保障：备份包与云端副本](003-online-asset-protection.md)
- [005：桌面数据运维、更新与安装包](005-desktop-operations-updates.md)

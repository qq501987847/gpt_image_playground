# 001：AWAI 在线基础与浏览器存储

状态：`closed`

标签：`ready-for-agent`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

把现有浏览器应用收敛为 AWAI创作工作台的在线基础版本。完成品牌替换与不支持入口清理，建立共享运行时边界，并让现有 OpenAI 图像工作流使用全新的 IndexedDB 元数据与 OPFS 图片存储。该切片完成后，现有画廊流程应能在新品牌、新命名空间中完整生成、持久化、恢复和下载图片，为后续 iframe、Gemini、云端和桌面适配提供稳定契约。

## Acceptance criteria

- [x] 所有用户可见名称、页面标题、包元数据、备份默认名称和浏览器存储命名空间统一为 AWAI创作工作台，不再显示旧品牌。
- [x] GitHub 更新、仓库、赞助、上游反馈和支持弹窗入口被移除；原始 MIT `LICENSE` 继续保留并进入后续发行物。
- [x] PWA 注册、安装按钮、manifest 和 service worker 行为被移除，在线版不再宣称可安装。
- [x] FAL 直连、任意自定义 HTTP 供应商及相关配置导入入口被移除；现有 OpenAI 图像与 Responses 能力不回归。
- [x] 认证、凭据、元数据、二进制文件、下载和版本检查通过明确的运行时契约访问，核心 store 只保留状态与 action 入口。
- [x] 新安装只创建 AWAI 数据空间，不读取、迁移或清理旧应用的 IndexedDB、OPFS、localStorage 或缓存。
- [x] IndexedDB 保存任务、收藏、Agent 对话、设置和文件索引；OPFS 保存新生成的原图和缩略图，不再把新图片主体持久化为 Data URL。
- [x] 页面恢复焦点时读取同源 `version.json`；有任务时延后刷新提示，无任务时允许用户刷新。
- [x] “关于”只显示 AWAI 名称、版本、运行模式和 `AWAI_SUPPORT_URL`。
- [x] 剩余浏览器空间低于 100 MB 时警告但不阻止生成；OPFS 写入失败显示“已生成、未保存”，保留内存结果供立即下载。

## Verification and test impact

- Focused checks: `npx vitest run src/lib/apiProfiles.test.ts src/lib/persistedState.test.ts src/lib/imageCache.test.ts src/lib/urlSettings.test.ts src/store.test.ts`，并加入运行时存储契约、OPFS 失败和版本提示测试。
- Regression checks: `npm run build`。
- Milestone/full-suite checks: 留给 issue 006；本 issue 不运行跨平台或完整发布矩阵。
- E2E/test-contract changes: 仓库当前没有默认 E2E 套件；更新依赖旧品牌、PWA、FAL、自定义供应商、Data URL 或 GitHub 版本源的 Vitest 契约，不新增会进入默认套件的 debug/manual spec。
- Manual/browser checks: 在 `1440x900` 和 `390x844` 检查标题、Header、设置、About、存储警告、键盘焦点和长文本布局；确认无重叠和 PWA 入口。

## Definition of done

- [x] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [x] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been posted; this issue is ready for the final close action.

## Blocked by

None - can start immediately.

## Execution evidence (2026-08-07)

- `npm run build` passed after the AWAI browser-storage and branding changes.
- `npx vitest run src/lib/apiProfiles.test.ts src/lib/persistedState.test.ts src/lib/imageCache.test.ts src/lib/urlSettings.test.ts src/store.test.ts` passed: 5 files, 174 tests.
- Headless Chrome inspection at `1440x900` and `390x844` showed the AWAI header, no install control, and no initial-view overflow or overlap. Screenshot evidence: `/tmp/awai-desktop.png`, `/tmp/awai-mobile.png`.
- No commit was created and this issue remains `open`.

## Closure evidence (2026-08-07)

- Commit: `f8f53bf feat: establish AWAI online foundation`.
- `npm run build` passed.
- `npx vitest run src/lib/apiProfiles.test.ts src/lib/persistedState.test.ts src/lib/imageCache.test.ts src/lib/urlSettings.test.ts src/store.test.ts` passed: 5 files, 174 tests.
- Browser verification at `1440x900` and `390x844`: no horizontal overflow; the named Settings dialog opens by keyboard and closes with Escape. Screenshot evidence: `/tmp/awai-desktop-verified.png`, `/tmp/awai-mobile-verified.png`.

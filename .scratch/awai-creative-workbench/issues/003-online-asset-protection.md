# 003：在线素材保障：备份包与云端副本

状态：`closed`

标签：`ready-for-agent`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

为在线版交付两条完整的素材保障路径：用户持有的版本化 AWAI 备份 ZIP，以及默认开启、固定保留 24 小时的云端临时副本。该切片包含浏览器 UI、Node 服务、PostgreSQL 元数据、S3 兼容对象存储直传、限额、删除、过期补偿和失败恢复。

## Acceptance criteria

- [x] AWAI 备份包包含版本化 JSON 清单、图片、任务、提示词、参数、实际尺寸、收藏和 Agent 对话，不包含 JWT 或 Key 明文。
- [x] 导入只做非覆盖合并；冲突 ID 和全部包内引用被一致重映射，损坏、缺失或不支持版本不会产生部分导入。
- [x] 在线服务独立部署，不代理模型请求、不接收 API Key，并只信任允许列表内 Sub2API 的菜单 JWT 回验结果。
- [x] PostgreSQL 只保存用户身份、云端记录 ID、对象路径、字节数、媒体类型、状态时间和 `expires_at`，不保存提示词、请求体、参考内容或 API 响应。
- [x] 云端临时保存默认开启，首次进入明确披露 24 小时；关闭只停止后续上传，已有副本可立即删除或自然到期。
- [x] 只上传生成结果原图与缩略图；参考图、mask 和其他输入附件绝不进入 AWAI 云端存储。
- [x] 单张原图最大 30 MB，每用户确认对象滚动总量最大 1 GB；达到上限不提前删除其他未到期素材。
- [x] 服务端初始化时固定 `expires_at` 并签发对象键受限、10 分钟有效的一次性上传地址；浏览器直接上传对象存储。
- [x] 完成确认重新校验对象键、所有权、实际大小、媒体类型和配额，通过后才把副本置为可用并显示准确到期时间。
- [x] 上传或完成确认最多自动重试两次，复用同一对象且不调用模型；最终失败保持本地成功并允许手动重传。
- [x] 对象存储生命周期执行主删除，后台任务补偿删除原图、缩略图、未确认对象和过期数据库记录，并释放配额。
- [x] 云端失败、超限或清理延迟不改变本地生成任务状态，也不会导致重复扣费。

## Verification and test impact

- Focused checks: `npx vitest run src/lib/exportZip.test.ts src/store.test.ts`，并新增在线服务的认证、直传、限额、确认、删除、受控时间过期和客户端重试集成测试；本 issue 必须为新增服务定义并运行可重复的聚焦测试命令。
- Regression checks: `npm run build`，以及本 issue 新增服务的类型检查/构建命令。
- Milestone/full-suite checks: 生产对象生命周期、完整 CORS 和真实部署冒烟留给 issue 006。
- E2E/test-contract changes: 仓库当前无默认 E2E；更新 ZIP 清单与导入测试契约。PostgreSQL/S3 调试脚本必须显式排除在默认测试收集之外。
- Manual/browser checks: 在 `1440x900` 和 `390x844` 检查默认披露、开关、到期时间、立即删除、仅本地状态、配额错误和下载操作；确认状态变化不引发布局跳动。

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

## Closure evidence (2026-08-08)

- Commit: `b4e16b95167f78fe8eaa7b579d369d6bacf473bf feat: protect online generated assets`.
- Backup/client/store focused gate passed: `npx vitest run src/lib/exportZip.test.ts src/lib/backupImport.test.ts src/lib/cloudAssets.test.ts src/store.test.ts` (4 files, 126 tests).
- Online service build passed: `npm run build:online-assets`.
- Online service focused gate passed: `npm run test:online-assets` (3 files, 10 tests).
- Regression build passed: `npm run build` (`tsc -b && vite build`).
- Browser verification passed with controlled Sub2API/service mocks at `1440x900` and `390x844`: first-entry 24-hour disclosure, URL token removal, keyboard switch operation, exact expiry, immediate-delete/download/retry accessible names, local-only quota error, and no horizontal overflow or state-change layout shift. Screenshots: `/tmp/awai-003-desktop.png`, `/tmp/awai-003-mobile.png`.
- Production object lifecycle, complete deployment CORS, real service smoke tests, and the final release matrix were not run and remain scoped to issue 006.

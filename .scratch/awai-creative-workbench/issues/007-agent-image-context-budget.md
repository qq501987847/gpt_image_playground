# 007 Agent 图片上下文预算与按需引用

状态：`closed`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

提高浏览器直连 Responses 时的 Agent 请求可靠性。Agent 只为模型观察准备独立的等比缩放副本，在单图限制之外增加整次请求的图片上下文总预算，并按当前轮、工具续轮和显式历史引用的优先级选择图片。历史中未被当前操作引用的图片不再重复发送；本地原图及真正生图请求的参考图路径保持不变。同时移除首轮对话标题的额外上游请求，避免用户发送一条消息时产生两个并行 Responses 请求。

## Acceptance criteria

- [x] 大于观察阈值的 Agent 参考图使用不裁剪的 WebP 观察副本，单张目标不超过 2 MiB；小图允许原样透传，失败时有可用缩略图回退。
- [x] 初始 Agent 请求和同轮工具续请求发送的图片总数据量不超过 8 MiB，并按“当前工作流输入（当前轮附件及已批准技能的源参考图）、当前工具续轮新图、当前文本显式引用的历史图”的顺序保留；超出预算的低优先级图片只保留引用占位，不发送图片数据。
- [x] 历史生成图只有在当前提示词明确引用时才重新发送，引用 ID、图片顺序和缺失/被预算移除的占位语义稳定，且同一图片不会在一个请求中重复发送。
- [x] Agent 观察副本不覆盖 IndexedDB/OPFS 或内存中的原图；真正的 Gemini/OpenAI 生图调用仍读取原图。
- [x] 用户首轮发送只发起一次主 Responses 请求；会话标题使用本地摘要，工具调用导致的后续 Responses 请求不受影响。
- [x] 等待状态能区分纯文本等待与“正在准备参考图并等待模型响应”，不会让用户误以为页面已经卡死。

## Verification and test impact

- Focused checks: `npx vitest run src/lib/agentObservationImage.test.ts src/lib/agentInputBuilder.test.ts src/lib/imageCache.test.ts src/lib/agentApi.test.ts src/store.test.ts`
- Regression checks: `npm run build`、`npm test`、`git diff --check`
- Milestone/full-suite checks: 本 issue 的共享请求构造逻辑影响所有 Agent 对话，因此全量 Vitest 作为本 issue 的回归门；真实 Sub2API 长连接和生产部署留给发布验收。
- E2E/test-contract changes: 不新增默认 E2E；现有 Agent 输入构造与 store fetch mock 必须更新为单主请求及预算后的图片集合。
- Manual/browser checks: 在本地 Chrome 上传至少一张 4K 图片，确认观察副本等比缩小、原图数据未变化，发送后只出现一个初始 `/responses` 请求。

## Definition of done

- [x] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [x] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been recorded; this issue is ready for the final close action.

## Blocked by

None - can start immediately.

## Closure evidence

- Implementation commit: `d7ca6fd` (`fix: bound agent image context`)
- Focused: 5 files, 158 tests passed.
- Regression: `npm run build` passed; `npm test` passed with 502 tests and 1 skipped; `git diff --check` passed.
- Browser: desktop and 390×844 mobile layouts had no page or horizontal overflow; pure-text and image-reference waiting labels were both observed; one submission produced exactly one initial `POST /v1/responses`.
- Large image: Chrome verified a 3840×2160, 20.82 MB PNG produced a 2048×1152, 1.69 MB uncropped observation WebP while the original data URL remained unchanged.

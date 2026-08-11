# 008 浏览器可恢复 Agent 执行

状态：`closed`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

保持浏览器直接调用 Sub2API，不把模型流量、API Key、提示词或参考图迁移到 AWAI 在线服务。Agent 每轮继续使用已持久化的会话、Responses 输出和带稳定 `toolCallId` 的图片任务作为本地执行检查点。

页面刷新或浏览器连接中断后，初始化流程必须收敛遗留的 `running` 状态：若本轮已经持久化了成功的付费图片结果，则恢复为可手动“继续回复”的 `partial` 状态，并补齐缺失的工具结果；若没有可复用的成功结果，则明确结束为可重新生成的 `error` 状态。恢复不得自动发起新的模型请求，也不得重复执行图片工具。

## Acceptance criteria

- [x] 在线版、桌面版和本地开发模式继续由客户端直接调用 Sub2API；不新增服务端 Agent Run、模型代理、SSE 或云端提示词/参考图存储。
- [x] Agent 会话持久化每轮 Responses 输出、稳定工具调用 ID 与图片任务绑定，成功图片在继续 Responses 前已经写入本地存储。
- [x] 初始化时不保留失去浏览器执行器的 `running` 状态：已有成功图片和可重建工具结果的轮次恢复为 `partial`，其他中断轮次恢复为 `error`，会话不会永久 busy。
- [x] 恢复为 `partial` 的轮次仅在用户点击“继续回复”后调用 Responses，并复用已保存的工具结果；恢复请求禁用图片工具，不再次调用生图接口。
- [x] 重复初始化、重复点击继续或再次刷新保持幂等，不重复追加工具结果、不并发继续同一轮，也不产生重复图片任务。
- [x] 共享 Agent UI 与执行核心不按在线版和桌面版分叉；页面关闭期间不承诺任务继续执行，也不承诺逐字恢复已丢失的流式文本。

## Verification and test impact

- Focused checks: Agent 中断轮次恢复纯函数测试；初始化状态收敛测试；继续回复复用已保存图片且不调用生图接口的 store 测试；重复恢复幂等测试。
- Regression checks: `npm run build`、`npm test`。
- E2E/test-contract changes: 浏览器流程覆盖生图完成、Responses 续写尚未完成时刷新，确认图片保留、轮次显示“继续回复”、点击后不产生第二张图片。
- Manual/browser checks: Chrome 桌面端验证刷新恢复、重复点击继续和无图片的纯文本中断；确认没有永久等待或冲突提交。

## Definition of done

- [x] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [x] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been recorded; this issue is ready for the final close action.

## Blocked by

- [007 Agent 图片上下文预算与按需引用](007-agent-image-context-budget.md)

## Closure evidence

- Implementation commit: `7278969` (`fix: recover interrupted agent rounds locally`)
- Focused: `npm test -- --run src/lib/agentConversationState.test.ts src/lib/agentResponseState.test.ts src/store.test.ts` passed, 150 tests.
- Regression: `npm run build` passed; `npm test` passed with 506 tests and 1 skipped; `git diff --check` passed.
- Browser: Chrome desktop injected a persisted `running` round with a completed image task, then refreshed twice; the image remained visible, the round became `partial`, exactly one tool result existed, “继续回复” was keyboard-accessible, and no Responses/image request was sent automatically.
- Text interruption: Chrome desktop injected and refreshed a text-only `running` round; it became a visible “上次请求已中断” error with regeneration available and no permanent busy/stop state.
- UI scope: no component or CSS changed, so new desktop/mobile layout verification was not applicable; existing responsive UI was exercised only through the unchanged Agent controls above.

# 002：Sub2API 身份、Key 配置与 Gemini/Agent 生图

状态：`closed`

标签：`ready-for-agent`

## Parent

[AWAI创作工作台 PRD](../PRD.md)

## What to build

交付在线 iframe 到 Gemini/Agent 输出的完整 Sub2API 工作流。应用从可信自定义菜单上下文启动，读取用户自己的 Key 并按 API 配置绑定，随后通过对应 Key 发现模型、调用 Gemini 原生图像接口，或由 Responses Agent 使用单独的图像配置完成混合生图。

## Acceptance criteria

- [x] 解析 `user_id`、`token`、`theme`、`lang`、`ui_mode`、`src_host` 和 `src_url`；JWT 写入 `sessionStorage` 后立即从 URL 移除，并使用 `no-referrer` 策略。
- [x] `src_host` 必须命中部署注入的精确 HTTPS origin 允许列表；未知地址不会收到 JWT 或 API Key，并显示入口无效。
- [x] 使用菜单 JWT 读取 Sub2API 用户资料和完整 Key 列表；Key 明文只驻留页面内存，持久化层只记录 `origin + user_id + API 配置 ID -> Key ID`。
- [x] 每个 API 配置绑定一个 Key，同一 Key 可复用；Key 删除、停用、过期或耗尽只禁用受影响配置。
- [x] 配置流程先选 Key，再分别通过 `/v1/models` 或 `/v1beta/models` 获取该分组模型；不同 Key 的模型不合并，并保留标为未验证的自定义模型 ID。
- [x] 新增 Gemini 原生提供商和 `gemini-3.1-flash-image-preview`、`gemini-3-pro-image-preview` 预设，只向可信 Sub2API origin 调用 `/v1beta/models/{model}:generateContent`。
- [x] Gemini 支持文生图及一张或多张参考图；从所有候选的 `inlineData` 提取图片并保留伴随文本及上游错误信息。
- [x] 标准比例和 Flash 扩展比例按 PRD 展示；自动比例省略 `aspectRatio`，自动分辨率省略 `imageSize`，实际像素尺寸写入任务。
- [x] Gemini UI 不显示 mask、`n`、OpenAI quality、moderation、compression 或 transparent output 控件。
- [x] Agent 保留关闭、原生和混合模式；混合模式允许 Responses 文本配置与 Gemini 或 `gpt-image-2` 图像配置绑定不同 Key。
- [x] 图像成功而 Responses 续写失败时进入“部分完成”并保留图片；“继续回复”不再次生图，“重新生成本轮”先提示可能重复计费。
- [x] 结果未知的生成请求不跨 Key、域名或节点自动重试。

## Verification and test impact

- Focused checks: `npx vitest run src/lib/api.test.ts src/lib/apiProfiles.test.ts src/lib/agentApi.test.ts src/lib/agentInputBuilder.test.ts src/lib/agentResponseState.test.ts src/lib/agentAssistantBlocks.test.ts src/lib/paramCompatibility.test.ts src/lib/size.test.ts src/store.test.ts`，并新增 iframe bootstrap 与 Gemini 原生适配测试。
- Regression checks: `npm run build`。
- Milestone/full-suite checks: 真实 Sub2API CORS 和模型冒烟测试留给 issue 006。
- E2E/test-contract changes: 仓库当前无默认 E2E；迁移依赖旧配置结构、供应商列表、参数可见性和 Agent 状态的测试契约，所有网络测试使用受控 mock，不把 live spec 加入默认套件。
- Manual/browser checks: 在 `1440x900` 和 `390x844` 验证嵌入模式、Key/模型选择、Gemini 参数、Agent 部分完成和键盘操作；检查所有长模型名不溢出。

## Definition of done

- [x] Every acceptance criterion has implementation evidence and verification evidence.
- [x] All focused and regression checks required by this issue and repository guidance pass.
- [x] UI work has been verified in a running browser at required desktop/mobile sizes, including keyboard and accessibility behavior; otherwise this is explicitly not applicable with a reason.
- [x] The final diff contains only changes attributable to this issue.
- [x] Exactly one focused implementation commit has been created for this issue.
- [x] Satisfied checkboxes have been changed to `[x]`; the commit hash and verification evidence have been posted; this issue is ready for the final close action.

## Blocked by

- [001：AWAI 在线基础与浏览器存储](001-awai-online-foundation.md)

## Closure evidence (2026-08-08)

- Commit: `6f2c791 feat: add Sub2API Gemini and Agent workflow`.
- Focused gate passed: 13 files, 256 tests.
- Regression gate passed: `npm run build` (`tsc -b && vite build`).
- Browser evidence: mocked Sub2API only at `1440x900` and `390x844`; verified token removal and invalid-origin rejection, Key/model binding, hidden API URL/plaintext Key, Gemini controls and long-model containment, keyboard submission, partial Agent preservation/continuation, and duplicate-charge warning.
- No issue 006 live or release checks were run.

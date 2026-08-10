# ADR-0001：以原生协议接入 Gemini 图像生成

## 状态

已接受

## 背景

AWAI创作工作台需要通过 Sub2API 支持 Gemini 图像生成。现有 OpenAI 兼容提供商遵循 OpenAI 图像请求与响应格式；Sub2API 的 Gemini 原生中继使用不同的端点、鉴权头、请求结构和内联图片响应。

## 决策

新增 Gemini 原生提供商，只向用户所属的 Sub2API 地址发送 `/v1beta/models/{model}:generateContent` 请求。浏览器使用 Sub2API 原生中继支持的 `Authorization: Bearer <API Key>` 鉴权，避免增加额外 CORS 请求头；桌面版可使用同一形式。响应从 `candidates[].content.parts[].inlineData` 中提取图片。不提供 Google 官方地址或直连模式。

首发同时移除 FAL 直连和任意自定义 HTTP 供应商入口。应用只保留同一 Sub2API 地址上的 OpenAI 兼容图像接口、Responses API 与 Gemini 原生接口。模型 ID 可以手动填写，但用户不能编辑请求域名。

保留现有 Agent 模式。Agent 的文本模型继续通过 Sub2API `/v1/responses` 完成多轮对话和工具编排；混合模式下，图像工具使用用户单独选择的图像 API 配置，可调用 Gemini 原生提供商，也可调用 OpenAI 兼容的 `gpt-image-2` 等图像模型。Gemini `generateContent` 不承担 Responses API 的对话编排职责。

混合模式中，图像调用成功后立即把结果持久化到画廊和当前轮次。若随后向 Responses API 续写失败，轮次标记为“部分完成”，已生成图片仍然保留；文本链路失败不得删除用户已经付费生成的结果。

部分完成状态提供两个不同操作。“继续回复”复用已经保存的图片和工具输出，仅重试 Responses 续写，不得再次调用图像模型；“重新生成本轮”重新执行完整工具链，执行前明确提示可能再次生图和扣费。界面不使用语义含糊的单一“重试”操作合并两者。

## 后果

Gemini 可获得其原生的文生图与参考图能力，也能在界面中按其能力限制呈现参数。请求分派、配置迁移和测试需要覆盖新增提供商；不能将其作为 OpenAI 兼容配置导入。

宽高比由受控的模型能力表动态展示，能力表的条目须以官方文档和实际请求验证。产品预设的基础比例为 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`5:4`、`4:5`、`21:9`；已确认 `gemini-3.1-flash-image-preview` 还支持 `8:1`、`4:1`、`1:4`、`1:8`。

“自动”比例在客户端以缺省字段表达：请求不得发送 `aspectRatio: "auto"`，而应省略 `generationConfig.imageConfig.aspectRatio`，否则上游会返回 HTTP 400。

界面仅提供自动、`1K`、`2K`、`4K`；自动时省略 `generationConfig.imageConfig.imageSize`，模型不支持当前选择时回退为自动。请求的分辨率只是目标值：应用须读取输出图片的实际尺寸并写入任务记录，不能假定上游始终遵守 `imageSize`。

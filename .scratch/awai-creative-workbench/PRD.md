# AWAI创作工作台 PRD

状态：`ready-for-agent`

## Problem Statement

现有应用以 GPT Image Playground 品牌、GitHub 发布与反馈入口、PWA 安装方式、浏览器 Data URL 持久化和多个外部供应商为中心，无法直接作为 Sub2API 自定义菜单中的正式创作工具，也不能满足桌面端长期、可见、可迁移的素材保存需求。

用户需要一个统一的 AWAI创作工作台：在线版可以从 Sub2API 菜单直接进入、选择自己不同计费分组的 Key，并使用 OpenAI 图像、Responses Agent 和 Gemini 原生生图；桌面版可以使用同一套创作体验，把图片和历史可靠地保存到本机素材库。两个版本不能演变成两套分叉产品，也不能泄露菜单 JWT、API Key 或输入参考素材。

## Solution

将产品重命名为 AWAI创作工作台，移除可见的旧品牌、GitHub、赞助、上游反馈和 PWA 痕迹。保持一套 React UI、任务模型、Agent 逻辑和 Sub2API 协议适配，通过运行时适配器提供在线嵌入版与 Tauri 桌面版。

在线版从 Sub2API 自定义菜单取得受允许列表约束的嵌入上下文，使用菜单 JWT 读取用户 Key，由用户为每个 API 配置分别绑定 Key。浏览器以 IndexedDB 保存元数据与索引、OPFS 保存图片；生成结果默认额外直传 AWAI 在线服务并保留 24 小时，用户可关闭或立即删除。

桌面版固定连接正式 Sub2API 逻辑域名，用户手动录入一个或多个 Key，明文写入系统凭据库。图片保存为素材库中的普通文件，任务、收藏、Agent 对话和索引保存到 SQLite。桌面首发不引入项目概念，只提供一个当前素材库目录和可靠的素材库迁移。

Gemini 作为原生协议提供商接入 `/v1beta/models/{model}:generateContent`，支持文生图和一张或多张参考图编辑。Agent 保留 Responses 原生模式和文本/图像双配置的混合模式，可用不同 Key 分别调用 Responses 与 Gemini 或 `gpt-image-2`。

## User Stories

1. As an AWAI user, I want the product to display AWAI创作工作台 branding, so that I am not confused by the upstream project identity.
2. As an AWAI user, I want GitHub, sponsor, upstream feedback, and PWA install entries removed, so that the application presents one official product surface.
3. As an AWAI user, I want the original MIT license retained in source and desktop distributions, so that the upstream license obligations remain satisfied.
4. As an online user, I want to enter AWAI from a Sub2API custom menu without signing in again, so that the embedded workflow is immediate.
5. As an online user, I want the menu token removed from the visible URL immediately, so that it is less likely to leak through copied URLs or referrers.
6. As an online user, I want AWAI to reject an unknown `src_host`, so that my JWT and API Keys are not sent to an unapproved origin.
7. As an online user, I want AWAI to list my Sub2API Keys, including their group and status, so that I can select the intended pricing group.
8. As an online user, I want each API configuration to bind its own Key, so that Agent text, Gemini images, and `gpt-image-2` can use different groups.
9. As an online user, I want only Key IDs remembered between visits, so that full Key values are not persisted in browser storage.
10. As an online user, I want a deleted, disabled, expired, or exhausted Key to disable only affected configurations, so that unrelated configurations continue working.
11. As a model user, I want to choose a Key before loading models, so that the model list reflects that Key's group.
12. As an advanced user, I want to enter a custom model ID, so that I can use newly added Sub2API models before the preset list is updated.
13. As a Gemini user, I want `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview` presets, so that common image models require no manual entry.
14. As a Gemini user, I want standard aspect ratios and Flash-specific `8:1`, `4:1`, `1:4`, and `1:8` ratios, so that I can create standard and extreme-format images.
15. As a Gemini user, I want an automatic aspect-ratio option that omits `aspectRatio`, so that the request does not fail with an invalid `auto` value.
16. As a Gemini user, I want automatic, `1K`, `2K`, and `4K` resolution choices, so that I can control output size without OpenAI-specific quality parameters.
17. As a Gemini user, I want automatic resolution to omit `imageSize`, so that the upstream model chooses the size using its native behavior.
18. As a Gemini user, I want returned pixel dimensions recorded, so that history reflects the actual file rather than only the requested resolution.
19. As a Gemini user, I want to use one or multiple reference images without masks, `n`, OpenAI quality, moderation, or transparent-output controls, so that the UI matches the native API capability.
20. As an Agent user, I want Responses to handle conversation while a separate image configuration handles generation, so that I can combine different pricing groups.
21. As an Agent user, I want a successful image retained when Responses continuation fails, so that a paid output is never discarded because of a later text failure.
22. As an Agent user, I want “继续回复” to reuse saved tool results without generating again, so that retrying text does not create duplicate charges.
23. As an Agent user, I want “重新生成本轮” to warn before rerunning the full tool chain, so that duplicate image charges are explicit.
24. As an online user, I want generated images stored in OPFS rather than Base64 records, so that browser storage is more efficient.
25. As an online user, I want task metadata and file indexes stored in IndexedDB, so that history can be searched and restored without embedding image bytes in records.
26. As an online user, I want a low-space warning below 100 MB without generation being blocked, so that I can still generate and immediately download an output.
27. As an online user, I want an OPFS write failure shown as “已生成、未保存”, so that the UI does not falsely claim the result is persistent.
28. As an online user, I want unsaved output kept in page memory for immediate download, so that a successful generation is still recoverable.
29. As an online user, I want generated originals and thumbnails backed up to the cloud by default for 24 hours, so that I can download them after local browser storage problems.
30. As a privacy-conscious user, I want to disable future cloud uploads and immediately delete existing cloud copies, so that I retain control over generated outputs.
31. As an online user, I want reference images and other input attachments excluded from cloud storage, so that private source material is not retained.
32. As an online user, I want each cloud copy to show an exact expiry time, so that deletion timing is predictable.
33. As an online user, I want a single-image cloud limit of 30 MB and a rolling user limit of 1 GB, so that limits are clear before upload.
34. As an online user, I want a cloud quota failure to leave existing copies untouched, so that new uploads do not evict unexpired material unexpectedly.
35. As an online user, I want failed cloud transfers retried without regenerating the image, so that transient storage errors do not cause model charges.
36. As an online user, I want immediate and ZIP downloads, so that I can take durable possession of my outputs.
37. As an AWAI user, I want a portable AWAI backup ZIP, so that I can move complete history between online and desktop modes.
38. As an AWAI user, I want backup imports merged without overwriting current records, so that importing cannot destroy existing history.
39. As a desktop user, I want to paste one or more Sub2API Keys manually, so that I can use different groups without requiring a new OAuth or Deeplink flow.
40. As a desktop user, I want the same saved Key reusable by several API configurations, so that a future composite group does not require duplicate credentials.
41. As a desktop user, I want Key plaintext stored in Windows Credential Manager or macOS Keychain, so that it is not written to my素材库 or backup files.
42. As a desktop user, I want the official Sub2API domain fixed by the release build, so that the app cannot be redirected to arbitrary providers.
43. As a desktop user, I want a suggested `文档/AWAI创作工作台`素材库 on first launch, so that setup is simple but remains explicit.
44. As a desktop user, I want to confirm the素材库 location before any files are written, so that the app does not create unexpected folders.
45. As a desktop user, I want generated files visible under `generated/`, so that I can access them outside AWAI.
46. As a desktop user, I want reference and export files organized separately, so that the素材库 remains understandable.
47. As a desktop user, I want structured history saved transactionally in SQLite, so that crashes do not corrupt a single rewritten JSON document.
48. As a desktop user, I want only one AWAI application instance, so that concurrent processes cannot write the素材库 at the same time.
49. As a desktop user, I want素材库 changes blocked while tasks are running, so that returned outputs cannot be written to an ambiguous location.
50. As a desktop user, I want AWAI to migrate and verify my素材库 before switching locations, so that large moves are recoverable.
51. As a desktop user, I want the old素材库 retained after migration, so that I can manually verify and delete it later.
52. As a desktop user, I want a recovery screen when the素材库 is unavailable, so that a disconnected disk is not mistaken for an empty history.
53. As a desktop user, I want missing credentials after backup import shown as needing rebinding, so that backups never silently contain or invent Keys.
54. As a Windows user, I want an x64 installer for Windows 10 and 11, so that AWAI runs on the initially supported Windows systems.
55. As a macOS user, I want Apple Silicon and Intel builds, so that both current Mac architectures are supported at launch.
56. As a desktop user, I want stable release notes beside each installer, so that I understand what will change before a manual upgrade.
57. As a desktop user, I want manual upgrades to preserve my素材库 and credential references, so that installing a new version does not lose work.
58. As a desktop user, I want unsigned-installer warnings documented, so that SmartScreen or Gatekeeper prompts are expected rather than misleading.
59. As an online user, I want update prompts sourced from AWAI rather than GitHub, so that the branded app has no upstream dependency.
60. As an online user, I want refresh prompts delayed until running tasks finish, so that an update does not interrupt generation.
61. As an AWAI user, I want an About view with product name, version, runtime mode, and official support, so that I can identify the running build.

## Implementation Decisions

- Deliver one codebase in two phases. Phase 1 ships the online iframe, shared runtime contracts, Gemini provider, OPFS storage, backup format, branding cleanup, and AWAI online service. Phase 2 adds the Tauri host, system credentials, SQLite 素材库, installers, and manual upgrade verification.
- Keep the existing React, Vite, TypeScript, Zustand, Tailwind, npm, and Vitest stack. Do not edit generated distribution output by hand.
- Preserve the original MIT `LICENSE` in source and packaged desktop distributions while removing visible upstream branding and links from the application UI and product metadata.
- Remove PWA registration, manifest/install entry, service worker behavior, and PWA-specific product affordances. The online iframe remains a browser application, not an installable PWA.
- Remove the FAL client dependency and FAL provider path. Remove arbitrary custom HTTP provider configuration and import surfaces. Retain only Sub2API OpenAI-compatible images, Responses, and Gemini-native protocols.
- Introduce a runtime boundary for authentication, credentials, persistent metadata, binary files, downloads, and version/update behavior. Shared UI and domain actions call the boundary rather than checking browser or Tauri globals throughout components.
- Keep the core store focused on state and actions. Provider request construction, storage operations, migrations, archive conversion, and runtime-specific behavior live outside the store.
- Online iframe input accepts `user_id`, `token`, `theme`, `lang`, `ui_mode=embedded`, `src_host`, and `src_url`. Store the JWT in `sessionStorage`, immediately remove it from the URL with `history.replaceState`, and emit `Referrer-Policy: no-referrer`.
- Validate `src_host` against an exact HTTPS origin allowlist injected at deployment. Do not use wildcard origins. Do not send JWT or API Keys before validation succeeds.
- Sub2API must allow the exact AWAI HTTPS origin in its CORS configuration and permit the `Authorization` header.
- Online identity and Key APIs use the menu JWT. The full Key list is held only in page memory. Persist binding records by `Sub2API origin + user_id + API configuration ID -> Key ID`.
- Each API configuration binds exactly one Key. One Key may be reused by multiple configurations. Do not automatically switch or fail over between Keys.
- When editing a configuration, select the Key first, query that Key's group-specific model endpoint, then select the model. Query OpenAI-compatible models through `/v1/models` and Gemini models through `/v1beta/models`. Keep a separate custom model ID entry and mark it unverified.
- The online model request base is the validated `src_host`. The desktop model request base is the required release variable `AWAI_SUB2API_BASE_URL`. A production desktop build fails if the variable is missing.
- Do not retry an ambiguous generation request against a different node or domain. Infrastructure failover occurs behind the stable logical domain. A signed disaster-recovery endpoint list may be used only when the logical domain is wholly unavailable.
- Add a native Gemini provider using `Authorization: Bearer <Sub2API API Key>` and `/v1beta/models/{model}:generateContent`.
- Build Gemini contents from prompt text plus zero, one, or multiple inline reference-image parts. Do not send masks or OpenAI-only image fields.
- Parse every image found in `candidates[].content.parts[].inlineData`. Preserve returned text when present and surface upstream error details without assuming an OpenAI envelope.
- Preset `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview`; keep model ID editable.
- Standard Gemini ratios are `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `5:4`, `4:5`, and `21:9`. Flash additionally exposes `8:1`, `4:1`, `1:4`, and `1:8`.
- Automatic ratio omits `generationConfig.imageConfig.aspectRatio`; never serialize `aspectRatio: "auto"`.
- Resolution options are automatic, `1K`, `2K`, and `4K`. Automatic omits `generationConfig.imageConfig.imageSize`. If capability data says a selected size is unavailable, normalize to automatic before submission.
- Do not expose mask, `n`, OpenAI quality, moderation, output compression, or transparent-output controls for Gemini. Keep provider-specific parameter visibility and normalization explicit.
- Decode returned images, inspect actual pixel dimensions, and save those dimensions with the task. Requested resolution is not authoritative.
- Retain Agent `off`, `native`, and `hybrid` configuration modes. Native uses the Responses profile's built-in image tool. Hybrid uses a Responses text profile and a separately selected Gemini or OpenAI-compatible image profile.
- Persist a generated Agent image before sending the continuation to Responses. Add a `partial` round outcome for successful image generation followed by continuation failure.
- “继续回复” reuses persisted tool outputs and never invokes image generation. “重新生成本轮” starts a new full execution only after a duplicate-charge warning.
- Online storage uses IndexedDB for tasks, conversations, favorites, settings, file indexes, Key IDs, and archive metadata. Use OPFS for original images and thumbnails; do not store new image bodies as Data URLs.
- AWAI is a first public release with a new browser storage namespace. Do not read, migrate, or clean the upstream application's IndexedDB, OPFS, localStorage, or caches.
- Before online generation, use `navigator.storage.estimate()`. Warn below 100 MB remaining but allow generation. When OPFS persistence fails, retain the result in memory, mark it as generated but unsaved, and offer immediate download.
- Define a versioned AWAI backup ZIP manifest shared by online and desktop runtimes. Include images, tasks, prompts, parameters, actual dimensions, timestamps, favorites, Agent conversations, and internal references. Exclude JWTs and Key plaintext.
- Backup import is non-destructive merge only. Remap colliding IDs and every internal reference atomically. Do not provide “clear then restore”.
- AWAI online service is an independent Node service in this repository. It does not proxy model traffic or store API Keys.
- The online service verifies menu JWT identity against an allowed Sub2API origin, stores temporary metadata in PostgreSQL, and stores original outputs and thumbnails in an S3-compatible object store.
- PostgreSQL stores only the owning user identity, cloud record/task ID, object paths, byte counts, media types, status timestamps, and `expires_at` needed for lifecycle enforcement. Do not store prompts, model request bodies, reference content, or API responses in the cloud service.
- Cloud temporary storage is enabled by default. First entry discloses the 24-hour retention. Turning it off affects future uploads only; existing copies remain until expiry unless immediately deleted by the user.
- Never upload reference images, masks, or other input attachments to AWAI cloud storage. Request-processing input buffers are released after the request.
- Enforce a 30 MB original-image limit and a 1 GB rolling per-user total over confirmed originals and thumbnails on both preflight and server confirmation paths.
- Initialize a cloud record and immutable `expires_at` before issuing an object upload URL. The upload URL is one-time, object-key constrained, and valid for 10 minutes. The 24-hour period begins at server initialization and is not extended by upload completion.
- Browser uploads directly to object storage. After upload, the service checks object key, actual bytes, media type, ownership, and quota before marking the record available.
- Retry the same object upload or confirmation at most twice. Reuse its object key and never re-run model generation. Unconfirmed or invalid objects are removed by compensation cleanup and do not consume confirmed quota.
- Object storage lifecycle rules are the primary expiry mechanism. A Node background job removes residual originals, thumbnails, unconfirmed uploads, and expired PostgreSQL rows.
- Desktop is a single-instance Tauri application with one current素材库 and no project model. A second launch focuses the existing window.
- First launch proposes the platform Documents directory plus `AWAI创作工作台`; do not create folders until the user confirms or chooses another location.
- Desktop素材库 contains `generated/`, `references/`, `exports/`, and `metadata/`. Running tasks block素材库 location changes and migration.
- Desktop metadata lives in `metadata/awai.db` SQLite with explicit schema versions and sequential migrations. SQLite stores relative paths, not image blobs.
- Write managed binary output to a temporary file, atomically rename it, then commit its metadata transaction. Clean unregistered temporary files after failure.
-素材库 migration copies the database and all managed files to a new directory, verifies the database/schema and every registered file, then switches the active location. Never automatically delete the old directory.
- If the configured素材库 is unavailable at launch, show only retry and relocate-existing-library actions. Never create an empty directory at the missing path.
- Desktop credentials are global to the application. Users paste one or more Keys; store plaintext only in Windows Credential Manager or macOS Keychain. API configurations and backups store credential IDs.
- A missing desktop credential places dependent configurations into a rebind-required state. Do not recover Key plaintext from素材库 metadata or backups.
- Desktop supports Windows 10/11 x64 and macOS Apple Silicon and Intel at first release. Linux and Windows ARM64 are out of scope.
- The project does not configure OS installer signing, notarization, or Tauri updater signing. Document the resulting SmartScreen and Gatekeeper warnings.
- Desktop upgrades use stable NSIS/DMG installers and are initiated manually by the user. Do not check, download, or install desktop updates in the application.
- Online version checks use same-origin `version.json` when the page regains focus. Prompt to refresh only with no active tasks; otherwise defer until tasks settle.
- Configure `AWAI_SUPPORT_URL` at deployment. About shows AWAI name, version, runtime mode, and that support entry only.
- Keep unresolved release-specific values as required deployment slots: `AWAI_SUB2API_BASE_URL`, allowed Sub2API origins, `AWAI_SUPPORT_URL`, AWAI online service origin, S3/PostgreSQL settings, and Tauri bundle identifier.

## Testing Decisions

- Prefer behavior tests at five stable seams: provider request/response adapters, runtime storage contract, store/domain workflows, AWAI online service API, and packaged Tauri host behavior. Avoid assertions against private component state or exact internal helper structure.
- Extend the existing fetch-mocked image API tests with Gemini native cases covering text-only generation, one and multiple references, exact request nesting, Bearer auth, inline image extraction, mixed text/image parts, multiple candidates, malformed responses, and upstream errors.
- Add explicit serialization tests proving automatic ratio omits `aspectRatio`, automatic resolution omits `imageSize`, and no Gemini request contains mask, `n`, quality, moderation, compression, or transparent-output fields.
- Add capability-table tests for both preset models, all standard ratios, Flash-only extreme ratios, custom model fallback, and actual dimension recording.
- Reuse the existing API profile tests to cover Sub2API-only providers, Key/credential references, model-list ordering, invalid bindings, custom model IDs, and removal of FAL/custom-provider imports.
- Extend existing Agent API, response-state, assistant-block, and store tests for separate text/image profiles, Gemini hybrid tool calls, partial completion, continuation-only retry, full regeneration warnings, and preservation of paid outputs.
- Define one runtime storage conformance suite and run its applicable behaviors against browser IndexedDB/OPFS and desktop SQLite/files: save, read, list, delete, reference cleanup, interruption recovery, atomic metadata/file visibility, and missing binary handling.
- Add browser storage tests for no legacy namespace access, OPFS file/index consistency, below-100-MB warning, generated-unsaved state, memory download recovery, and quota/write failures.
- Extend existing ZIP tests with the versioned AWAI manifest, all included domain records, credential exclusion, non-destructive merge, collision remapping, cross-reference repair, corrupt files, missing files, unsupported versions, and online-to-desktop round trips.
- Add iframe bootstrap tests for allowed and rejected origins, URL token removal, `sessionStorage` lifetime, theme/language propagation, JWT-authenticated Key listing, full-Key memory-only behavior, and per-configuration Key ID persistence.
- Add model discovery tests against both `/v1/models` and `/v1beta/models`, ensuring lists are not merged across Keys and failed discovery leaves only explicitly unverified presets/custom IDs.
- Test cloud service APIs with real PostgreSQL and S3-compatible test containers where feasible. Cover JWT identity mismatch, origin rejection, preflight limits, signed object-key constraints, confirmation checks, duplicate confirmations, 30 MB enforcement, 1 GB races, immediate deletion, and exact `expires_at`.
- Test lifecycle cleanup with controlled time: confirmed expiry, abandoned upload cleanup, object lifecycle lag, database compensation, thumbnails, idempotent repeated cleanup, and quota release.
- Test upload client behavior with mocked signed URLs: two retries, confirmation-only retry after successful PUT, expired URL recovery through a new upload initialization, local success preservation, and proof no model request is repeated.
- Add Tauri host integration tests for single instance, first-run directory confirmation, directory permissions, SQLite migration, atomic file/database writes, credential storage/rebinding, missing 素材库 recovery, migration verification, and rollback on failed migration.
- Validate desktop packages on Windows 10/11 x64, macOS Apple Silicon, and macOS Intel for first install, launch warnings caused by unsigned OS packages,素材库 access, credential prompts, manual upgrade data retention, and relaunch.
- Test branding through user-visible behavior: document title, package/app names, About content, backup filenames, IndexedDB/OPFS namespaces, installer metadata, and absence of GitHub/PWA/FAL/custom-provider UI.
- Run `npm run build` before `npm test` for each implementation slice. Add Node service and Tauri-specific build/test commands when those workspaces are introduced, without replacing npm for the existing frontend.

## Out of Scope

- A PWA or browser-installed application.
- Linux and Windows ARM64 desktop packages at first release.
- Windows Authenticode or Apple Developer ID/notarization signing at first release.
- Beta channels, staged rollout percentages, or user-selectable update channels.
- Google official Gemini endpoints, OpenAI official endpoints, FAL direct access, arbitrary HTTP providers, or editable base URLs.
- Gemini masks, `n`, OpenAI quality, moderation, output compression, and transparent-output equivalence.
- Automatic Key creation, automatic Key selection, Key failover, or merging model lists across Keys.
- Desktop OAuth, Deeplink Key transfer, bulk Key configuration packages, or automatic import from Sub2API.
- Automatic cloud synchronization between online and desktop modes.
- Cloud retention of reference images, masks, prompts as attachments, or other input files.
- Retention periods other than exactly 24 hours for confirmed cloud copies.
- A project entity, project list, project switcher, project-specific credentials, or multiple simultaneously open素材库.
- Destructive backup restore that clears or overwrites current history.
- Migration or deletion of storage created by the upstream application before AWAI's first public release.
- Automatic deletion of an old素材库 after a successful migration.
- Silent or mandatory desktop updates.
- Implementation changes to `sub2api-no-custom-oauth` beyond deployment CORS configuration and custom-menu registration required to host AWAI.

## Further Notes

- Architectural decisions are recorded in ADR-0001 through ADR-0004 and use the vocabulary in `CONTEXT.md`.
- The current source has a large central store. New Gemini parsing, runtime storage, cloud upload, archive conversion, and Tauri host logic should remain in dedicated modules with store actions as entry points.
- The existing application stores many images as Base64 Data URLs. AWAI's first public release deliberately starts a new namespace, so implementation should build the target OPFS model directly rather than shipping an upstream-data migration path.
- The correct Sub2API source of truth for integration behavior is the `no-custom-oauth` branch in the `sub2api-no-custom-oauth` repository, not repositories that contain the removed custom OAuth delegation feature.
- `AWAI_SUB2API_BASE_URL`, allowed origins, support URL, Tauri bundle identifier, update endpoint, and production infrastructure values do not need final values during feature implementation, but release builds must fail or remain non-production until required slots are supplied.

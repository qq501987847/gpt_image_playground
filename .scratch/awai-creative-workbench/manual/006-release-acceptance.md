# 006 最终集成与发布验收记录

日期：2026-08-08

本记录把自动门槛、部署冒烟和真机安装分开。`PASS` 只表示已有可复现证据；`PENDING` 不得用 Linux 构建或单元测试替代。

## 用户故事追踪

| US | Issue / commit | 实现证据 | 验证证据 |
|---|---|---|---|
| 1 | 001 / `f8f53bf` | `index.html`、`Header.tsx`、`SettingsModal.tsx` | 发布构建与遗留表面扫描 |
| 2 | 001、006 / `f8f53bf` | GitHub/PWA 入口移除；006 清除 Help/About 遗留 UI | `releaseConfig.test.mjs`、产物扫描 |
| 3 | 001、005 | `LICENSE`、Tauri `licenseFile`、发布工作流 | Tauri 配置及发布产物清单 |
| 4 | 002 / `6f2c791` | `iframeBootstrap.ts`、`sub2apiSession.ts` | `iframeBootstrap.test.ts`、`sub2api.test.ts` |
| 5 | 002 | `iframeBootstrap.ts` 先清 URL 再校验 | `iframeBootstrap.test.ts` |
| 6 | 002、006 | 精确 HTTPS origin 校验 | `iframeBootstrap.test.ts`、`config.test.ts`、发布配置测试 |
| 7 | 002 | `sub2api.ts` 读取资料和 Key | `sub2api.test.ts` |
| 8 | 002 | `sub2apiSession.ts` 每配置绑定 Key | `sub2api.test.ts`、`apiProfiles.test.ts` |
| 9 | 002 | 只持久化 Key ID | `sub2api.test.ts`、`persistedState.test.ts` |
| 10 | 002 | Key 可用性与配置隔离 | `sub2api.test.ts`、`apiProfiles.test.ts` |
| 11 | 002 | 先选 Key 再发现模型 | `sub2api.ts`、`Sub2ApiProfileFields.tsx` 测试 |
| 12 | 002 | 自定义模型 ID，不开放域名 | `apiProfiles.test.ts`、`urlSettings.test.ts` |
| 13 | 002 | Gemini 两个预设 | `apiProfiles.test.ts`、`geminiApi.test.ts` |
| 14 | 002 | Gemini 比例能力表 | `paramCompatibility.test.ts`、`size.test.ts` |
| 15 | 002 | 自动比例省略字段 | `geminiApi.test.ts` |
| 16 | 002 | 自动/1K/2K/4K | `paramCompatibility.test.ts`、`size.test.ts` |
| 17 | 002 | 自动分辨率省略字段 | `geminiApi.test.ts` |
| 18 | 002 | 解码后记录实际像素 | `geminiApi.test.ts`、`store.test.ts` |
| 19 | 002 | Gemini 参考图与参数隔离 | `geminiApi.test.ts`、`paramCompatibility.test.ts` |
| 20 | 002 | Responses 文本配置 + 独立图像配置 | `agentApi.test.ts`、`store.test.ts` |
| 21 | 002 | 部分完成保留付费图片 | `agentResponseState.test.ts`、`store.test.ts` |
| 22 | 002 | 继续回复复用工具输出 | `agentApi.test.ts`、`store.test.ts` |
| 23 | 002 | 完整重生成重复计费警告 | `AgentWorkspace.tsx`、`store.test.ts` |
| 24 | 001 | OPFS 图片运行时 | `runtime.test.ts`、`db.test.ts` |
| 25 | 001 | IndexedDB 元数据和索引 | `runtime.test.ts`、`persistedState.test.ts` |
| 26 | 001 | 100 MB 预警不阻断 | `runtime.test.ts`、`store.test.ts` |
| 27 | 001 | OPFS 失败标记未保存 | `runtime.test.ts`、`store.test.ts` |
| 28 | 001 | 内存结果立即下载 | `runtime.test.ts`、`store.test.ts` |
| 29 | 003 / `b4e16b9` | 默认 24 小时云副本 | `cloudAssets.test.ts`、`domain.test.ts`、容器集成测试 |
| 30 | 003 | 关闭未来上传、立即删除现有副本 | `cloudAssets.test.ts`、`domain.test.ts` |
| 31 | 003 | 仅传生成原图/缩略图 | `cloudAssets.test.ts`、服务 API 测试 |
| 32 | 003 | 初始化固定并显示 `expires_at` | `domain.test.ts`、容器集成测试 |
| 33 | 003 | 30 MB / 1 GB 双重校验 | `domain.test.ts`、容器集成测试 |
| 34 | 003 | 配额失败不删除现有素材 | `domain.test.ts` |
| 35 | 003 | 上传/确认重试不重新生成 | `cloudAssets.test.ts` |
| 36 | 001、003 | 单图和 ZIP 下载 | `download.ts`、`exportZip.test.ts` |
| 37 | 003 | 版本化 AWAI ZIP | `exportZip.test.ts` |
| 38 | 003 | 非覆盖合并和引用重映射 | `exportZip.test.ts`、`store.test.ts` |
| 39 | 004 / `be4a946` | 桌面手动录入多个 Key | Rust 凭据测试、`runtime.test.ts` |
| 40 | 004 | 一个凭据绑定多个配置 | `apiProfiles.test.ts`、Rust 凭据测试 |
| 41 | 004 | Windows Credential Manager / macOS Keychain | 平台条件依赖、Rust 凭据测试；真机矩阵待验 |
| 42 | 004、006 | 发布构建固定 Sub2API origin | `build.rs`、发布配置测试 |
| 43 | 004 | 首次建议文档目录 | Rust 素材库测试 |
| 44 | 004 | 确认前不创建目录 | Rust 素材库测试 |
| 45 | 004 | `generated/` 普通文件 | Rust 原子写入测试 |
| 46 | 004 | references/exports 分目录 | Rust 素材库测试 |
| 47 | 004 | SQLite 事务元数据 | Rust schema/原子写入测试 |
| 48 | 004 | Tauri 单实例插件 | Rust/Tauri 宿主构建 |
| 49 | 004 | 运行任务阻止迁移 | Rust 迁移测试 |
| 50 | 005 / `8270497` | staging 迁移后完整校验再切换 | Rust 迁移成功/失败测试 |
| 51 | 005 | 成功后保留旧素材库 | Rust 迁移测试 |
| 52 | 005 | 不可用磁盘恢复页 | Rust 恢复测试、`DesktopBootstrap.tsx` |
| 53 | 005 | 备份导入后凭据重绑 | `store.test.ts`、Rust 凭据测试 |
| 54 | 005、006 | Windows x64 NSIS 构建矩阵 | 发布工作流；Windows 10/11 真机待验 |
| 55 | 005、006 | macOS arm64/x64 DMG 构建矩阵 | 发布工作流；两架构真机待验 |
| 56 | 产品决策撤销 | 不提供应用内更新提示 | 2026-08-08 确认改为手动安装新版安装包 |
| 57 | 产品决策撤销 | 不提供立即/稍后/跳过版本操作 | Tauri updater 运行时已移除 |
| 58 | 产品决策撤销 | 现在及未来均不采用 updater 签名 | 发布配置明确禁止 updater artifacts |
| 59 | 001、006 | 同源 `version.json` | Vite 自动生成文件、发布构建 |
| 60 | 001 | 活跃任务延后刷新 | `useVersionCheck.ts`、store 回归测试、视口检查 |
| 61 | 001、006 | 关于页名称/版本/模式/官方支持 | `SettingsModal.tsx`、产物扫描、视口检查 |

## 已执行证据

| 范围 | 状态 | 证据 |
|---|---|---|
| Web `1440x900` | PASS | `evidence/006/web-1440x900.png`；DOM `scrollWidth <= innerWidth`，无越界元素 |
| Web `390x844` | PASS | `evidence/006/web-390x844.png`；精确设备指标下无横向溢出；Tab 顺序覆盖指南、设置、模式、收藏、搜索、输入和参数 |
| 聚焦回归 | PASS | 无签名发布配置与哈希：2 files / 5 tests；FAL 队列恢复及关联 store 回归通过 |
| Web 构建 | PASS | `npm run build`；正式变量下 `npm run build:release:web`；生成 `version.json` 并通过旧品牌/PWA 产物扫描 |
| 完整 Vitest | PASS | `npm test`：44 files / 448 tests 通过；1 条容器集成测试按默认快速回归规则跳过并在下一行单独执行 |
| Node 在线服务 | PASS | `npm run build:online-assets`；`npm run test:online-assets`：4 files / 17 tests 通过，容器集成测试默认跳过 |
| PostgreSQL + MinIO | PASS | `AWAI_INTEGRATION_TEST=1 npm run test:online-assets:integration`：1 file / 1 test；真实适配器覆盖直传、确认、S3 一天生命周期、24 小时补偿清理、废弃上传、对象删除和配额释放，限额与立即删除由完整 domain/API 回归覆盖 |
| Web Docker | PASS | Node 22 构建；缺少正式槽位时拒绝启动；完整槽位下 `version.json`、运行时占位符替换和 `Referrer-Policy: no-referrer` 通过 |
| Node Docker | PASS | Node `v22.23.2`；Docker health 达到 `healthy`；无凭据 `/healthz` 返回 `{"status":"ok"}` |
| Rust / Tauri | PASS | `cargo fmt --check`；`cargo test`：9 tests；合成无签名正式配置并固定 `createUpdaterArtifacts: false` 后，Linux `tauri build --no-bundle` 成功 |
| 生产部署冒烟 | PENDING | 运行 `.github/workflows/awai-live-smoke.yml`，需要生产 URL、JWT、Key 和显式费用确认 |
| 正式发布产物与哈希 | PENDING | 运行 `.github/workflows/awai-release.yml`，保存三个桌面架构产物和 `SHA256SUMS` |

## Issue 006 验收矩阵

| AC | 状态 | 实现证据 | 验证证据 |
|---|---|---|---|
| 1 | BLOCKED | 61 条用户故事均已追踪，US 56-58 记录为产品决策撤销 | 本地回归通过；生产、四类真机和正式安装包证据仍缺失 |
| 2 | BLOCKED | `liveSmoke.mjs` 覆盖 JWT、Key、模型、OpenAI、Responses、Gemini 和精确 CORS | Mock 冒烟通过；尚未对生产 `sub2api-no-custom-oauth` 执行付费冒烟 |
| 3 | BLOCKED | iframe、Web、Node 均使用精确 HTTPS origin 校验，未知 origin 不返回允许头 | 单元/配置/容器 CORS 门禁通过；生产 Sub2API 与对象存储 CORS 尚无部署证据 |
| 4 | PASS | 云端服务、PostgreSQL repository、S3 adapter、补偿清理和限额逻辑 | 完整 domain/API 回归及真实 PostgreSQL + MinIO 集成测试通过 |
| 5 | PASS | 响应式在线 UI 与活跃任务延后版本刷新 | `1440x900`、`390x844` 浏览器检查和完整 Vitest 通过 |
| 6 | BLOCKED | Windows x64、macOS arm64/x64 构建矩阵已定义 | 尚无 Windows 10/11、macOS Apple Silicon/Intel 真机证据 |
| 7 | BLOCKED | 已移除 Tauri updater，桌面升级固定为手动安装新版 NSIS/DMG | 尚无真实旧版到新版的手动升级和数据保留证据 |
| 8 | BLOCKED | Web/Node/Desktop 发布槽位校验和 Docker 启动门槛已实现 | 合成值校验与构建通过；生产值尚未配置和验证 |
| 9 | PASS | 发布 UI 隐藏旧品牌、GitHub/PWA/FAL/自定义供应商入口；内部 FAL 和自定义异步兼容保留但不可见 | 正式产物表面扫描、凭据持久化测试及桌面/移动浏览器检查通过 |
| 10 | BLOCKED | 发布工作流、`SHA256SUMS` 和首发记录模板已实现 | 尚未生成三平台正式产物、真实哈希与最终发布记录 |

因此 issue 006 仍为 `open`。代码集成门禁可以提交，但关闭动作必须等待 AC 1、2、3、6、7、8、10 的外部证据。

## 发布配置槽位

| 槽位 | 自动门槛 | 生产值状态 |
|---|---|---|
| Sub2API 固定域名 | `AWAI_SUB2API_BASE_URL` 精确 HTTPS origin | PENDING |
| Sub2API 允许列表 | Web/Node 两侧必须一致且无通配符 | PENDING |
| Web origin | `AWAI_WEB_ALLOWED_ORIGINS` 精确 HTTPS origin | PENDING |
| 官方支持 | `AWAI_SUPPORT_URL` / `VITE_AWAI_SUPPORT_URL` | PENDING |
| 在线服务 | `VITE_AWAI_ASSET_SERVICE_URL` 精确 HTTPS origin | PENDING |
| PostgreSQL / S3 | URL、bucket、region、成对凭据校验 | PENDING |
| Bundle identifier | `AWAI_BUNDLE_IDENTIFIER` 反向域名 | PENDING |

## 真机安装与手动升级矩阵

| 平台 | 首装 | 素材库/凭据/生成 | 重启/备份/迁移 | 手动升级/数据保留 | 证据 |
|---|---|---|---|---|---|
| Windows 10 x64 | PENDING | PENDING | PENDING | PENDING | 待填 |
| Windows 11 x64 | PENDING | PENDING | PENDING | PENDING | 待填 |
| macOS Apple Silicon | PENDING | PENDING | PENDING | PENDING | 待填 |
| macOS Intel | PENDING | PENDING | PENDING | PENDING | 待填 |

本项目现在及未来均不采用 Authenticode、Developer ID、notarization 或 Tauri updater 签名。必须记录 SmartScreen/Gatekeeper 实际警告；桌面版不提供自动更新，升级只通过手动安装新版 NSIS/DMG 完成。

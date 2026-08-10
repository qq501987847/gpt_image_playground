# AWAI创作工作台

AWAI 是面向 Sub2API 的图片生成与 Agent 创作应用，共享一套 React/TypeScript 业务代码，提供两种运行方式：

- 在线版：由 Sub2API 自定义菜单以 iframe 打开，使用菜单 JWT 获取当前用户和 Key 列表，再由用户把 Key 绑定到具体 API 配置。
- 桌面版：由 Tauri 承载，素材写入用户确认的本地素材库，Key 明文只进入 Windows Credential Manager 或 macOS Keychain。

支持 Sub2API 的 OpenAI 兼容 Images API、Responses API 和 Gemini 原生 `generateContent`。Agent 文本模型和图像模型分别配置，已发现的模型会按用途过滤；手填模型 ID 会明确作为未验证配置处理。

## 数据边界

- 在线版的本地历史使用 IndexedDB/OPFS。
- 在线版默认可把生成结果上传为 24 小时临时云端副本；PostgreSQL 保存元数据，S3 兼容存储保存原图与缩略图。
- 参考图、遮罩和其他输入附件不会上传到 AWAI 在线素材服务。
- 在线素材服务不接收或代理用户的 Sub2API Key，模型请求由浏览器直接发往 Sub2API。
- 桌面版素材使用 SQLite 和普通文件持久化，不依赖在线临时副本。

## 本地开发

要求 Node.js 22，使用 npm：

```bash
npm install
npm run dev
```

默认开发模式使用内存中的 Sub2API Key 和模型模拟数据，不会发起真实模型请求。

### 连接本机 Sub2API

假设 Sub2API 运行在 `http://127.0.0.1:8080`，Vite 运行在 `http://127.0.0.1:5173`。

1. 在项目根目录创建 `.env.local`：

```dotenv
VITE_AWAI_SUB2API_MOCK=false
VITE_AWAI_DEV_SUB2API_ORIGIN=http://127.0.0.1:8080
```

该 HTTP 例外只在非 release 的开发构建中生效，并且只接受精确的 `localhost`、`127.0.0.1` 或 `[::1]` origin。正式构建仍只接受 `VITE_AWAI_SUB2API_ALLOWED_ORIGINS` 中的精确 HTTPS origin。

2. 在 Sub2API 的配置中允许 Vite origin：

```yaml
cors:
  allowed_origins:
    - http://127.0.0.1:5173
  allow_credentials: true
```

修改后重启 Sub2API。不要配置 `*`，也不要把局域网地址当成本地开发例外。

3. 在 Sub2API 管理界面的自定义菜单中新增 AWAI 菜单，URL 直接填写：

```text
http://127.0.0.1:5173/
```

不要填写旧的 `/api/auth/sub2api/sso?...` 路径，也不要手工拼接 `token`。Sub2API 会在打开 iframe 时自动追加 `user_id`、`token`、`src_host`、`src_url`、`theme`、`lang` 和 `ui_mode=embedded`。

4. 从 Sub2API 的菜单点击 AWAI。直接访问 Vite 首页不会获得菜单 JWT，真实会话会显示入口无效。

5. 在 AWAI 中选择计费 Key，再分别选择图片模型和 Responses 模型。浏览器开发者工具中应看到：

```text
GET http://127.0.0.1:8080/api/v1/user/profile
GET http://127.0.0.1:8080/api/v1/keys
GET http://127.0.0.1:8080/v1/models
GET http://127.0.0.1:8080/v1beta/models
```

若预检请求返回 `403`，先检查 Sub2API 的 `cors.allowed_origins` 是否与浏览器地址完全一致。`localhost:5173` 与 `127.0.0.1:5173` 是两个不同 origin。

## 在线素材服务

服务源码位于 `services/online-assets/`。启动时会先执行数据库 migration，再开始监听。探针含义：

- `GET /healthz`：Node 进程存活。
- `GET /readyz`：PostgreSQL 可访问、`temporary_assets` 表存在且 S3 bucket 可访问。

本地 PostgreSQL/MinIO 集成验证：

```bash
docker compose -f services/online-assets/compose.integration.yml up -d --wait postgres minio
docker compose -f services/online-assets/compose.integration.yml run --rm minio-init
AWAI_INTEGRATION_TEST=1 npm run test:online-assets:integration
docker compose -f services/online-assets/compose.integration.yml down -v
```

生产服务必需配置：

```dotenv
DATABASE_URL=postgresql://...
S3_BUCKET=awai-assets
S3_REGION=...
S3_ENDPOINT=https://...
AWAI_SUB2API_ALLOWED_ORIGINS=https://sub2api.example
AWAI_WEB_ALLOWED_ORIGINS=https://awai.example
```

## 验证命令

```bash
npm run build
npm test
npm run build:online-assets
npm run test:online-assets
cargo test --manifest-path src-tauri/Cargo.toml
```

线上 release smoke 必须显式确认四次可能计费的模型请求，并指定菜单 Key 列表中的 Key ID。脚本会用该菜单所属 Key 完成模型发现、Agent 工具调用/续轮、OpenAI/Gemini 生图，以及云素材上传、确认、下载和删除：

```bash
AWAI_SMOKE_CONFIRM_CHARGES=I_ACCEPT_MODEL_CHARGES \
AWAI_SMOKE_KEY_ID=key-id \
npm run release:smoke:live
```

其他 smoke 参数见 `.github/workflows/awai-live-smoke.yml`。

## 桌面发布

Windows x64 使用 NSIS，macOS 提供 Apple Silicon 和 Intel DMG。项目不集成 Tauri updater，也不配置平台或 updater 签名；升级方式是用户手动安装新版安装包，并在真机验收中验证素材库和系统凭据保持可用。

## License

MIT，见 [LICENSE](LICENSE)。

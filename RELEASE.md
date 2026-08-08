# AWAI创作工作台 0.1.0 首发记录

## 产物

正式构建工作流必须同时产出并保留 `SHA256SUMS`：

- Web：`awai-web-0.1.0.tar.gz`
- Node 在线素材服务：`awai-online-assets-0.1.0.tar.gz` 和 `awai-online-assets-0.1.0-image.tar.gz`
- Windows x64：NSIS 安装包
- macOS arm64：DMG 安装包
- macOS x64：DMG 安装包

桌面文件名由 Tauri 生成，`SHA256SUMS` 是发布文件与哈希的唯一清单。发布人必须确认清单覆盖同一次工作流生成的全部 Web、Node 和三平台桌面产物。

## 自动验证

`.github/workflows/awai-release.yml` 在正式发布变量齐全后执行：

- Web 构建、完整 Vitest、发布产物遗留表面扫描
- Node 在线素材服务构建与完整测试
- Tauri Rust 格式检查与宿主测试
- Windows x64、macOS arm64、macOS x64 安装包构建
- 所有发布文件的 SHA-256 汇总

## 真机发布门槛

CI 构建成功不能替代真实安装验收。发布人必须在 Windows 10 x64、Windows 11 x64、macOS Apple Silicon 和 macOS Intel 上完成首次安装、素材库权限、系统凭据、生成、重启恢复、备份导入、素材库迁移和手动升级测试，并把系统版本、应用版本、退出状态、截图或日志记录到 006 验收表。

桌面版不检查、下载或安装自动更新。升级由用户获取新版 NSIS/DMG 后手动执行；升级验收必须确认现有素材库和系统凭据绑定仍可使用。

## 长期无签名策略

本项目现在及未来均不提供 Windows Authenticode、Apple Developer ID、notarization 或 Tauri updater 签名。Windows 可能显示 SmartScreen 警告；macOS 可能阻止首次打开并要求用户在“隐私与安全性”中确认。由于 Tauri 自动更新强制要求 updater 签名，本项目不提供自动更新，只发布供手动安装的 NSIS/DMG。

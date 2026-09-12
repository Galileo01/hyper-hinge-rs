# 验证记录 — 2026-09-11

## Rust 桌面迁移

macOS Apple Silicon 应用使用 Tauri 和 Rust 传感器监督服务，并保留 C HID helper 与 React/Three.js/Web Audio 前端。Electron 主进程、preload、开发启动器及其依赖均已移除。

## 已执行检查

- 22 项 Node 测试通过，覆盖滤波、游戏规则、MIDI 来源，以及异步订阅的清理与顺序。
- 4 项 Rust 测试通过，覆盖协议校验（包括零值）、超时/重启顺序与旧 generation 拒绝、退出/启动失败重试，以及挂起/恢复/关闭。
- Clippy 对全部 target、全部 feature 且禁止 warning 的检查通过。
- 实际 macOS WKWebView 桌面测试的 7 个用例全部通过：外壳/字体/共享输入/原生全屏；离线恢复/校准；怪兽慢速获胜/快速失败；MIDI 运动门控/非零波形/八度控制/音频清理；可逆城市；弹球暂停/离线行为；渲染器重载后的校准持久化。
- 音频测试会显式恢复原生焦点，并在需要时再次点击 Enable sound。早期失败期间观察到了原生 blur/visibility 事件，应用按设计禁用了声音。单独的合成 blur 断言验证该行为，没有关闭产品保护措施。
- Chromium 和 WebKit 浏览器预览在 320、375、414、768 和 1440px 下通过全部五个应用路由检查，没有横向溢出或页面错误。截图位于 `work/qa/browser`。
- 生产 `.app` 打包成功。包检查验证 arm64 可执行文件、bundle 标识、内嵌 WebDriver/测试命令字符串不存在、真实 helper 读数、启动与正常退出。该机器在检查时报告 100°；这不代表进行了物理开合测试。
- 通过原生 UI 自动化打开了生产应用。实际主屏幕显示精确标语、本地点阵字体和实时输入；原生 Esc 可关闭 Settings；路由跳转后怪兽场景及其主屏幕探头图标均能渲染。也检查了 `work/qa` 中的桌面截图。

## 产物与对比

- 交付物：`release/HyperHinge.app`（本地未签名、未公证应用）。
- `du -sh` 曾记录 Tauri 包约 26 MiB，隔离的 Electron 基线约 288 MiB。这是磁盘占用，不是运行时内存、CPU 或电量基准。旧 Electron 基线后来已作为可再生成的迁移产物清理。
- 验证日志包括：`work/unit-test.log`、`work/rust-test.log`、`work/clippy.log`、`work/desktop-final.log`、`work/browser-test.log`、`work/package.log` 和 `work/package-test.log`。`work/` 可清理，删除后这些本地证据不再保留。
- 启用测试 feature 的二进制只保留在 debug target 目录，不得分发。打包脚本明确在不启用测试 feature 的情况下构建。

## 实际限制

物理屏幕开合、真实睡眠/唤醒、更多硬件兼容性及持续 GPU/电量测量尚未测试。监督服务测试与桌面挂起/恢复钩子只验证软件行为。浏览器 WebKit 检查用于补充实际 WKWebView 测试，不能替代后者。

嵌入式驱动使用合成 DOM 事件：选择 option 和取消 dialog 在自动化中需要显式派发事件；原生对话框取消已在生产应用中单独检查。音频断言测量 Web Audio 输出，不代表真人听感。程序生成的怪兽不是电影生产资产。

外部字体/MIDI 二进制仍排除在 Git 之外；准备与构建脚本保留来源和哈希校验。Electron 校准存储不会导入，首次启动 Tauri 版本时需要重新校准。

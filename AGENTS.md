# HyperHinge 仓库规则

本文件规定在本仓库中持续适用的工程约束。用户在当前任务中的明确指示优先。修改界面前阅读 `docs/design-language.md`；修改传感器、桌面桥接或原生服务前阅读 `docs/native-api.md`。两份文档具有规范效力，相关实现变化时必须同步更新。

## 产品约束

- 产品名称为 HyperHinge。标语必须原样保留：`Did you know there's a hinge sensor in your Macbook?`
- 应用由 `src/apps/registry.ts` 注册，并使用共享外壳提供的主屏幕返回和全屏能力。
- 界面、字体、配色、3D 角色、游戏交互和 Accordion 音乐资源遵循 `docs/design-language.md`，不要在本文件中另建一套设计规范。
- 模拟输入必须明确标记。仅使用模拟器验证时，不得声称已测试物理硬件、合盖安全或睡眠/唤醒周期。

## 架构边界

- 数据链路保持为：一个原生传感器后端 → 一个 Rust/Tauri 服务 → 受限桌面适配层 → `src/hinge/index.ts` 中的共享状态仓库 → 所有应用。
- 原生后端位于 `src-tauri/src/hid.rs`。桌面服务通过自身可执行文件的 `--sensor-worker` 模式启动一个 Rust 采集进程，保留进程隔离、单实例、故障恢复和 `available`/`source` 语义。不得重新引入 C helper 或额外 sidecar 二进制。
- 小应用不得自行启动传感器进程、读取 IOKit 或维护第二份全局传感器状态。应用输入统一从 `src/hinge/index.ts` 导入。
- React/TypeScript 前端位于 `src/`，Rust 桌面服务位于 `src-tauri/`。除非用户明确要求，不整体改写前端；原生传感器和桌面后端可以继续迁移为 Rust。
- 应用专属代码放在 `src/apps/<id>/`，共享控件放在 `src/components/`，新应用通过 `src/apps/registry.ts` 注册。
- 只使用本地 WKWebView、最小化 Tauri capabilities 和显式命令。不得暴露不受限的 IPC、shell、文件系统或 Node API。
- `desktop-test` feature、WebDriver 和测试命令只用于测试构建，发布产物不得启用或包含它们。
- 小应用卸载时清理监听器、RAF、定时器、GPU 资源和音频上下文。全局快捷键不得覆盖对话框、文本输入或系统快捷键。
- 不修改系统睡眠行为，不要求 root，不添加登录项、分析上报或后台网络服务。

## 资源与文档

- 第三方二进制资源按 `.gitignore` 管理，来源和校验值记录在 `docs/assets.json`。不得通过删除资源检查来绕过构建失败。
- 根目录和 `docs/` 中的 Markdown 文档统一使用中文；产品标语、命令、路径以及代码/API 标识符保持原样。
- 共享 API、数据协议、构建或打包行为变化时，同步更新对应文档。

## 验证

- 修改前先检查相关脚本和现有测试；使用 `rg` 搜索。
- 修改前端或核心交互后运行 `npm run build`、`npm test` 和 `npm run test:desktop`。
- 修改 Rust 服务后还要运行 `npm run test:rust`、`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 和 `cargo clippy --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin --all-targets --all-features -- -D warnings`。
- 修改打包流程后运行 `npm run package` 和 `npm run test:package`，并分别报告界面验收与进程存活检查。
- 修改视觉效果后运行格式检查，并检查真实 Tauri 或浏览器截图，覆盖桌面和紧凑布局、实时/不可用/模拟状态、焦点处理、主屏幕和全屏。
- 仅修改文档时，对照源码核验接口和命令，并运行格式检查；不要添加只重复实现细节的测试。
- 完成前运行 `git diff --check`，报告实际执行的验证、未执行项及其限制。

## Git 操作

- 未经用户在当前会话中直接明确要求，不执行 `git commit`、`git push`、merge、rebase、tag 或发布。
- 不改写或删除用户已有的未提交更改。评审说明只陈述已验证的行为、结果和限制。

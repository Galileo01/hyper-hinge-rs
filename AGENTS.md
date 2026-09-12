# HyperHinge 贡献者与代理规则

修改界面或传感器集成前，阅读 `docs/design-language.md` 和 `docs/native-api.md`；这两份文档具有规范效力。项目所有者明确更新规则时，以其指示为准。

## 产品

- 名称为 HyperHinge。标语必须原样保留：`Did you know there's a hinge sensor in your Macbook?`
- 主屏幕类似 iPad：实用的铰链组件位于已注册应用图标上方。应用列表由注册表管理。
- 应用包括 Lid Lab、Don’t Wake Up、Accordion、The Other Side 和 Laptop Pinball。所有位置都应支持返回主屏幕和全屏。
- 不要恢复 Reality Stabilizer、原仪表盘侧栏、绿色界面强调色或纸质海报风格美术。
- Nothing 风格界面必须使用指定的红/黑/白/灰设计变量。展示字体为 Ndot 57，其余界面使用 Inter，不得静默替换。实际 3D 游戏美术可使用其规定的材质配色。
- 怪兽必须是真实且持续动画的 3D 角色。主屏幕图标使用同一个角色从窗口探头的形象，不得以精灵图姿势切换代替。
- Accordion 必须使用真实的源 MIDI。不得编造旋律，也不得把合成音符标成真实乐谱。保留来源信息和确定性的资源哈希。
- 用户应能轻松“假装演奏”：键盘操作要简单且具有音乐性。游戏必须在完全合盖前结束。

## 架构

- 一个 C helper → 一个 Rust/Tauri 服务 → 受限桌面适配层 → 一个共享 JS 状态仓库 → 所有应用。
- 应用输入从 `src/hinge/index.ts` 导入。禁止各应用自行启动传感器进程或读取 IOKit。
- 使用本地 WKWebView、最小化 Tauri capabilities 和显式命令。不得暴露不受限的 IPC、shell、文件系统或 Node API。WebDriver 和测试命令仅在 `desktop-test` feature 下编译；绝不能分发启用该 feature 的版本。
- 保留 `available`/`source` 语义，不得将模拟或过期读数伪装为实时硬件数据。
- 小应用卸载时取消监听器、RAF 和定时器，释放 GPU 资源与音频上下文。避免全局按键处理覆盖对话框、文本输入或系统快捷键。
- 不修改系统睡眠行为，不要求 root，不添加登录项、分析上报或后台网络服务。
- 应用专属代码放在 `src/apps/<id>`；共享控件放在 `src/components`。新应用通过 `src/apps/registry.ts` 注册。
- React/TypeScript 前端保留在 `src/`，Rust 桌面代码放在 `src-tauri/`，C helper 放在 `native/`。本次迁移不把前端改写为 Rust。

## 工作流程

- 使用 `rg` 搜索。Python 优先使用 `uv` 而非 `pip`。大型 CSV/JSONL/Excel 数据使用 pandas/NumPy；Excel 默认通过 `pandas.read_excel` 配合 openpyxl 读取。
- 按 `.gitignore` 排除第三方二进制资源；来源和校验值记录在 `docs/assets.json`。不要为了构建通过而删除资源检查。
- 修改核心交互后运行 `npm run build`、`npm test` 和 `npm run test:desktop`。仅修改文档时，对照源码核验描述的接口约定，不要增加重复描述实现的测试。
- 修改 Rust 服务后，还需运行 `npm run test:rust`、Cargo 格式检查和 Clippy。修改打包流程后，运行 `npm run package` 和 `npm run test:package`；实际打包界面验收与进程存活检查分开进行。
- 修改视觉效果后执行格式化，并检查真实 Tauri/浏览器截图。覆盖桌面和紧凑布局、实时/不可用/模拟状态、焦点处理、主屏幕和全屏。
- 只使用模拟器时，不得声称已测试物理硬件开合或睡眠/唤醒周期。不得声称程序生成的怪兽达到了电影资产的制作质量。
- 评审说明聚焦行为、验证结果和实际限制。共享 API 变化时更新相关文档。
- 根目录和 `docs/` 中的 Markdown 文档统一使用中文。保留精确的产品标语，以及命令、路径和代码/API 标识符；相关实现变化时同步更新文档。

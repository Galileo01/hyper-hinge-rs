# HyperHinge

**Did you know there's a hinge sensor in your Macbook?**

一个使用 Tauri + Rust 构建的小型交互应用，把 MacBook 的屏幕铰链变成控制器。它提供 Nothing 风格的主屏幕、实时角度组件，以及共享同一原生输入服务的多个小应用。

![HyperHinge 主屏幕](docs/screenshots/home.png)

## 多个小应用，共享一个铰链

- **Lid Lab** — 用实时 3D 笔记本模型展示角度传感器。可以移动屏幕、环绕观察模型或切换到侧视图。
- **Don’t Wake Up** — 缓慢合上屏幕至舒适的目标角度，不要吵醒绿色独眼 3D 怪兽。呼吸、眼睑、眉毛和四肢持续动画；主屏幕图标是同一个怪兽从窗口探出头。可在 30°、40°、55° 或 70° 完成游戏，无需完全合盖。
- **Accordion** — 假装自己是演奏家。Julián Arcas 的《Soleá》真实 MIDI 转录提供旋律、低音与和声。点击 Enable sound 后，开合屏幕会按照移动速度推进乐谱；停止移动则静音并保持进度。←/→ 切换四小节乐句，↑/↓ 调整八度，无需乐理基础。
- **Laptop Pinball** — 用屏幕带动真实 3D 球桌倾斜。合上时球向远端滚动，打开时减速或反向。限时内依次停稳两个交替目标，解锁最终球洞；从任一端滚出都会失败。三个关卡逐步提高精度和时间要求，支持暂停、重置、按用时评星及舒适的中立角度，无需完全合盖。[游戏规则与验证](docs/laptop-pinball.md)。
- **The Other Side** — 从 105° 缓慢合至 35°，抬起普通桌面，发现程序生成的 3D 微缩城市，包括暖色窗户、屋顶、树木、喷泉和行驶的车辆。重新打开屏幕会收起城市。输入不可用时场景冻结；减少动态效果模式会停止车流。

**欢迎制作下一个应用。** 无论是奇怪的乐器、物理玩具、小游戏，还是实用的无障碍实验，都可以复用现有传感器、模拟输入、校准和全屏功能。从[贡献指南](CONTRIBUTING.md)、[JS API](docs/native-api.md) 和[示例应用](examples/angle-meter/AngleMeter.tsx) 开始。

## 本地运行

桌面开发需要 Node.js 22.12+（或兼容的更新版本）、npm、与 `src-tauri/Cargo.lock` 兼容的稳定版 Rust 工具链，以及 Xcode Command Line Tools。桌面构建面向 Apple Silicon 和 macOS 12 及以上版本。实时硬件输入需要 HID 驱动暴露铰链角度传感器的 MacBook。运行打包后的应用不需要 Node.js、Rust 或 Xcode。浏览器模拟模式不需要 Rust、Xcode 或 MacBook。

在当前 Rust 迁移工程的根目录执行以下命令。尚未推送的本地迁移改动不能通过克隆原上游仓库获得。

```sh
npm ci
npm run setup:assets
npm run dev
```

如果安装了 Make，`make` 等同于 `npm run build`，构建生产前端、Rust 桌面服务与传感器采集进程；`make dev` 等同于 `npm run dev`，启动 Tauri 开发应用和 Vite。请先完成依赖安装和资源准备。

`setup:assets` 获取本项目使用的指定第三方字体和 MIDI，并验证 SHA-256。这些文件不随 Git 分发，详见[资源来源](docs/third-party.md)。如果已经拥有相应资源，可按 `docs/assets.json` 指定的路径放置。

Rust 负责桌面服务和只读 HID 硬件采集；两者运行在同一个可执行文件的不同进程中，以隔离阻塞的系统调用。前端仍使用 React、Three.js 和 Web Audio。

普通开发与打包命令默认使用 Rust 采集后端，不再需要 C helper 或额外 feature。进程协议和生命周期见 [原生 API 文档](docs/native-api.md#原生协议)。

```sh
npm run dev:web      # 浏览器预览，默认使用模拟输入
npm run build        # 类型检查、生产前端、Rust 桌面程序与采集模式
npm test             # 信号处理、游戏规则、MIDI 来源验证
npm run test:rust    # 原生服务生命周期与协议测试
npm run test:web     # Chromium/WebKit 模拟测试，需先安装 Playwright 浏览器
npm run test:desktop # 实际 WKWebView 测试，先构建专用测试应用
npm run package      # 在 release/ 生成 Apple Silicon macOS 应用
npm run test:package # 检查单一可执行文件、采集模式、启动与正常退出
```

本地 `.app` 使用优化的 release 构建，未进行分发签名或公证。应用不需要 root、辅助功能权限或修改系统电源设置。`test:package` 验证进程存活，不验证界面渲染；生产应用的界面需要另外检查。如需强制要求硬件读取成功，可设置 `HYPERHINGE_REQUIRE_SENSOR=1` 后运行打包检查。

## 操作方式

| 操作                    | 控件或快捷键                            |
| ----------------------- | --------------------------------------- |
| 打开应用                | 点击图标                                |
| 全屏，包括主屏幕        | 右上角按钮或 **F**                      |
| 退出全屏                | **Esc** 或右上角按钮                    |
| 返回主屏幕              | Home 按钮或 **H**；非全屏时可按 **Esc** |
| 不移动屏幕进行体验      | 打开 **Simulate**，拖动角度滑块         |
| 保存舒适的参考角度      | **Settings → Calibrate**                |
| 开启手风琴声音          | 点击 **Enable sound**                   |
| 上一个/下一个四小节乐句 | **← / →**                               |
| 降低/提高八度           | **↓ / ↑**                               |

模拟器提供 15–140° 的范围。原生 API 保留经过校验的 0–180° 硬件读数；这不代表屏幕的机械活动范围。在合盖外接显示器模式下可能读到真实的 0°，但任何交互都不要求该角度。应用保留 macOS 的正常睡眠行为。窗口失焦会停止声音，需要再次点击 Enable sound 才能恢复。全局 Home/全屏快捷键不会覆盖对话框、文本输入和系统快捷键。

## 共享基础设施

```text
Apple HID 传感器
  → 一个只读 Rust 采集进程（请求频率 50 Hz）
  → 一个 Rust/Tauri 服务
  → 受限的 Tauri 命令/事件适配层
  → 一个共享 JS 状态仓库（滤波、速度、校准、模拟）
  → Lid Lab / Don’t Wake Up / Accordion / The Other Side / Laptop Pinball
```

小应用在 React 界面中使用 `useHinge()`，在渲染循环中使用 `hinge.getSnapshot()`。应用自身不启动采集进程、不轮询 IOKit，也不创建另一条硬件数据流。切换应用时，共享输入保持一致。

```tsx
import { useHinge } from "../../hinge";

export function MyApp() {
  const { angle, velocity, direction, available } = useHinge();
  return (
    <p>{available ? `${angle.toFixed(1)}° · ${direction}` : "Try Simulate"}</p>
  );
}
```

单位、数据新鲜度、资源清理、桥接接口和示例详见 [docs/native-api.md](docs/native-api.md)。

## 目录职责

| 路径                         | 用途                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `src/`                       | React 界面、Three.js 场景、Web Audio 和共享输入状态  |
| `src-tauri/`                 | Rust 桌面服务、生命周期、权限和打包配置              |
| `scripts/`、`tests/`         | 资源准备与校验、构建、打包和回归测试                 |
| `public/`                    | 字体、MIDI 和图标，需保留资源来源信息                |
| `dist/`、`src-tauri/target/` | 可重建的前端输出和 Rust 构建产物                     |
| `work/`                      | 可清理的测试产物、日志和截图；删除会丢失本地验收证据 |
| `release/HyperHinge.app`     | `npm run package` 生成的应用                         |

保留 `package-lock.json`、`src-tauri/Cargo.lock` 和 `vite.config.ts`。`Makefile` 是 npm 命令的可选快捷入口。清理生成文件不需要删除前端源码或测试。

## 设计与贡献规范

界面采用类似 iPad 的主屏幕，以及 Nothing 风格的小组件和图标。展示字体为 **Ndot 57**，其他易读文本使用 **Inter**。界面配色为红、黑、白、浅灰和深灰。彩色 3D 游戏美术属于明确允许的例外，不代表可以更改界面配色。

- [设计语言](docs/design-language.md)：精确的设计变量、字体、布局、美术边界和禁止项。
- [原生 / JS API](docs/native-api.md)：所有应用共享的接口。
- [AGENTS.md](AGENTS.md)：编码代理和贡献者的规则。
- [CONTRIBUTING.md](CONTRIBUTING.md)：添加应用、反馈硬件支持或改进项目。

## 硬件验证状态

2026-09-11 的迁移验证记录显示，打包应用检查在开发用 MacBook 上成功读取了 100°。更早的 M3 Pro MacBook Pro（`Mac15,6`）检查曾在 macOS 报告合盖时读取到 0°。这些是单次观测，不是物理开合扫描。已记录的自动化结果包括 22 项 Node 测试、4 项 Rust 测试和 7 项实际 WKWebView 桌面用例通过；范围和证据详见[验证报告](docs/verification.md)。实际开合时序、其他 MacBook 型号、真实睡眠/唤醒恢复和持续性能仍需人工测试。设备暴露 HID 服务不保证所有系统版本都允许读取。

传感器报告是设备特定、未公开文档化的 feature report，通过公开的 IOKit 函数访问。不支持的硬件或过期输入会明确显示，并提供模拟模式。读数和游戏状态留在本地；没有分析上报、网络控制端点或后台登录项。

## 致谢

视觉灵感：[Nothing OS](https://us.nothing.tech/nothing-os)。字体：Nothing / Colophon 和 [Rasmus Andersson 的 Inter](https://rsms.me/inter/)。音乐：[BitMidi 上的 Arcas_Solea.mid](https://bitmidi.com/arcas_solea-mid)；[历史乐谱信息](<https://imslp.org/wiki/Solea_(Arcas,_Juli%C3%A1n)>)。MIDI 合成采用类似手风琴簧片的音色，并非手风琴演奏录音。详见[第三方资源说明](docs/third-party.md)。

## 从 Electron 迁移

应用使用 macOS WKWebView，不再捆绑 Chromium。首次启动请重新校准：不会导入 Electron 的本地存储。`npm run package` 生成 `release/HyperHinge.app`，不包含测试专用 WebDriver 插件。测试应用通过 `desktop-test` Cargo feature 单独构建，绝不能用于分发。生产应用没有网络服务、更新器或遥测。

仓库中的 lock 文件固定 npm 和 Rust 依赖。使用 `npm ci`，并保留 `src-tauri/Cargo.lock`。物理开合、睡眠/唤醒和性能观测必须与自动化模拟结果分别记录，详见[验证报告](docs/verification.md)。

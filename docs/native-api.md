# 原生传感器与 JavaScript API

所有 HyperHinge 应用共享同一个服务。应用优先使用下述 SDK。桌面传输层只供共享 SDK 和诊断使用，不是各小应用的第二种集成方式。

## 应用 SDK

```ts
import { hinge, useHinge } from "../../hinge";
import type { HingeState } from "../../hinge";
```

React：

```tsx
export function MyApp() {
  const { angle, velocity, direction, source, available } = useHinge();
  if (!available) return <p>Turn on Simulate to try this app.</p>;
  return (
    <p>
      {angle.toFixed(1)}° · {velocity.toFixed(1)}°/s · {source}
    </p>
  );
}
```

普通 JavaScript / Three.js 循环：

```js
import { hinge } from "./src/hinge/index";

const unsubscribe = hinge.subscribe(() => {
  const state = hinge.getSnapshot();
  if (!state.available) return;
  console.log(state.angle, state.direction);
});

// 组件卸载/离开路由时清理：
unsubscribe();
```

在帧循环中，每帧调用 `hinge.getSnapshot()`；不要为了维护另一份副本而额外订阅。`subscribe` 回调不接收参数（符合 React external-store 约定），请在回调中读取快照。

### 快照约定

| 字段          | 类型/单位                     | 含义                                                                    |
| ------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `angle`       | number，度                    | 平滑后的物理屏幕角度。0 表示闭合，约 90 表示直立。                      |
| `rawAngle`    | number，度                    | 最近一次通过校验的硬件样本，或模拟器目标值。                            |
| `velocity`    | number，度/秒                 | 平滑后的导数；负值表示合屏，正值表示开屏。                              |
| `direction`   | `opening`、`closing`、`still` | 速度高于 +2、低于 −2，或位于 ±2°/s 死区内。                             |
| `baseline`    | number，度                    | 校准后的舒适参考角度。                                                  |
| `delta`       | number，度                    | `angle - baseline`。                                                    |
| `openness`    | number，0–1                   | `clamp(angle / 140, 0, 1)`；便利值，不是硬件规格。                      |
| `closure`     | number，0–1                   | 从基准角度向 10° 合拢的相对程度；便利效果值。游戏应设置自己的非零目标。 |
| `source`      | `live` 或 `simulation`        | 明确的数据来源。不得把模拟数据展示为硬件输入。                          |
| `available`   | boolean                       | 当前所选来源是否可用且新鲜。                                            |
| `message`     | string                        | 便于用户理解的来源/错误状态。                                           |
| `timestamp`   | number，毫秒                  | 发布快照时单调递增的 `performance.now()`；使用渲染器本地时钟。          |
| `sensorAgeMs` | number，毫秒                  | 自收到原生帧后的渲染器已用时间；模拟模式为零。                          |

不要把 angle=0 或 velocity=0 当成可用性信号，必须检查 `available`。输入丢失时保留最后角度以稳定显示，将速度归零，并把可用性设为 false。中断后的第一个有效输入会重置导数，避免把恢复误判为快速猛合。

### 方法

```ts
hinge.getSnapshot(): HingeState
hinge.subscribe(listener: () => void): () => void
hinge.calibrate(): void
hinge.simulate(enabled: boolean): void
hinge.setSimulatedAngle(angle: number): void
hinge.fullscreen(enabled: boolean): Promise<void>
```

- `calibrate()` 把当前过滤后的角度保存为本地存储中的参考角度，不改变原始硬件值。调用它的用户交互由界面负责。
- `simulate(true)` 从当前角度开始并重置速度。`simulate(false)` 选择真实传感器；若传感器不可用则明确呈现不可用状态。浏览器预览默认从模拟模式开始。
- `setSimulatedAngle` 接收有限数值并限制到 0–140°。共享界面有意只开放 **15–140°**；任何演示都不要求完全合盖。该方法仅修改模拟目标，不影响硬件。
- `fullscreen` 在桌面端委托给 Tauri，在浏览器端使用 Fullscreen API。浏览器预览中应由用户手势触发，并处理拒绝情况。

## 桌面传输层

内部适配器 `src/hinge/desktop.ts` 取代 `window.hyperHinge`。小应用仍然只导入共享 SDK。适配器使用以下仅限主窗口的 Tauri 命令和事件：

| 接口                                     | 约定                                     |
| ---------------------------------------- | ---------------------------------------- |
| `hinge_snapshot`                         | 返回最新 `SensorFrame`                   |
| `hinge_fullscreen({ enabled: boolean })` | 请求原生全屏                             |
| `hinge_fullscreen_state`                 | 返回真实原生全屏状态                     |
| `hinge:frame`                            | 携带 `SensorFrame`                       |
| `hinge:fullscreen-changed`               | 携带真实全屏布尔值，包括标题栏触发的变化 |

`SensorFrame` 保留 `available: boolean`、`angle: number | null`、`message: string` 和 `timestamp: number`。Rust 时间戳为 epoch 毫秒，即使系统时钟回拨，发布顺序也保持单调。渲染器时间戳仍使用本地 `performance.now()`。

适配器先等待事件注册完成，再获取初始快照；如果等待期间已收到事件，则忽略该快照。同步清理也会移除在组件卸载后才完成异步注册的监听器。HMR 会清理共享状态仓库的定时器与订阅。

只有本地主窗口拥有显式的业务命令和事件监听权限。前端没有 shell、文件系统、不受限 Node API 或远程能力。导航仅允许应用自身来源，以及开发模式下精确的 Vite 来源；禁止创建新窗口。

浏览器预览仍默认使用模拟输入。桌面桥接失败应呈现不可用的实时来源，绝不能隐式切换为模拟。校准沿用现有 localStorage 键，但不会导入 Electron 的独立存储目录。

## 原生协议

采集与桌面服务均由 Rust 实现，发布包只包含一个 `hyper-hinge` 可执行文件。主进程以 `--sensor-worker` 参数启动自身的独立采集进程；该模式在创建 Tauri、窗口和测试插件前分流退出。传感器工作进程只读取硬件，不提供网络服务或任意命令执行能力。

`src-tauri/src/hid.rs` 直接调用 IOKit/CoreFoundation，匹配 Apple HID vendor `0x05AC`、usage page `0x20`、usage `0x8A`。它请求 feature report ID 1，检查调用结果、返回长度、report ID 和 0–180° 数值范围，从第 1、2 字节解码小端 16 位角度。句柄由采集进程中的同一线程持有，通过 RAII 关闭和释放。

```sh
npm run build
./src-tauri/target/aarch64-apple-darwin/release/hyper-hinge --sensor-worker --once
# {"angle":111.0}  （仅为示例，实际读数会变化）
./src-tauri/target/aarch64-apple-darwin/release/hyper-hinge --sensor-worker
# 每行一条 JSON，请求间隔 20ms；Ctrl+C 停止
```

采集进程沿用逐行 JSON 协议；成功时输出 `{"angle":...}`，错误时输出 `{"error":"..."}` 并以非零状态退出。每条输出立即刷新。JSON 是两个 Rust 进程之间的内部传输协议，小应用仍只使用共享 SDK。

保留进程隔离是为了应对同步 `IOHIDDeviceGetReport` 阻塞：停止时主进程先发送 SIGTERM，等待最多约 200ms；若仍未退出则发送 SIGKILL，随后回收进程并等待输出读取线程结束，再启动下一代。强制终止后的系统资源由操作系统回收，不能声称 Rust 析构已执行。旧一代事件会被丢弃。进程退出或启动失败 3 秒后重试，超过 1.5 秒没有有效读数时由周期性 watchdog 重启；挂起时停止采集，恢复时重新启动。停止逻辑不依赖 HID 调用返回，但无法为内核故障或进程回收提供硬实时保证。

采集进程处理终止信号、输出管道断开，并在正常采样循环中检查是否失去父进程。主进程异常消失且 HID 调用同时阻塞时，这些检查无法执行；这不等同于操作系统级的父进程死亡通知。

请求频率为 **50 Hz**，不代表每秒有 50 次独立硬件测量。实际采样率、精度和分辨率取决于机型与驱动。SDK 保留基于时间的角度滤波（75ms）与速度滤波（100ms），超过 500ms 的样本间隔会重置导数；渲染器超过 1.5 秒没有实时更新时标记为过期。

不再需要 C helper、`npm run native`、Tauri `externalBin` 或 `rust-hid` feature。普通 `npm run dev`、`npm run build` 和 `npm run package` 均使用 Rust 采集进程。真实睡眠/唤醒周期仍需硬件 QA，测试命令触发的挂起/恢复只能验证服务逻辑。

## 添加应用

1. 阅读 `docs/design-language.md` 和 `AGENTS.md`。
2. 添加 `src/apps/my-app/MyApp.tsx` 和图标组件，使用 `useHinge()` 或 `hinge.getSnapshot()`。
3. 在 `src/apps/registry.ts` 注册 `MiniAppDefinition`：`id`、`name`、`subtitle`、`description`、`icon`、`component` 和 `tone`（`light` 或 `red`）。
4. 共享外壳自动提供启动、返回主屏幕、全屏、模拟和设置。
5. 清理所有订阅、RAF、事件监听器及音频/3D 资源。`available` 为 false 时冻结游戏机制。音频必须由用户手势启动，并在离开路由或失焦时停止。
6. 使用模拟慢速运动、突然运动、停止输入和不可用传感器进行测试，并提供截图和有意义的测试。

项目没有网络控制 API，也没有自动加载不可信插件的机制。应用均为本地代码，在构建时经审查并注册。`examples/angle-meter/AngleMeter.tsx` 是有意保持简洁的示例。

## 桌面验证边界

`npm run test:desktop` 会启用 `desktop-test` feature、本地嵌入式 WebDriver 和测试专用挂起/恢复命令。普通构建不会包含这些插件和命令。控制钩子测试的是服务逻辑，不代表真实 macOS 睡眠。`npm run test:web` 单独验证浏览器模拟器；浏览器 WebKit 不能替代 WKWebView 桌面验收。

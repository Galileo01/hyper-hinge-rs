# 第三方资源与来源说明

## Ndot 57

本地演示使用 Colophon 为 Nothing 设计的 Ndot 57 Aligned。这不是开源字体，尚未确认其再分发许可。二进制文件不纳入 Git；本地准备脚本会获取清单中指定的文件并校验哈希。不要假定本项目为公开发布或复用授予了字体权利。准确的本地文件名、来源 URL 和哈希记录在 `assets.json`。

主要背景资料：https://nothing.community/en/d/104-ndot57-the-nothing-typeface 。其中讨论的旧 Nothing Shopify 字体 URL 现已返回 404。本地 Aligned 字体来自清单记录的镜像文件；运行中的应用会检查字体族。

## Inter

Inter Variable 由 Rasmus Andersson 创作，采用 SIL Open Font License 1.1。字体及许可证包含在 `public/fonts/`。来源：https://rsms.me/inter/font-files/InterVariable.woff2 。许可证：https://github.com/rsms/inter/blob/master/LICENSE.txt 。字体未经修改。

## Soleá MIDI

- 作曲：Julián Arcas（1832–1882）。
- 作品：Soleá，吉他，D 小调。历史版本信息：https://imslp.org/wiki/Solea_(Arcas,_Juli%C3%A1n) 。
- 下载页：https://bitmidi.com/arcas_solea-mid 。MIDI 直链：https://bitmidi.com/uploads/31604.mid 。
- 解析后的文件头：`Arcas_Solea`；PPQ 480；3/4 拍；两个有效音轨共 1,558 个音符事件；约 328.01 秒；速度图起始约为 130 BPM。
- 开头音符包含低音 A2 和 E3/A3/C♯4 的 A 大调和声音型，与乐谱开头的属和弦/弗里吉亚语境一致。这是来源转录，不是新创作的近似旋律，也不宣称为历史演奏录音。
- 原作年代久远，但下载页没有提供 MIDI 转录作者与再分发条款，因此二进制文件不纳入 Git。本地准备脚本会按确定性哈希获取它。不得把该 MIDI 转录标记为 CC0 或 MIT。
- 项目没有编造原始音符、音符时序、速度事件或和声。应用在运行时解析 MIDI 并合成所有有效音轨。类似手风琴簧片的音色、由屏幕速度控制的动态、八度变化和乐句导航均为应用行为，不属于原始转录。

## 原生传感器技术

HID report 机制参考了公开实验，包括 https://gist.github.com/alessaba/098f83c587e1372d30dea36a7c18b7cc 。项目的 Rust HID 采集后端为本地实现，包含 report 校验、流式输出、资源清理和结构化错误。匹配标识符属于硬件协议事实。Apple 在 https://github.com/apple/darwin-xnu/blob/main/iokit/IOKit/pwr_mgt/IOPM.h 中记录了独立的合盖布尔值。

## 美术

发布的笔记本、手风琴图标和绿色独眼怪兽均由代码生成几何体构成。怪兽的可见状态为实时 3D，具有皮肤材质和持续动画。Nothing 外壳灵感和所有者提供的动画怪兽参考不表示与 Nothing、Disney 或 Pixar 存在关联。运行时应用不包含所提供电影海报、电影角色模型、Logo 或截图。

`docs/home-concept.png` 由内置图像工具生成，仅作为设计参考，不是交互界面或运行时美术。概念图之后由所有者明确提出的变化记录在 `design-language.md`。

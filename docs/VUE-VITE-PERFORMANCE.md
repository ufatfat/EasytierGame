# Vue + Vite 迁移与运行时性能调整

2026-10-21。保留 Tauri 2、现有设计、Windows/macOS 功能、全局 IP/公告、大厅及协调服务多地址切换。

## 前端入口与配置兼容

- Nuxt 改为 Vue 3 + Vite、Vue Router hash 路由，页面按需加载，Element Plus 按组件导入。
- `pnpm dev` 使用 `http://127.0.0.1:5173`；`pnpm build` 直接输出真实的 `dist/` 目录，不再使用 Nuxt 输出的符号链接。
- 继续使用 `env/.env.dev` 和 `env/.env.prod`。开发时的协调服务代理迁到 Vite middleware，桌面包仍走 Rust 请求，不包含 Node 服务运行时。
- 保留 `__glj_persisted_main` 存储键与现有字段。每个 WebView 只有一个配置同步监听；仅主窗口合并并防抖写入 config.json。
- 删除专用于 storage 监听的隐藏 WebView；关闭面板时释放监听和订阅。保留用户打开的独立功能窗口。

## 数据采集与日志

Rust 持有一份运行状态缓存。主窗口、成员、子网代理、大厅和社区读取缓存或订阅事件，不再各自启动 CLI 定时器。CLI 轮询不重叠，每次查询有 3 秒超时，超时会终止查询进程；只有成员/子网面板可见时才采集对应详情。正常轮询间隔 2 秒，全部隐藏时仅每 5 秒采集基础成员状态供房间心跳使用，客户端未运行时不启动 CLI。协调服务房间心跳继续每 30 秒发送。

客户端和服务器日志分别缓存，最多 5,000 行和 2 MB；单行超过 16 KB 时截断并标记。存在新输出时最多每 100 ms 合并发送新增行，无日志时不发送日志事件，没有订阅者时不生成传输副本。日志窗口打开/重新可见时补齐缓存，通过会话编号和行号处理历史与实时事件的竞态。清空仅清除当前视图，新会话恢复正常显示。

日志级别与小写搜索索引只在新增行到达时生成；列表采用固定行高虚拟滚动，只挂载可见行和少量预留行。支持级别、关键词、复制、自动跟随和服务器日志折叠，窗口关闭后停止订阅。底层缓存持续有上限，搜索范围是当前保留的历史。长日志使用横向滚动。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 31 项通过，含日志历史竞态、清空/会话重置、数量/内存上限、虚拟列表范围、Vite 代理及原有协调服务/大厅/切换测试 |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 10 项通过，含 Rust 日志数量/字节上限和 Unicode 截断 |
| `pnpm build` | 成功 |
| `pnpm exec tauri build --bundles app` | macOS arm64 构建成功 |
| macOS 原生启动 | 实际启动新 .app，内核版本正常显示，独立日志面板可打开；关闭后重新定位到主窗口，主线程采样为正常事件循环等待 |
| 实际前端双窗口 | 修改成员名后另一窗口同步；重载后房间名和成员名保留，主题切换正常 |
| 日志压力视图 | 使用实际 RuntimeLog 组件和独立模拟 IPC；初始 5,000 行、每 200 ms 新增 100 行，观察到编号 22,400 后缓存仍为 5,000 行；自动跟随正常 |
| 搜索与生命周期 | ERROR + 关键词筛出 500 行；清空为 0 行，新会话恢复；关闭组件后日志 DOM 移除，重新打开补齐 5,000 行 |
| 日志 DOM | 压力场景约几十个日志行节点；600×720 面板测得 34 个，随视口和滚动位置变化 |

全部页面 JS 产物由 805,542 字节减少至约 720 KB（约 10.7%）；全部 JS 单文件 gzip 总和减少约 10.5%。这是完整构建产物的比较，不是首屏流量、运行内存或帧率指标。原构建在本次迁移前留存，再用同一 gzip 算法比较，原始结果见 [vite-assets.json](ui-qa/vite-assets.json)。复测当前产物：`node scripts/measure-ui.mjs`；比较已有旧产物：`node scripts/measure-ui.mjs <旧前端输出目录>`。

证据：[主窗口深色主题](ui-qa/vite-main-dark.png)、[实际日志空态](ui-qa/vite-log-empty.png)、[macOS 原生日志面板](ui-qa/vite-native-log.png)、[日志压力视图（模拟数据）](ui-qa/vite-log-stress.png)。压力视图通过临时测试服务器提供，不包含在发布包中。

本机未完成 Windows 原生运行、多机真实 TUN 和游戏联机验收，未测量不同设备上的帧率或长期原生内存占用。macOS 测试包位于 `release/easytier-game_macos-arm64_vue-vite.zip`，未做正式分发签名和公证。

## macOS 首次点击响应修复（2026-10-21）

主窗口的 Tauri 配置和 `composables/windows.ts` 中所有动态面板统一开启 `acceptFirstMouse: true`。macOS 默认会将失焦窗口的首次点击仅用于激活；开启后，同一次点击也交给 WebView，避免返回主窗口或切换面板时多点一次。保留新面板正常获取焦点的行为。

依据：[Tauri acceptFirstMouse 配置说明](https://v2.tauri.app/reference/config/#acceptfirstmouse)。类型检查、前端和 macOS 应用构建通过。本轮未用自动化验证真实鼠标对失焦窗口的首次点击；验收时应完全退出旧进程后启动新包，打开面板后直接单击主窗口的按钮/输入框，再反向验证面板。修复包：`release/easytier-game_macos-arm64_first-click-fix.zip`。

## 按平台适配原生标题栏（2026-10-21）

macOS 在 Rust 创建主窗口前配置原生 Overlay 标题栏；所有动态窗口由统一入口启用同一策略，保留系统红黄绿按钮并开启最小化、缩放能力。主窗口与 PanelHeader 为按钮预留左侧 92px，隐藏重复的自绘窗口按钮；子网代理和公共服务器页补齐 macOS 标题区域。Windows 的原有按钮和布局保留。浏览器预览继续显示可操作的自绘按钮，首次点击响应修复保留。

本轮类型检查、前端构建、31 项 JavaScript 测试和 10 项 Rust 测试通过；macOS arm64 应用构建成功。使用独立应用标识的临时原生测试实例，确认主窗口存在系统 `close/full screen/minimize` 控件、日志面板存在系统 `close/zoom/minimize` 控件，HTML 中重复的关闭/最小化按钮已移除，并检查标题与控件无重叠。自动化未完整验收原生拖拽、缩放、最小化后的恢复及真实鼠标首次点击；Windows 没有实机验收。

截图：[macOS 主窗口](ui-qa/native-titlebar-main.png)、[macOS 日志面板](ui-qa/native-titlebar-log.png)、[保留的自绘布局](ui-qa/titlebar-fallback-main.png)。失焦时原生按钮会由系统显示为灰色；主窗口截图左侧的紫色标记来自系统屏幕采集状态。

最新测试包：`release/easytier-game_macos-arm64_native-titlebars.zip`。发布包仍使用原应用标识 `com.tauri.easytier-game`，测试实例使用的临时标识不会进入发布包；使用前完全退出旧实例。

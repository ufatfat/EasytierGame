# PRD 实现与验证

本次按 `PRD.md` 与 Pencil 设计稿完成新增大厅和桌面界面调整，保留此前的 Windows/macOS 适配、个人密钥、IP 登记与全局公告功能。

## 实现范围

- 400×720 主窗口、600×720 停靠面板；四种联机状态、IP 复制、运行时长与连接质量、最多三名成员预览；固定底部主按钮。
- 大厅浏览、搜索、游戏筛选、空位筛选与排序；发布、编辑、下架；加入确认与可选保存房间配置。
- 每个成员一个房间；发布设备心跳 30 秒、服务端过期 90 秒；停止下架开关、满员隐藏、管理员下架。切换网络不会继续续期旧房间。
- 默认私密密码不落库、不返回；公开密码仅由认证后的连接接口返回；一键加入只替换联机配置并保留个人 IP 模式。
- 社区 IP、公告、成员管理界面；游戏库卡片；高级设置六分类及搜索；Windows 工具的五步顺序；日志级别、关键词与自动跟随；系统/浅色/深色主题。

## 已执行

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test` | 24 项通过 |
| `cargo test --lib --locked`，在 src-tauri 中执行 | 7 项通过 |
| `pnpm build` | 静态前端生成成功 |
| `pnpm exec tauri build --bundles app` | macOS arm64 .app 构建成功 |
| 浏览器视觉与交互 | 见 [UI 验证记录](../design-qa.md) |

服务测试覆盖密钥、角色、自身操作限制、IP 冲突、公告归属；新增大厅测试覆盖密码隔离、发布配额、满员、权限、发布设备限制、过期、吊销清理和输入边界。客户端业务测试验证服务器协议配对、加入配置的保留项、日志级别与房间心跳绑定。

## 设备验收范围

本机没有 Windows 运行环境，未执行 Windows 工具与安装包验收；macOS 未执行需要系统授权的真实虚拟网卡启动，也未进行 Windows/macOS 双机和游戏内发现测试。大厅人数是房主上报的快照，不提供座位预留；TCP 服务器测量不是玩家间的游戏延迟。

服务部署与使用方式见 [平台与协调服务说明](PLATFORMS-AND-COMMUNITY.md)。本次没有部署公共协调服务。

macOS arm64 测试包：`release/easytier-game_macos-arm64_prd-ui.zip`（24 MB，含 .app）。测试包用于本地验证，未进行正式分发签名和公证。

## 协调服务多地址补充（2026-10-21）

支持最多 5 个地址、旧配置兼容、最近成功地址优先、连接失败自动切换、认证/冲突错误不切换，以及无法确认写入结果时禁止重放。新增 7 项 JavaScript 测试和 1 项 Rust 测试，包含真实 HTTP 503、拒绝连接、截断响应、顺序和最近成功地址、一次性密钥操作不重放。浏览器联调使用未启动的本地入口作首选地址、临时内存服务作备用地址，已确认自动连接备用、状态栏正确显示、设置可保存。

证据：[多地址设置](ui-qa/coordinator-address-settings.png) · [自动切换结果](ui-qa/coordinator-failover.png)。

本次更新的 macOS arm64 测试包：`release/easytier-game_macos-arm64_coordinator-failover.zip`。

## Vue + Vite 与性能调整（2026-10-21）

前端已迁移到 Vue 3 + Vite，保留 Tauri。成员/路由改用 Rust 统一采集，日志改为增量、有上限的缓存和虚拟列表，移除隐藏配置同步窗口。当前验证为 31 项 JavaScript 测试、10 项 Rust 测试及 macOS arm64 构建通过；浏览器已验证双窗口配置同步和日志压力场景。具体限制、数据和截图见 [迁移与性能验证](VUE-VITE-PERFORMANCE.md)。

最新 macOS arm64 测试包：`release/easytier-game_macos-arm64_vue-vite.zip`。

macOS 窗口首次点击补充：主窗口与所有动态面板已开启 `acceptFirstMouse`，修复失焦窗口需要先点击激活的问题。修复包为 `release/easytier-game_macos-arm64_first-click-fix.zip`，替换运行时需完全退出旧进程。

窗口标题栏平台适配补充：macOS 主窗口及所有动态窗口使用系统原生窗口按钮，并同步浅/深主题；Windows 保留既有布局。已通过类型检查、31 项 JavaScript 测试、10 项 Rust 测试及 macOS 构建，并用独立 macOS 实例验证主窗口和日志面板的原生控件与标题区域。最新包为 `release/easytier-game_macos-arm64_native-titlebars.zip`，详细范围见 [性能与平台验证记录](VUE-VITE-PERFORMANCE.md)。

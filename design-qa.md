# UI 验证记录

final result: passed

本记录的结论覆盖下面列出的界面与交互；真实虚拟网卡、跨系统联机和 Windows 工具操作另需设备验收。

## 对照来源

- 产品要求：`docs/PRD.md`，2026-10-21。
- 视觉来源：`design/untitled.pen`，只通过 Pencil 工具读取；沿用其配色、字体、Lucide 图标、游戏封面及品牌图。
- 对照尺寸：主窗口 400×720，面板 600×720；额外检查 360×480 主窗口、520×600 日志面板。
- 深浅主题共用颜色变量；macOS 隐藏 Windows 专属入口，所以底栏比 Windows 设计稿少一项。

## 证据

| 状态 | 截图 |
|---|---|
| 主窗口浅色 / 深色 | [浅色](docs/ui-qa/home-light.png) · [深色](docs/ui-qa/home-dark.png) |
| 联机成功浅色 / 深色 | [浅色](docs/ui-qa/connected-light.png) · [深色](docs/ui-qa/connected-dark.png) |
| 社区、公告、成员管理 | [IP](docs/ui-qa/community-light.png) · [公告](docs/ui-qa/announcements-light.png) · [成员](docs/ui-qa/members-light.png) |
| 大厅、加入确认 | [大厅](docs/ui-qa/lobby-light.png) · [加入](docs/ui-qa/join-light.png) |
| 游戏库、高级设置、自建服务器、日志 | [游戏库](docs/ui-qa/games-light.png) · [设置](docs/ui-qa/settings-light.png) · [服务器](docs/ui-qa/server-light.png) · [日志](docs/ui-qa/logs-light.png) |
| 同尺寸设计 / 实现并排对照 | [联机成功](docs/ui-qa/comparison-connected.png) · [大厅](docs/ui-qa/comparison-lobby.png) |

截图中的成员、公告、IP 和房间是本地内存协调服务的临时数据。主窗口成功状态由临时预览程序传入固定 props，用于检查布局，不代表已建立真实 VPN。临时程序不属于发布版。

## 已完成的检查

1. 布局：主按钮与底栏固定，状态卡、表单、成员预览保持设计层级；较小窗口由内容区滚动，不挤出主按钮。
2. 字体与颜色：Noto Sans SC、JetBrains Mono，以及设计稿的深浅主题令牌；IP、时长、端口使用等宽字。
3. 素材：使用从设计稿导出的品牌图与游戏封面，Lucide 图标与设计一致；陌生游戏使用通用图标或用户封面。
4. 交互：高级设置搜索能跨分类查找，搜索后回到顶部；KCP 与 QUIC 互斥；私有服务器设置弹窗可打开、取消。
5. 数据与权限：通过实际 HTTP 接口完成公告发布、成员创建和一次性密钥显示；大厅按房主搜索、筛选空位及加入确认正常；满员按钮禁用。截图中没有访问密钥。

## 修复迭代

- P0：将主按钮移出内容滚动区域，360×480 时仍可见；400×720 成功状态内容无溢出。
- P1：补齐面板的高度与滚动约束，避免高级选项下半部分无法访问；恢复自建服务器日志和私有模式弹窗。
- P1：加入请求处理 IPC 失败、超时与监听器清理；发布房间的心跳绑定原服务器、房间名与密码，切换网络后不再续期旧房间。
- P2：修复图标别名、搜索后的滚动位置、手动填写路径添加游戏时的唯一 ID，以及主窗口新入口的活动状态。

上述检查范围内没有遗留的 P0 / P1 / P2 界面问题。发布房间、执行系统命令和真实联机的桌面权限流程由代码检查、服务测试、Rust 测试及 macOS 构建验证覆盖，尚未进行跨设备人工验收。

## 多地址协调服务补充

服务设置改为多行地址列表，最多 5 个；600×720 面板无横向溢出。使用拒绝连接的首选地址和运行中的本地内存服务完成切换测试，状态栏显示“备用 2 地址”和实际连接地址。设置保存后仍可连接。证据：[设置](docs/ui-qa/coordinator-address-settings.png) · [切换结果](docs/ui-qa/coordinator-failover.png)。


## Vue + Vite 迁移验证（2026-10-21）

保留现有设计；已在实际 Vite 页面验证主窗口、成员和日志布局，以及主题、旧存储键、双窗口同步。macOS 构建已实际启动并打开独立日志面板。实际 RuntimeLog 组件在临时模拟 IPC 服务器上验证 5,000 行和每秒 500 行追加，累计行号到 22,400 时仍仅缓存 5,000 行；600×720 下约 34 个行节点。筛选、清空、会话重置和重开历史补齐正常。

记录与证据见 [迁移性能验证](docs/VUE-VITE-PERFORMANCE.md)。临时压力测试页面不会打入发布包。

## macOS 原生标题栏（2026-10-21）

macOS 使用原生 Overlay 标题栏及系统窗口按钮，主窗口与功能面板统一预留按钮区域；Windows 保留自绘布局。临时 macOS 原生实例已验证主窗口和日志窗口存在系统窗口按钮，标题内容无遮挡，未出现重复的 HTML 窗口按钮。失焦时按钮颜色由系统变灰。

证据：[主窗口](docs/ui-qa/native-titlebar-main.png)、[日志面板](docs/ui-qa/native-titlebar-log.png)、[自绘回退布局](docs/ui-qa/titlebar-fallback-main.png)。尚未在 Windows 实机验收，也未完整自动化验收 macOS 全屏、最小化恢复与拖动。

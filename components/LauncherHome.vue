<template>
	<main class="launcher-window">
		<header
			class="app-titlebar"
			:class="{ 'native-macos-titlebar': usesNativeWindowControls }"
			data-tauri-drag-region
		>
			<img
				:src="logo"
				alt=""
				width="22"
				height="22"
			/>
			<strong>EasyTier Game</strong>
			<span class="mono version">{{ pkg.version }}</span>
			<div class="titlebar-actions">
				<ElDropdown
					trigger="click"
					@command="changeTheme"
				>
					<button
						class="icon-button"
						aria-label="切换主题"
					>
						<AppIcon
							:name="store.theme ? 'moon' : 'sun'"
							:size="15"
						/>
					</button>
					<template #dropdown>
						<ElDropdownMenu>
							<ElDropdownItem command="system">跟随系统</ElDropdownItem>
							<ElDropdownItem command="light">浅色</ElDropdownItem>
							<ElDropdownItem command="dark">深色</ElDropdownItem>
						</ElDropdownMenu>
					</template>
				</ElDropdown>
				<button
					class="icon-button"
					v-if="!usesNativeWindowControls"
					aria-label="最小化"
					@click="minimize"
				>
					<AppIcon
						name="minus"
						:size="15"
					/>
				</button>
				<button
					class="icon-button"
					v-if="!usesNativeWindowControls"
					aria-label="关闭主窗口"
					@click="close"
				>
					<AppIcon
						name="x"
						:size="15"
					/>
				</button>
			</div>
		</header>
		<div class="launcher-body">
			<section
				class="connection-status"
				:class="{ connected, failed: !!failure }"
				aria-live="polite"
			>
				<template v-if="connected">
					<div class="connected-top">
						<span class="ui-tag success">
							<AppIcon
								name="check"
								:size="11"
							/>
							联机成功
						</span>
						<span class="mono status-duration">{{ duration }}</span>
						<span class="connected-room">{{ store.config.networkName }}</span>
					</div>
					<div class="virtual-ip-label">虚拟 IP</div>
					<button
						class="status-ip mono"
						title="复制虚拟 IP"
						@click="$emit('copy-ip')"
					>
						{{ store.config.ipv4 }}
						<AppIcon
							name="copy"
							:size="15"
						/>
					</button>
					<p class="ip-secondary mono">
						{{ store.config.ipv6 || "IPv6 未分配" }} ·
						{{ ipMode === "registered" ? "固定 IP" : store.config.dhcp ? "DHCP 自动分配" : "手动 IP" }}
					</p>
					<div class="status-metrics">
						<div>
							<span>在线成员</span>
							<b class="mono">
								{{ peers.length }}
								<small>人</small>
							</b>
						</div>
						<div>
							<span>平均延迟</span>
							<b class="mono">
								{{ averageLatency }}
								<small>ms</small>
							</b>
						</div>
						<div>
							<span>连接方式</span>
							<b class="connection-count">
								<i class="dot text-success" />
								{{ direct }} 直连
								<i class="dot text-warning" />
								{{ relayed }} 中转
							</b>
						</div>
					</div>
				</template>
				<div
					v-else
					class="status-main"
				>
					<div class="status-symbol">
						<AppIcon
							:name="failure ? 'warning' : running || loading ? 'loader' : 'unplug'"
							:size="19"
							:class="{ spinning: loading || running }"
						/>
					</div>
					<div class="status-copy">
						<div class="status-heading">{{ failure ? "联机失败" : running || loading ? "联机中" : "未联机" }}</div>
						<p>
							{{
								failure ||
								(loading
									? "等待系统授权或正在启动内核…"
									: running
										? "正在连接网络，等待分配虚拟 IP…"
										: "填写房间信息，和朋友进入同一个虚拟局域网")
							}}
						</p>
						<button
							v-if="!running && !loading"
							class="text-button"
							@click="$emit('navigate', 'lobby')"
						>
							去大厅找人一起玩
							<AppIcon
								name="arrow-right"
								:size="12"
							/>
						</button>
					</div>
					<button
						class="core-badge"
						:disabled="running || loading"
						title="内核管理"
						@click="$emit('core')"
					>
						<span>内核</span>
						<b class="mono">{{ coreVersion ? `v${coreVersion.replace(/^v/, "")}` : "未安装" }}</b>
						<i
							v-if="hasUpdate"
							class="dot"
						/>
					</button>
				</div>
			</section>
			<fieldset
				class="connection-form"
				:disabled="connected || loading"
				:class="{ readonly: connected }"
			>
				<div class="ui-field">
					<div class="field-label">
						服务器
						<button
							class="text-button ml-auto"
							type="button"
							@click="$emit('public-servers')"
						>
							<AppIcon
								name="globe"
								:size="12"
							/>
							公共服务器列表
						</button>
					</div>
					<div class="server-control">
						<ElSelect
							:disabled="connected || loading"
							v-model="store.config.protocol"
							multiple
							collapse-tags
							class="protocol-select"
							aria-label="网络协议"
						>
							<ElOption
								v-for="item in protocols"
								:key="item"
								:value="item"
								:label="item"
							/>
						</ElSelect>
						<ElSelect
							:disabled="connected || loading"
							v-model="store.config.serverUrl"
							allow-create
							filterable
							multiple
							collapse-tags
							collapse-tags-tooltip
							default-first-option
							class="server-select"
							aria-label="服务器地址"
							@change="$emit('server-change')"
						>
							<ElOption
								v-for="item in store.basePeers"
								:key="item"
								:value="item"
								:label="item"
							/>
						</ElSelect>
					</div>
				</div>
				<div class="form-row">
					<label class="ui-field">
						<span class="field-label">房间名</span>
						<input
							v-model="store.config.networkName"
							class="ui-input mono"
							placeholder="请输入房间名"
							maxlength="100"
						/>
					</label>
					<label class="ui-field">
						<span class="field-label">房间密码</span>
						<span class="password-control">
							<input
								v-model="store.config.networkPassword"
								class="ui-input mono"
								:type="showPassword ? 'text' : 'password'"
								placeholder="房间密码（可选）"
								maxlength="100"
							/>
							<button
								class="icon-button"
								type="button"
								:aria-label="showPassword ? '隐藏密码' : '显示密码'"
								@click="showPassword = !showPassword"
							>
								<AppIcon
									:name="showPassword ? 'eye' : 'eye-off'"
									:size="14"
								/>
							</button>
						</span>
					</label>
				</div>
				<label
					v-if="!connected"
					class="ui-field"
				>
					<span class="field-label">成员名</span>
					<input
						v-model="store.config.hostname"
						class="ui-input"
						placeholder="例如：Player1"
						maxlength="100"
					/>
				</label>
				<div
					v-if="!connected"
					class="ui-field"
				>
					<div class="field-label">
						虚拟网 IP
						<div class="ip-modes">
							<button
								v-for="mode in ipModes"
								:key="mode.value"
								type="button"
								:class="{ active: ipMode === mode.value }"
								@click="setIpMode(mode.value)"
							>
								{{ mode.label }}
							</button>
							<button
								type="button"
								@click="$emit('ipv6')"
							>
								+IPv6
							</button>
						</div>
					</div>
					<div class="ip-control">
						<input
							v-model="store.config.ipv4"
							class="ui-input mono"
							:readonly="ipMode !== 'manual'"
							:placeholder="
								ipMode === 'auto' ? '联机后自动获取' : ipMode === 'registered' ? '请先在社区登记固定 IP' : '例如：10.126.126.20'
							"
						/>
						<button
							v-if="ipMode === 'registered'"
							class="text-button"
							type="button"
							@click="$emit('navigate', 'community')"
						>
							管理
						</button>
						<span
							v-else
							class="ui-tag mono"
						>
							&lt;IPv4&gt;
						</span>
					</div>
				</div>
				<div class="quick-options">
					<label>
						<UiSwitch
							v-model="store.config.disbleP2p"
							label="强制中转"
						/>
						强制中转
					</label>
					<label v-if="isWindows">
						<UiSwitch
							:model-value="store.config.autoStart"
							label="开机自启"
							@update:model-value="$emit('autostart')"
						/>
						开机自启
					</label>
					<button
						class="text-button ml-auto"
						type="button"
						@click="$emit('command', 'share_import')"
					>
						<AppIcon
							name="share"
							:size="13"
						/>
						分享 / 导入
					</button>
				</div>
			</fieldset>
			<section
				v-if="connected"
				class="member-preview surface-card"
			>
				<div class="field-label">
					房间成员
					<button
						class="text-button ml-auto"
						@click="$emit('navigate', 'member')"
					>
						查看全部
						<AppIcon
							name="chevron-right"
							:size="12"
						/>
					</button>
				</div>
				<div class="preview-list">
					<button
						v-for="peer in previewPeers"
						:key="peer.id"
						class="preview-peer"
						@click="$emit('navigate', 'member')"
					>
						<span class="avatar">{{ peer.hostname?.slice(0, 1) || "?" }}</span>
						<span class="peer-name">
							{{ peer.hostname || "未命名成员" }}
							<small class="mono">{{ peer.ipv4 || "—" }}</small>
						</span>
						<span
							class="ui-tag"
							:class="peer.cost === 'p2p' ? 'success' : peer.cost === 'Local' ? 'primary' : 'warning'"
						>
							{{ peer.cost === "Local" ? "本机" : peer.cost === "p2p" ? "直连" : "中转" }}
						</span>
						<span class="mono peer-latency">{{ peer.cost === "Local" ? "—" : `${Math.round(Number(peer.lat_ms) || 0)} ms` }}</span>
					</button>
					<p
						v-if="!previewPeers.length"
						class="empty-preview"
					>
						等待朋友加入房间
					</p>
				</div>
			</section>
		</div>
		<div class="launch-action">
			<button
				class="launch-button"
				:class="{ stop: running }"
				:disabled="loading || !coreVersion || updating"
				@click="$emit('connect')"
			>
				<AppIcon
					:name="loading ? 'loader' : 'power'"
					:size="17"
					:class="{ spinning: loading }"
				/>
				{{ loading ? "正在启动…" : running ? "停止联机" : "启动联机" }}
			</button>
			<ElDropdown
				trigger="click"
				placement="top-end"
				@command="$emit('command', $event)"
			>
				<button
					class="launch-more"
					:class="{ stop: running }"
					aria-label="更多联机操作"
				>
					<AppIcon
						name="chevron-up"
						:size="17"
					/>
				</button>
				<template #dropdown>
					<ElDropdownMenu>
						<ElDropdownItem
							v-for="item in moreActions"
							:key="item.command"
							:command="item.command"
						>
							<AppIcon
								:name="item.icon"
								:size="15"
								class="mr-2"
							/>
							{{ item.label }}
						</ElDropdownItem>
					</ElDropdownMenu>
				</template>
			</ElDropdown>
		</div>
		<nav
			class="launcher-dock"
			aria-label="功能入口"
		>
			<button
				v-for="item in dockItems"
				:key="item.id"
				:class="{ active: activePanels.includes(item.id) }"
				@click="$emit('navigate', item.id)"
			>
				<AppIcon
					:name="item.icon"
					:size="18"
				/>
				<span>{{ item.label }}</span>
			</button>
		</nav>
	</main>
</template>
<script setup lang="ts">
	import { computed, ref } from "vue";
	import { isTauri } from "@tauri-apps/api/core";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import useMainStore from "@/stores/index";
	import { isWindows, usesNativeWindowControls } from "@/composables/platform";
	import { setTheme } from "@/composables/theme";
	import { supportProtocols } from "@/utils";
	import AppIcon from "@/components/AppIcon.vue";
	import UiSwitch from "@/components/UiSwitch.vue";
	import logo from "@/assets/brand/logo.png";
	import pkg from "@/package.json";
	const props = withDefaults(
		defineProps<{
			running: boolean;
			connected: boolean;
			loading: boolean;
			coreVersion: string;
			updating: boolean;
			hasUpdate: boolean;
			peers: Member[];
			elapsed: number;
			failure: string;
			activePanels: string[];
		}>(),
		{ peers: () => [], elapsed: 0, failure: "", activePanels: () => [] }
	);
	defineEmits<{
		connect: [];
		core: [];
		navigate: [page: string];
		command: [command: string];
		"public-servers": [];
		"server-change": [];
		"copy-ip": [];
		ipv6: [];
		autostart: [];
	}>();
	const store = useMainStore();
	const protocols = supportProtocols();
	const showPassword = ref(false);
	const ipModes = [
		{ label: "自动分配", value: "auto" },
		{ label: "手动", value: "manual" },
		{ label: "全局登记", value: "registered" }
	];
	const ipMode = computed(() => (store.coordinator.useRegisteredIp ? "registered" : store.config.dhcp ? "auto" : "manual"));
	const setIpMode = (mode: string) => {
		store.coordinator.useRegisteredIp = mode === "registered";
		store.config.dhcp = mode === "auto";
		if (mode === "auto") store.config.ipv4 = "";
	};
	const changeTheme = (mode: string) => {
		store.themeMode = mode as "system" | "light" | "dark";
		store.theme = mode === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : mode === "dark";
		setTheme(store.theme);
	};
	const minimize = () => {
		if (isTauri()) void getCurrentWindow().minimize();
	};
	const close = () => {
		if (isTauri()) void getCurrentWindow().close();
	};
	const direct = computed(() => props.peers.filter(p => p.cost === "p2p").length);
	const relayed = computed(() => props.peers.filter(p => p.cost !== "p2p" && p.cost !== "Local").length);
	const previewPeers = computed(() => props.peers.filter(p => p.cost !== "Local").slice(0, 3));
	const averageLatency = computed(() => {
		const values = props.peers
			.filter(p => p.cost !== "Local" && Number.isFinite(Number(p.lat_ms)) && Number(p.lat_ms) >= 0)
			.map(p => Number(p.lat_ms));
		return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : "—";
	});
	const duration = computed(
		() =>
			`${String(Math.floor(props.elapsed / 3600)).padStart(2, "0")}:${String(Math.floor(props.elapsed / 60) % 60).padStart(2, "0")}:${String(props.elapsed % 60).padStart(2, "0")}`
	);
	const dockItems = [
		{ id: "lobby", label: "大厅", icon: "door-open" },
		{ id: "member", label: "房间", icon: "users" },
		{ id: "gameList", label: "游戏库", icon: "gamepad-2" },
		{ id: "community", label: "社区", icon: "megaphone" },
		...(isWindows ? [{ id: "tool", label: "工具", icon: "wrench" }] : []),
		{ id: "advance", label: "高级", icon: "sliders-horizontal" },
		{ id: "log", label: "日志", icon: "scroll-text" }
	];
	const moreActions = [
		{ command: "reconnect", label: "重新联机", icon: "refresh" },
		{ command: "cidr", label: "子网代理", icon: "network" },
		{ command: "toml", label: "使用外部配置文件", icon: "file-json" },
		{ command: "config_admin", label: "房间配置管理", icon: "folder" },
		{ command: "save_config_admin", label: "保存当前房间配置", icon: "plus" },
		{ command: "create_server", label: "自建服务器", icon: "server" },
		{ command: "core", label: "内核管理", icon: "download" }
	];
</script>
<style scoped>
	.launcher-window {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.app-titlebar {
		height: 44px;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 16px;
	}
	.app-titlebar.native-macos-titlebar {
		padding-left: 92px;
	}
	.app-titlebar strong {
		font-size: 14px;
		font-weight: 700;
		white-space: nowrap;
	}
	.version {
		font-size: 11px;
		color: var(--text-3);
	}
	.titlebar-actions {
		display: flex;
		gap: 0;
		margin-left: auto;
	}
	.titlebar-actions .icon-button {
		width: 22px;
	}
	.launcher-body {
		min-height: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 16px 16px;
		overflow: auto;
	}
	.connection-status {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 14px;
		flex-shrink: 0;
	}
	.status-main {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.status-symbol {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text-2);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.status-copy {
		min-width: 0;
		flex: 1;
	}
	.status-heading {
		font-size: 14px;
		font-weight: 700;
		line-height: 22px;
	}
	.status-copy p {
		font-size: 11px;
		line-height: 18px;
		color: var(--text-3);
		margin: 2px 0 4px;
	}
	.status-copy .text-button {
		font-size: 11px;
	}
	.core-badge {
		border: 0;
		background: transparent;
		position: relative;
		color: var(--text-2);
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		padding: 0;
		flex-shrink: 0;
		font-size: 11px;
	}
	.core-badge span {
		color: var(--text-3);
		font-size: 10px;
	}
	.core-badge b {
		font-size: 11px;
		font-weight: 500;
	}
	.core-badge .dot {
		color: var(--warning);
		position: absolute;
		right: -6px;
		top: 14px;
	}
	.connection-status.connected {
		border-color: color-mix(in srgb, var(--success) 35%, transparent);
		padding: 14px;
	}
	.connected .status-symbol {
		background: var(--success-soft);
		color: var(--success);
	}
	.status-duration {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-3);
		margin-left: 6px;
	}
	.status-ip {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 26px;
		font-weight: 700;
		background: transparent;
		border: 0;
		padding: 0;
		color: var(--text-1);
		line-height: 34px;
	}
	.status-ip .app-icon {
		color: var(--text-3);
	}
	.status-metrics {
		display: flex;
		gap: 14px;
		color: var(--text-2);
		font-size: 10px;
		margin-top: 12px;
		border-top: 1px solid var(--border);
		padding-top: 10px;
	}
	.status-metrics span {
		display: flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
	.status-metrics b {
		font-weight: 400;
		color: var(--success);
	}
	.failed .status-symbol {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.failed .status-copy p {
		color: var(--danger);
	}
	.connection-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 0;
		border: 0;
		margin: 0;
		min-width: 0;
	}
	.connection-form.readonly {
		opacity: 0.5;
	}
	.connection-form:disabled .text-button {
		pointer-events: none;
	}
	.server-control {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		height: 36px;
	}
	.protocol-select {
		width: 90px;
		flex-shrink: 0;
	}
	.server-select {
		flex: 1;
		min-width: 0;
	}
	.server-control :deep(.el-select__wrapper) {
		box-shadow: none;
		background: transparent;
		padding: 0 4px;
		min-height: 24px;
	}
	.server-control :deep(.el-tag) {
		border: 0;
		background: var(--surface-3);
		color: var(--text-1);
		font-family: var(--mono);
		font-size: 10px;
	}
	.server-control :deep(.el-tag__close) {
		display: none;
	}
	.password-control,
	.ip-control {
		position: relative;
		display: block;
	}
	.password-control input {
		padding-right: 30px;
	}
	.password-control > .icon-button {
		position: absolute;
		right: 4px;
		top: 4px;
	}
	.ip-control input {
		background: var(--surface);
		padding-right: 60px;
	}
	.ip-control > .ui-tag,
	.ip-control > .text-button {
		position: absolute;
		right: 8px;
		top: 8px;
	}
	.ip-modes {
		margin-left: auto;
		display: flex;
		gap: 0;
	}
	.ip-modes button {
		border: 0;
		background: transparent;
		color: var(--text-3);
		font-size: 10px;
		padding: 2px 6px;
		line-height: 18px;
		border-radius: 4px;
		white-space: nowrap;
	}
	.ip-modes button.active {
		background: var(--surface-3);
		color: var(--text-1);
	}
	.quick-options {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 2px 0;
		color: var(--text-2);
		font-size: 11px;
	}
	.quick-options label {
		display: flex;
		align-items: center;
		gap: 7px;
		white-space: nowrap;
	}
	.member-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.preview-peer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		text-align: left;
		width: 100%;
	}
	.preview-peer .avatar {
		width: 26px;
		height: 26px;
		font-size: 10px;
	}
	.peer-name {
		font-size: 11px;
		flex: 1;
		min-width: 0;
	}
	.peer-name small {
		display: block;
		color: var(--text-3);
		font-size: 9px;
		line-height: 16px;
	}
	.peer-latency {
		color: var(--text-3);
		font-size: 10px;
		min-width: 42px;
		text-align: right;
	}
	.launch-action {
		margin-top: auto;
		display: flex;
		gap: 2px;
		min-height: 46px;
		padding-top: 4px;
		flex-shrink: 0;
	}
	.launch-button,
	.launch-more {
		border: 0;
		background: var(--primary);
		color: #fff;
		height: 46px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 600;
		gap: 8px;
	}
	.launch-button {
		flex: 1;
		border-radius: 10px 4px 4px 10px;
	}
	.launch-more {
		width: 46px;
		border-radius: 4px 10px 10px 4px;
	}
	.launch-button.stop,
	.launch-more.stop {
		background: var(--danger);
	}
	.launcher-dock {
		height: 60px;
		min-height: 60px;
		display: flex;
		justify-content: space-around;
		align-items: center;
		padding: 0 8px;
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.launcher-dock button {
		width: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		background: transparent;
		border: 0;
		padding: 5px 0;
		color: var(--text-2);
		border-radius: 8px;
	}
	.launcher-dock button span {
		font-size: 10px;
		color: var(--text-3);
	}
	.launcher-dock button:hover,
	.launcher-dock button.active {
		background: var(--primary-soft);
		color: var(--primary);
	}
	.launcher-dock button.active span {
		color: var(--primary);
	}
	.spinning {
		animation: spin 1.2s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinning {
			animation: none;
		}
	}
	@media (max-height: 650px) {
		.launcher-body {
			gap: 10px;
		}
		.connection-form {
			gap: 10px;
		}
	}
	.connected-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.connected-top .ui-tag {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.connected-room {
		margin-left: auto;
		font-size: 11px;
		color: var(--text-3);
		max-width: 130px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.virtual-ip-label {
		font-size: 11px;
		color: var(--text-3);
		margin-top: 10px;
	}
	.connection-status.connected {
		background: linear-gradient(110deg, var(--success-soft), var(--surface));
	}
	.status-ip {
		font-size: 28px;
		font-weight: 600;
		line-height: 39px;
	}
	.status-ip .app-icon {
		margin-left: 4px;
	}
	.ip-secondary {
		font-size: 10px;
		line-height: 18px;
		color: var(--text-3);
	}
	.status-metrics {
		border: 0;
		padding: 0;
		margin-top: 10px;
		gap: 6px;
	}
	.status-metrics > div {
		background: var(--app-bg);
		border-radius: 8px;
		padding: 8px 10px;
		flex: 1;
		min-width: 0;
	}
	.status-metrics span {
		font-size: 10px;
		color: var(--text-3);
	}
	.status-metrics b {
		display: block;
		font-size: 15px;
		font-weight: 600;
		color: var(--text-1);
		line-height: 24px;
	}
	.status-metrics b small {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-3);
	}
	.status-metrics .connection-count {
		font-size: 10px;
		display: flex;
		align-items: center;
		gap: 3px;
		white-space: nowrap;
	}
	.preview-list {
		padding: 5px 10px;
	}
	.preview-peer {
		background: transparent;
		border: 0;
		border-radius: 0;
		padding: 5px 0;
	}
	.empty-preview {
		font-size: 11px;
		color: var(--text-3);
		padding: 12px 0;
		text-align: center;
	}
	.launcher-body {
		padding-bottom: 14px;
	}
	.launch-action {
		margin-top: 0;
		min-height: 62px;
		padding: 0 16px 16px;
		background: var(--app-bg);
	}
	.member-preview {
		padding: 10px 12px;
		gap: 6px;
	}
	.preview-list {
		padding: 0;
	}
	.preview-peer {
		padding: 4px 0;
	}
	.preview-peer .avatar {
		width: 24px;
		height: 24px;
	}
	.peer-name {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.peer-name small {
		margin-left: auto;
		font-size: 10px;
		white-space: nowrap;
	}
	.launch-button.stop {
		background: var(--danger-soft);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
	}
	.launch-more.stop {
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--border);
	}
	.connected .status-ip {
		line-height: 36px;
	}
	.connected .status-metrics > div {
		padding-top: 6px;
		padding-bottom: 6px;
	}
</style>

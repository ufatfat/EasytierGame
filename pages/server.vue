<template>
	<section class="panel-window">
		<PanelHeader
			icon="server"
			title="自建服务器"
			subtitle="让设备成为联机节点，为朋友提供连接入口"
		/>
		<div class="panel-scroll server-content">
			<section class="surface-card server-status">
				<div class="server-symbol">
					<AppIcon
						name="server"
						:size="24"
					/>
				</div>
				<div>
					<h2>{{ data.isStart ? "服务器运行中" : "服务器未启动" }}</h2>
					<p>{{ data.isStart ? "正在为联机设备提供连接服务" : "配置监听端口，启动你的专属节点" }}</p>
				</div>
				<span
					class="ui-tag"
					:class="data.isStart ? 'success' : ''"
				>
					{{ data.isStart ? "运行中" : "未启动" }}
				</span>
			</section>
			<section class="surface-card server-options">
				<div class="server-setting">
					<div>
						<h2>服务器端口</h2>
						<p>其他客户端通过此端口连接</p>
					</div>
					<input
						v-model="mainStore.serverConfig.port"
						:disabled="data.isStart"
						class="ui-input mono server-port"
					/>
				</div>
				<div class="server-setting">
					<div>
						<h2>白名单</h2>
						<p>仅为指定房间提供转发，支持 * 通配符</p>
					</div>
					<UiSwitch
						v-model="mainStore.serverConfig.enableWhiteList"
						label="启用服务器白名单"
					/>
				</div>
				<textarea
					v-model="mainStore.serverConfig.serverWhiteList"
					class="ui-input mono whitelist"
					:disabled="!mainStore.serverConfig.enableWhiteList"
					rows="4"
					placeholder="每行一个房间名，例如：my-room 或 game-*"
				/>
				<div
					v-for="setting in serverSettings"
					:key="setting.key"
					class="server-setting"
				>
					<div>
						<h2>{{ setting.title }}</h2>
						<p>{{ setting.help }}</p>
					</div>
					<UiSwitch
						:model-value="(mainStore.serverConfig as any)[setting.key]"
						:label="setting.title"
						@update:model-value="
							setting.key === 'privateMode' ? handlePrivateModeClick() : ((mainStore.serverConfig as any)[setting.key] = $event)
						"
					/>
				</div>
			</section>
			<div class="inline-notice">
				<AppIcon
					name="info"
					:size="14"
				/>
				请在路由器和防火墙中放行监听端口，确保朋友可以连接到这台设备。
			</div>
			<button
				class="ui-button server-start"
				:class="data.isStart ? 'danger' : 'primary'"
				:disabled="data.loading"
				@click="hanldeClickStart"
			>
				<AppIcon
					name="power"
					:size="16"
				/>
				{{ data.loading ? "请稍候…" : data.isStart ? "停止服务器" : "启动服务器" }}
			</button>
			<details
				class="surface-card server-logs"
				:open="data.isStart"
				@toggle="logOpen = ($event.target as HTMLDetailsElement).open"
			>
				<summary>服务器日志</summary>
				<RuntimeLog
					v-if="logOpen"
					stream="server"
					embedded
				/>
			</details>
		</div>
		<ElDialog
			v-model="privateModeDialogData.visible"
			title="私有模式"
			width="90%"
		>
			<p class="section-caption">为服务器设置房间名和密码</p>
			<ElForm label-position="top">
				<ElFormItem label="房间名"><ElInput v-model="mainStore.serverConfig.privateNetworkName" /></ElFormItem>
				<ElFormItem label="房间密码">
					<ElInput
						v-model="mainStore.serverConfig.privateNetworkPassword"
						type="password"
						show-password
					/>
				</ElFormItem>
			</ElForm>
			<template #footer>
				<button
					class="ui-button"
					@click="privateModeDialogData.visible = false"
				>
					取消
				</button>
				<button
					class="ui-button primary ml-2"
					@click="handlePrivateModeDialogConfirm"
				>
					确认
				</button>
			</template>
		</ElDialog>
	</section>
</template>
<script setup lang="ts">
	import { isTauri } from "@tauri-apps/api/core";
	import RuntimeLog from "@/components/RuntimeLog.vue";
	import { useRuntimeNetwork } from "@/composables/runtime";
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import UiSwitch from "@/components/UiSwitch.vue";
	import useMainStore from "@/stores/index";
	import { reactive, ref, watch, onMounted, onBeforeUnmount } from "vue";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import { getServerArgs } from "@/composables/server";
	import { dataSubscribe } from "@/composables/windows";
	import { ElMessage, type FormInstance } from "element-plus";

	const appWindow = isTauri() ? getCurrentWindow() : null;
	const serverSettings = [
		{ key: "autoStart", title: "随应用自动启动", help: "打开软件时自动启动自建服务" },
		{ key: "privateMode", title: "私有模式", help: "仅允许相同房间名和密码的节点使用" },
		{ key: "relayAllPeerrpc", title: "帮助其他节点建立直连", help: "转发所有对等节点的 RPC 消息" },
		{ key: "ipv6PublicAddrProvider", title: "提供公网 IPv6 前缀", help: "为同网络其他节点分配独立公网地址" },
		{ key: "disableRelayData", title: "禁用 Relay 数据转发", help: "保留控制面，不承担中继流量" }
	];
	const mainStore = useMainStore();
	const data = reactive({
		isStart: false,
		loading: true
	});

	const logOpen = ref(false),
		runtime = useRuntimeNetwork();
	watch(
		runtime,
		state => {
			data.isStart = state.server_running;
			data.loading = false;
		},
		{ immediate: true }
	);
	let offAction: UnlistenFn | undefined;
	onMounted(async () => {
		if (isTauri())
			offAction = await listen("server-action-finished", () => {
				data.loading = false;
			});
	});
	onBeforeUnmount(() => offAction?.());
	const hanldeClickStart = async () => {
		if (!isTauri()) return ElMessage.info("请在桌面客户端启动服务器");
		data.loading = true;
		const args = getServerArgs();
		try {
			await appWindow!.emitTo("main", "startStopServer", { args });
		} catch (error) {
			data.loading = false;
			ElMessage.error(String(error));
		}
	};

	// const privateModeDialogFormEl = useTemplateRef<FormInstance>("privateModeDialogFormRef");

	const privateModeDialogData = reactive({
		visible: false
	});

	const handlePrivateModeClick = async () => {
		if (mainStore.serverConfig.privateMode) {
			mainStore.serverConfig.privateMode = false;
			return;
		}
		privateModeDialogData.visible = true;
	};

	const handlePrivateModeDialogConfirm = async () => {
		privateModeDialogData.visible = false;
		mainStore.serverConfig.privateMode = true;
	};

	dataSubscribe();
</script>

<style scoped>
	.server-content {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.server-status {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
	}
	.server-symbol {
		width: 44px;
		height: 44px;
		background: var(--primary-soft);
		color: var(--primary);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.server-status > div:nth-child(2) {
		flex: 1;
	}
	.server-status h2 {
		font-size: 14px;
		font-weight: 600;
	}
	.server-status p,
	.server-setting p {
		font-size: 10px;
		color: var(--text-3);
		line-height: 18px;
		margin-top: 3px;
	}
	.server-options {
		padding: 0 16px;
	}
	.server-setting {
		padding: 14px 0;
		display: flex;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--border);
	}
	.server-setting:last-child {
		border: 0;
	}
	.server-setting > div {
		flex: 1;
	}
	.server-setting h2 {
		font-size: 12px;
		font-weight: 500;
	}
	.server-port {
		width: 100px;
		height: 32px;
	}
	.whitelist {
		height: 100px;
		resize: vertical;
		margin-top: 12px;
		padding: 10px;
		font-size: 11px;
		line-height: 20px;
	}
	.server-start {
		height: 42px;
		align-self: flex-end;
		min-width: 160px;
	}
	.server-logs {
		padding: 12px 14px;
		font-size: 11px;
		color: var(--text-2);
	}
	.server-logs summary {
		cursor: pointer;
	}
	.server-logs pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 220px;
		overflow: auto;
		font-size: 10px;
		line-height: 18px;
		margin: 10px 0 0;
	}
</style>

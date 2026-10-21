<template>
	<section class="panel-window">
		<PanelHeader
			icon="sliders-horizontal"
			title="高级设置"
			subtitle="精细调整联机与网络行为"
		/>
		<div class="settings-search">
			<AppIcon
				name="search"
				:size="14"
			/>
			<input
				v-model="search"
				placeholder="搜索设置项…"
				aria-label="搜索设置"
			/>
		</div>
		<div class="settings-layout">
			<nav
				class="settings-nav"
				aria-label="设置分类"
			>
				<button
					v-for="group in groups"
					:key="group.id"
					:class="{ active: activeGroup === group.id && !search }"
					@click="
						activeGroup = group.id;
						search = '';
					"
				>
					<AppIcon
						:name="group.icon"
						:size="15"
					/>
					{{ group.title }}
				</button>
			</nav>
			<div class="settings-content panel-scroll">
				<div class="inline-notice">
					<AppIcon
						name="info"
						:size="13"
					/>
					设置自动保存，网络设置在下次启动联机时生效
				</div>
				<section
					v-for="group in visibleGroups"
					:key="group.id"
					class="settings-group"
				>
					<h2>{{ group.title }}</h2>
					<article
						v-for="setting in group.settings"
						:key="setting[0]"
						class="setting-row"
					>
						<div class="setting-copy">
							<label :for="`setting-${setting[0]}`">
								{{ setting[1] }}
								<CoreVersionWarning
									v-if="setting[3]"
									:version="setting[3]"
								/>
							</label>
							<p>{{ windowsSettings.includes(setting[0]) && !isWindows ? "仅适用于 Windows" : setting[2] }}</p>
							<input
								v-if="extraFields[setting[0]]"
								v-model="(mainStore.config as any)[extraFields[setting[0]].key]"
								class="ui-input mono"
								:type="extraFields[setting[0]].type || 'text'"
								:placeholder="extraFields[setting[0]].placeholder"
								:min="1"
								:max="9999"
								:disabled="!(mainStore.config as any)[setting[0]] || (windowsSettings.includes(setting[0]) && !isWindows)"
							/>
							<select
								v-if="setting[0] === 'enableCustomProtocol'"
								v-model="mainStore.config.customProtocol"
								class="ui-input mono"
								:disabled="!mainStore.config.enableCustomProtocol"
							>
								<option
									v-for="protocol in protocols"
									:key="protocol"
								>
									{{ protocol }}
								</option>
							</select>
							<button
								v-if="setting[0] === 'enableCustomListener'"
								class="text-button"
								:disabled="mainStore.config.disbleListenner"
								@click="handleListenerDialog"
							>
								配置监听地址
								<AppIcon
									name="chevron-right"
									:size="12"
								/>
							</button>
							<button
								v-if="setting[0] === 'enablePortForward'"
								class="text-button"
								:disabled="!mainStore.config.enablePortForward"
								@click="handlePortForwardDialog"
							>
								配置转发规则
								<AppIcon
									name="chevron-right"
									:size="12"
								/>
							</button>
						</div>
						<UiSwitch
							:id="`setting-${setting[0]}`"
							:model-value="(mainStore.config as any)[setting[0]]"
							:label="setting[1]"
							:disabled="
								(windowsSettings.includes(setting[0]) && !isWindows) ||
								(setting[0] === 'enableCustomListener' && mainStore.config.disbleListenner)
							"
							@update:model-value="setSetting(setting[0], $event)"
						/>
					</article>
					<div
						v-if="group.id === 'network'"
						class="setting-row"
					>
						<div class="setting-copy">
							<label>监听端口</label>
							<p>0 表示自动选择端口</p>
						</div>
						<input
							v-model="mainStore.config.port"
							class="ui-input mono short-input"
							:disabled="mainStore.config.disbleListenner || mainStore.config.enableCustomListener"
						/>
					</div>
					<template v-if="group.id === 'performance'">
						<div class="setting-row">
							<div class="setting-copy">
								<label>传输数据压缩</label>
								<p>游戏联机建议不压缩</p>
							</div>
							<select
								v-model="mainStore.config.compression"
								class="ui-input short-input"
							>
								<option value="none">不压缩</option>
								<option value="zstd">zstd</option>
							</select>
						</div>
						<div class="setting-row">
							<div class="setting-copy">
								<label>日志级别</label>
								<button
									class="text-button"
									@click="openLogDir"
								>
									打开日志目录
								</button>
							</div>
							<select
								v-model="mainStore.config.logLevel"
								class="ui-input short-input"
							>
								<option
									v-for="level in data"
									:key="level"
								>
									{{ level }}
								</option>
							</select>
						</div>
					</template>
					<div
						v-if="group.id === 'application'"
						class="setting-row"
					>
						<div class="setting-copy">
							<label>自动生成配置文件</label>
							<p>将界面配置写入 easytier/config.json</p>
							<button
								class="text-button"
								@click="openConfigJsonDir"
							>
								打开配置目录
							</button>
						</div>
						<UiSwitch
							v-model="mainStore.createConfigInEasytier"
							label="自动生成配置文件"
						/>
					</div>
				</section>
				<p
					v-if="!visibleGroups.length"
					class="empty-state"
				>
					没有找到匹配的设置
				</p>
			</div>
		</div>
		<ElDialog
			v-model="listenerDialogData.visible"
			title="自定义监听地址"
			width="90%"
		>
			<ElInput
				v-model="mainStore.config.customListenerData"
				type="textarea"
				:rows="8"
				placeholder="每行一个，例如 tcp://0.0.0.0:11010"
			/>
			<template #footer>
				<button
					class="ui-button primary"
					@click="handleFinishInputListener"
				>
					完成
				</button>
			</template>
		</ElDialog>
		<ElDialog
			v-model="portForwardDialogData.visible"
			title="端口转发配置"
			width="90%"
		>
			<p class="dialog-hint">每行一个规则：协议://本地地址:端口/目标地址:端口</p>
			<ElInput
				v-model="mainStore.config.portForwardData"
				type="textarea"
				:rows="8"
				placeholder="udp://0.0.0.0:12345/10.126.126.1:23456"
			/>
			<template #footer>
				<button
					class="ui-button primary"
					@click="handleFinishInputPortForward"
				>
					完成
				</button>
			</template>
		</ElDialog>
	</section>
</template>
<script setup lang="ts">
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import UiSwitch from "@/components/UiSwitch.vue";
	import { isWindows, dataBaseDir, getDataDir as getResourceDir, openFolder } from "@/composables/platform";
	import useMainStore from "@/stores/index";
	import { QuestionFilled } from "@element-plus/icons-vue";
	import { join } from "@tauri-apps/api/path";
	import { Command } from "@tauri-apps/plugin-shell";
	import { exists, mkdir, BaseDirectory, remove } from "@tauri-apps/plugin-fs";
	import { ElMessage } from "element-plus";
	import { computed, reactive, ref, watch, nextTick } from "vue";
	import { dataSubscribe } from "@/composables/windows";
	import { ATJ, supportProtocols } from "~/utils";
	import CoreVersionWarning from "@/components/CoreVersionWarning.vue";
	import { ElConfirmDanger } from "~/utils/element";
	import { invoke, isTauri } from "@tauri-apps/api/core";

	const search = ref(""),
		activeGroup = ref("connection");
	const groups = [
		{
			id: "connection",
			title: "连接与协议",
			icon: "network",
			settings: [
				["enableCustomProtocol", "优先传输协议", "直连时优先使用指定协议，无法连接时自动回退"],
				["relayAllPeerrpc", "帮助其他节点建立直连", "转发所有对等节点的 RPC 控制消息"],
				["latencyfirst", "低延迟模式", "优先选择延迟较低的路径，弱网下可能有波动"],
				["enableKcpProxy", "KCP 代理", "将 TCP 流量转为 KCP，不能与 QUIC 同时开启", "2.2.0"],
				["disableKcpInput", "禁用 KCP 输入", "其他节点访问本机时使用原始 TCP 连接", "2.2.0"],
				["enableQuicProxy", "QUIC 代理", "改善 UDP 丢包环境的吞吐量和延迟", "2.3.2"],
				["disableQuicInput", "禁用 QUIC 输入", "不接受其他节点的 QUIC 代理连接", "2.3.2"],
				["disableUdpHolePunching", "禁用 UDP 打洞", "无法建立直连时可尝试调整"],
				["disableRelayData", "禁用 Relay 数据转发", "保留控制面，不承担中继带宽", "2.6.3"]
			]
		},
		{
			id: "network",
			title: "网络与路由",
			icon: "route",
			settings: [
				["disableIpv6", "不使用 IPv6", "仅使用 IPv4 建立连接"],
				["enableUpnp", "UPnP 端口映射", "自动向路由器请求端口映射", "2.6.2"],
				["acceptDNS", "魔法 DNS", "通过 <hostname>.et.net 访问节点，会修改系统 DNS", "2.3.0"],
				["enablExitNode", "允许成为出口节点", "允许其他节点通过本机访问外部网络"],
				["ipv6PublicAddrProvider", "提供公网 IPv6 前缀", "为同网络其他节点分配公网地址", "2.6.2"],
				["ipv6PublicAddrAuto", "自动获取公网 IPv6", "从前缀提供者获取独立公网地址", "2.6.2"],
				["disbleListenner", "不监听任何端口", "仅主动连接其他节点"],
				["enableCustomListener", "自定义监听地址", "按协议和端口指定本机监听地址"],
				["enablePortForward", "端口转发", "将本地端口转发到虚拟网络中的远程端口", "2.3.0"]
			]
		},
		{
			id: "security",
			title: "安全与访问",
			icon: "shield",
			settings: [
				["privateMode", "私有模式", "禁止不同房间名和密码的节点通过本机握手或中转", "2.3.1"],
				["disableEncryption", "关闭信息加密", "开启后房间名、密码及通信数据将明文传输"],
				["tcpWhitelistEnable", "TCP 端口白名单", "仅允许列表中的 TCP 端口访问", "2.4.2"],
				["udpWhitelistEnable", "UDP 端口白名单", "仅允许列表中的 UDP 端口访问", "2.4.2"]
			]
		},
		{
			id: "adapter",
			title: "网卡与设备",
			icon: "ethernet-port",
			settings: [
				["devName", "自定义虚拟网卡名称", "便于在系统设置中识别联机网卡"],
				["enableNetCardMetric", "自定义虚拟网卡优先级", "跃点越小，网卡优先级越高"],
				["noTun", "不创建 TUN 虚拟网卡", "开启后该节点无法主动访问其他节点"],
				["bindDeviceEnable", "绑定物理网卡", "避免子网代理网段冲突导致的路由问题", "2.2.3"],
				["enableUdpBroadcastRelay", "Windows UDP 广播中继", "让依赖局域网广播的游戏发现其他玩家", "2.6.4"]
			]
		},
		{
			id: "performance",
			title: "性能与日志",
			icon: "gauge",
			settings: [
				["multiThread", "多线程", "提高并发网络处理能力"],
				["useSmoltcp", "用户网络栈", "用于子网和 KCP 代理，无需配置防火墙，但性能较低"],
				["saveErrorLog", "输出日志到本地", "按所选级别记录内核运行日志"]
			]
		},
		{
			id: "application",
			title: "应用设置",
			icon: "settings",
			settings: [
				["connectAfterStart", "启动后自动联机", "打开软件后自动启动当前房间"],
				["enablePreventSleep", "防止系统休眠", "联机时保持系统唤醒"]
			]
		}
	];
	const visibleGroups = computed(() =>
		groups
			.filter(group => search.value.trim() || group.id === activeGroup.value)
			.map(group => ({
				...group,
				settings: group.settings.filter(
					row => !search.value.trim() || row.join(" ").toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())
				)
			}))
			.filter(group => group.settings.length)
	);
	const windowsSettings = ["devName", "enableNetCardMetric", "bindDeviceEnable", "enableUdpBroadcastRelay"];
	const extraFields: Record<string, { key: string; placeholder: string; type?: string }> = {
		devName: { key: "devNameValue", placeholder: "etgame" },
		enableNetCardMetric: { key: "netCardMetricValue", placeholder: "1–9999", type: "number" },
		tcpWhitelistEnable: { key: "tcpWhitelist", placeholder: "80, 8000-9000" },
		udpWhitelistEnable: { key: "udpWhitelist", placeholder: "53, 5000-6000" }
	};
	const setSetting = (key: string, value: boolean) => {
		(mainStore.config as Record<string, any>)[key] = value;
		if (key === "enableKcpProxy") handleKcpProxyChange();
		if (key === "enableQuicProxy") handleQuicProxyChange();
	};
	watch([search, activeGroup], async () => {
		await nextTick();
		document.querySelector(".settings-content")?.scrollTo({ top: 0 });
	});
	const protocols = supportProtocols();
	const listenerDialogData = reactive<{ [key: string]: any }>({
		visible: false,
		loading: false
	});

	const portForwardDialogData = reactive<{ [key: string]: any }>({
		visible: false,
		loading: false
	});

	const handlePortForwardDialog = () => {
		portForwardDialogData.visible = true;
	};

	const handleListenerDialog = () => {
		listenerDialogData.visible = true;
	};

	const handleFinishInputListener = async () => {
		listenerDialogData.visible = false;
	};

	const handleFinishInputPortForward = async () => {
		portForwardDialogData.visible = false;
	};

	const mainStore = useMainStore();
	const data = ["trace", "debug", "info", "warn", "error", "off"];
	const guids = ref<string[][]>([]);
	const openLogDir = async () => {
		const resourceDir = await getResourceDir();
		const logPath = import.meta.env.VITE_LOG_PATH;
		const logDirPath = await join(resourceDir, logPath);
		const isExists = await exists(logPath, { baseDir: dataBaseDir() });
		if (!isExists) {
			try {
				await mkdir(logPath, { baseDir: dataBaseDir() });
			} catch (err) {}
		}
		await openFolder(logDirPath);
	};

	const openConfigJsonDir = async () => {
		const resourceDir = await getResourceDir();
		const easytierDir = await join(resourceDir, "easytier/");
		const isExists = await exists("easytier/", { baseDir: dataBaseDir() });
		if (isExists) {
			await openFolder(easytierDir);
		} else {
			ElMessage.error("config.json的目录不存在");
		}
	};

	const handleKcpProxyChange = () => {
		if (mainStore.config.enableKcpProxy) {
			if (mainStore.config.enableQuicProxy) {
				ElMessage.warning("KCP代理和QUIC代理不能同时开启");
			}
			mainStore.config.enableQuicProxy = false;
		}
	};

	const handleQuicProxyChange = () => {
		if (mainStore.config.enableQuicProxy) {
			if (mainStore.config.enableKcpProxy) {
				ElMessage.warning("KCP代理和QUIC代理不能同时开启");
			}
			mainStore.config.enableKcpProxy = false;
		}
	};

	// 为bind_device功能增加改方法
	const getGuids = async () => {
		const guidsValue = await invoke<string[][]>("get_network_adapter_guids");
		guids.value = guidsValue && guidsValue.length > 0 ? guidsValue : [];
	};

	dataSubscribe(async () => {
		if (!isTauri()) return;
		if (!mainStore.createConfigInEasytier) {
			// 考虑删除本地config.json文件
			const configJsonPath = import.meta.env.VITE_CONFIG_FILE_NAME;
			const isExists = await exists(configJsonPath, { baseDir: dataBaseDir() });
			// console.log({ isExists });
			if (isExists) {
				const [error, _] = await ElConfirmDanger("生成配置文件功能被关闭,是否删除本地config.json", "提示", {
					confirmButtonText: "删除",
					cancelButtonText: "保留"
				});
				if (!error) {
					// 删除本地config.json文件
					const [error, _] = await ATJ(remove(configJsonPath, { baseDir: dataBaseDir() }));
					if (error) {
						ElMessage.error("删除失败，请打开目录手动删除");
					}
				}
			}
		}
	});
</script>

<style scoped>
	.settings-search {
		margin: 12px 20px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		height: 34px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--text-3);
	}
	.settings-search input {
		border: 0;
		background: transparent;
		outline: none;
		width: 100%;
		font-size: 12px;
		color: var(--text-1);
	}
	.settings-layout {
		display: flex;
		flex: 1;
		min-height: 0;
		border-top: 1px solid var(--border);
	}
	.settings-nav {
		width: 138px;
		flex-shrink: 0;
		padding: 12px 8px;
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.settings-nav button {
		display: flex;
		align-items: center;
		gap: 8px;
		border: 0;
		border-radius: 8px;
		color: var(--text-2);
		background: transparent;
		padding: 10px 8px;
		font-size: 11px;
		text-align: left;
	}
	.settings-nav button.active {
		background: var(--primary-soft);
		color: var(--primary);
	}
	.settings-content {
		padding: 16px;
		flex: 1;
		min-width: 0;
	}
	.settings-content > .inline-notice {
		font-size: 10px;
		margin-bottom: 16px;
		padding: 9px 10px;
	}
	.settings-group h2 {
		font-size: 12px;
		color: var(--text-3);
		font-weight: 500;
		margin: 12px 0 8px;
	}
	.setting-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}
	.setting-row > .ui-switch {
		margin-top: 4px;
		flex-shrink: 0;
	}
	.setting-copy {
		flex: 1;
		min-width: 0;
	}
	.setting-copy label {
		font-size: 12px;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.setting-copy p {
		font-size: 10px;
		color: var(--text-3);
		line-height: 18px;
		margin: 3px 0 0;
	}
	.setting-copy .ui-input {
		margin-top: 8px;
		height: 30px;
		max-width: 230px;
		font-size: 11px;
	}
	.setting-copy .text-button {
		margin-top: 6px;
		font-size: 10px;
	}
	.short-input {
		width: 100px;
		height: 30px;
		font-size: 11px;
	}
	.dialog-hint {
		font-size: 11px;
		color: var(--text-3);
		margin-bottom: 12px;
	}
	@media (max-width: 480px) {
		.settings-nav {
			width: 114px;
		}
		.settings-nav button {
			font-size: 10px;
			gap: 6px;
		}
		.settings-content {
			padding: 12px;
		}
	}
</style>

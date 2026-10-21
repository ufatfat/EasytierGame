<template>
	<LauncherHome
		:running="data.isStart"
		:connected="data.isSuccessGetIp"
		:loading="data.startLoading"
		:core-version="data.coreVersion"
		:updating="data.update"
		:has-update="haveNewCoreVersion"
		:peers="peers"
		:elapsed="elapsed"
		:failure="failure"
		:active-panels="activePanels"
		@connect="handleConnection"
		@core="handleCoreManagement"
		@navigate="navigatePanel"
		@command="homeCommand"
		@public-servers="handleShowPublicServersDialog"
		@server-change="handleServerUrlChange"
		@copy-ip="handleCopyIp"
		@ipv6="handleDealIpv6"
		@autostart="handleAutoStartByTask"
	/>
	<ElDialog
		width="95%"
		top="10px"
		append-to-body
		:z-index="10"
		class="!mb-0"
		v-model="coreManagementData.visible"
		:close-on-press-escape="false"
		title="内核管理"
	>
		<div>
			<ElText>当前版本: {{ data.coreVersion || "-" }}</ElText>
			<div v-if="data.update">
				<ElProgress :percentage="progress"></ElProgress>
			</div>
		</div>
		<div class="mt-[5px] pb-[5px]">
			<ElText class="!mr-[10px]">选择一个内核版本安装</ElText>
			<ElButton
				:loading="coreManagementData.loading"
				@click="getReleaseList"
				size="small"
			>
				刷新
			</ElButton>
			<ElTooltip
				placement="top"
				content="打开内核缓存目录"
			>
				<ElButton
					:icon="Folder"
					size="small"
					@click="handleOpenCache"
				></ElButton>
			</ElTooltip>
		</div>
		<ElSelect
			placeholder="请选择内核版本"
			no-data-text="正在获取中..."
			popper-class="!h-[120px]"
			v-model="coreManagementData.data"
		>
			<ElOption
				v-for="(release, idx) in data.releaseList"
				:key="`${idx}-ray`"
				:label="release[0]"
				:value="`${release[2]}<>${release[1]}`"
			>
				{{ release ? release[0] : "" }}
			</ElOption>
		</ElSelect>
		<div class="mt-[10px] pb-[5px]">
			<ElTooltip content="不使用出国软件也能告诉下载github Release包的地址，可自行搜索替换使用">
				<ElText>github下载加速地址</ElText>
			</ElTooltip>
		</div>
		<ElInput
			v-model="mainStore.githubFastUrl"
			placeholder="请输入github加速地址"
		>
			<template #append>
				<ElTooltip content="github加速链接的发布地址,当前地址失效后,访问它获取最新的地址">
					<ElButton @click="open('https://ghproxy.link/')">发布地址</ElButton>
				</ElTooltip>
			</template>
		</ElInput>
		<template #footer>
			<div class="text-right">
				<ElButton
					size="small"
					:loading="data.update"
					@click="handleInstallCore"
					type="primary"
				>
					安装选中内核
				</ElButton>
				<ElButton
					size="small"
					type="warning"
					@click="addQQGroup"
				>
					加群获取
				</ElButton>
				<ElButton
					size="small"
					@click="coreManagementData.visible = false"
				>
					取消
				</ElButton>
			</div>
		</template>
	</ElDialog>
	<ElDialog
		width="95%"
		top="10px"
		append-to-body
		:z-index="10"
		class="!mb-0"
		v-model="importConfigData.visible"
		:close-on-press-escape="false"
		title="导入分享"
	>
		<ElInput
			type="textarea"
			:rows="6"
			placeholder="请粘贴分享的配置"
			v-model="importConfigData.data"
		></ElInput>
		<template #footer>
			<div>
				<el-text type="danger">导入成功后，您当前的部分配置将被替换</el-text>
			</div>
			<div class="text-right">
				<ElButton
					size="small"
					@click="handleStartImport"
					type="primary"
				>
					导入
				</ElButton>
			</div>
		</template>
	</ElDialog>
	<ElDialog
		width="95%"
		top="30px"
		append-to-body
		:z-index="10"
		class="!mb-0"
		v-model="configStart.visible"
		:close-on-press-escape="false"
		title="配置文件启动"
	>
		<div class="flex items-center gap-[0_4px]">
			<span>启用</span>
			<ElSwitch v-model="mainStore.configStartEnable"></ElSwitch>
			<ElTooltip content="启用后将完全使用选中的配置文件作为联机配置，其余界面配置不会生效">
				<ElIcon class="ml-[3px]"><QuestionFilled /></ElIcon>
			</ElTooltip>
			<ElButton
				@click="openConfigDir"
				size="small"
			>
				打开存储目录
			</ElButton>
			<ElButton
				@click="handleStartCommand('toml')"
				type="primary"
				:icon="RefreshRight"
				size="small"
			>
				刷新
			</ElButton>
		</div>
		<div class="mt-[5px]">
			<ElSelect
				v-model="mainStore.configPath"
				no-data-text="目录没有配置文件"
				placeholder="选择配置文件"
				filterable
			>
				<ElOption
					v-for="item in configStart.list"
					:key="item.path"
					:value="item.path"
					:label="item.name"
				></ElOption>
			</ElSelect>
		</div>
		<template #footer>
			<div class="text-right">
				<ElButton
					size="small"
					@click="configStart.visible = false"
					type="danger"
				>
					关闭
				</ElButton>
			</div>
		</template>
	</ElDialog>
	<ElDialog
		width="95%"
		top="30px"
		append-to-body
		:z-index="10"
		class="!mb-0"
		v-model="configAdminData.visible"
		:close-on-press-escape="false"
		title="房间配置管理"
	>
		<div class="flex items-center">
			<ElButton
				@click="openConfigAdminDir"
				size="small"
			>
				打开存储目录
			</ElButton>
			<ElButton
				@click="handleStartCommand('config_admin')"
				type="primary"
				:icon="RefreshRight"
				size="small"
			>
				刷新
			</ElButton>
			<ElTooltip
				placement="top-start"
				:offset="2"
				:show-arrow="false"
				content="删除选中配置"
			>
				<ElButton
					class="!ml-auto"
					:icon="Delete"
					@click="handleDeleteAdminConfig"
					type="danger"
					size="small"
				></ElButton>
			</ElTooltip>
		</div>
		<div class="mt-[5px]">
			<ElSelect
				v-model="configAdminData.fileName"
				no-data-text="目录没有配置文件"
				placeholder="选择配置文件"
				filterable
			>
				<ElOption
					v-for="item in configAdminData.list"
					:key="item.path"
					:value="item.path"
					:label="item.name"
				></ElOption>
			</ElSelect>
		</div>
		<template #footer>
			<div class="text-right">
				<div class="mb-[5px]">
					<ElAlert
						show-icon
						type="warning"
						title="打开目录删除文件即可删除配置"
					></ElAlert>
				</div>

				<ElButton
					size="small"
					@click="handleExchangeAdminConfig"
					type="primary"
				>
					切换选中配置
				</ElButton>
				<ElButton
					size="small"
					@click="configAdminData.visible = false"
					plain
				>
					关闭
				</ElButton>
			</div>
		</template>
	</ElDialog>
	<ElDialog
		width="95%"
		top="30px"
		append-to-body
		:z-index="10"
		class="!mb-0"
		title="IPV6地址填写"
		:close-on-press-escape="false"
		:close-on-click-modal="false"
		:show-close="false"
		v-model="ipv6InputDialog.visible"
	>
		<ElInput
			v-model="mainStore.config.ipv6"
			clearable
			placeholder="请输入IPV6地址"
		></ElInput>
		<template #footer>
			<div class="text-right">
				<ElButton
					type="primary"
					size="small"
					@click="handleValidateIpv6"
				>
					确定
				</ElButton>
			</div>
		</template>
	</ElDialog>
</template>
<script setup lang="ts">
	import { exactPeerUrls, roomJoinPatch, publicationSnapshot } from "@/utils/lobby-domain";
	import { roomConnection } from "@/composables/lobby";
	import LauncherHome from "@/components/LauncherHome.vue";
	import { listRooms, heartbeatRoom, removeRoom, type RoomConnection } from "@/composables/lobby";
	import { registeredAddress } from "@/composables/coordinator";
	import { isWindows, dataBaseDir, getDataDir as getResourceDir, openFolder } from "@/composables/platform";
	import { invoke, isTauri } from "@tauri-apps/api/core";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import { open, Command } from "@tauri-apps/plugin-shell";
	import {
		QuestionFilled,
		Delete,
		List,
		CirclePlusFilled,
		Setting,
		Share,
		RefreshRight,
		Link,
		Tools,
		MagicStick,
		SetUp,
		Folder,
		CopyDocument,
		Platform,
		SwitchFilled
	} from "@element-plus/icons-vue";
	import { reactive, onBeforeUnmount, onMounted, ref, toRaw, computed, watch } from "vue";
	import { useTray, setTrayRunState, setTrayTooltip, checkNewVersion, hasNewVersion } from "~/composables/tray";
	import { getMatches } from "@tauri-apps/plugin-cli";
	import { initStartWinIpBroadcast } from "~/composables/netcard";
	import useMainStore from "@/stores/index";
	import { ElMessage, ElMessageBox, ElTooltip } from "element-plus";
	import { getCurrentWindow, PhysicalSize, type Window } from "@tauri-apps/api/window";
	import { getAllWebviewWindows, WebviewWindow } from "@tauri-apps/api/webviewWindow";
	import etWindows, { dataSubscribe } from "@/composables/windows";
	import { join } from "@tauri-apps/api/path";
	import {
		readDir,
		exists,
		mkdir,
		BaseDirectory,
		readTextFile,
		readFile,
		writeFile,
		writeTextFile,
		remove as removeFile,
		stat
	} from "@tauri-apps/plugin-fs";
	import { updateConfigJson, updateConfigJsonBounce } from "~/composables/configJson";
	import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
	import { sortedUniq, uniq } from "lodash-es";
	import { addQQGroup, supportProtocols, preventSleep, stopPreventSleep, ATJ, copyText, isValidWindowsFileName, mixedArray } from "~/utils";
	import { ElConfirmDanger, ElConfirmPrimary } from "~/utils/element";
	import { getServerArgs } from "@/composables/server";
	import { useRuntimeNetwork } from "@/composables/runtime";
	import { networkSnapshot } from "@/composables/lobby";
	import { isIPv6 } from "is-ip";

	let is_close = false;
	const publicPeersLink = import.meta.env.VITE_PUBLIC_PEERS_URL;
	const tray = await useTray(
		true,
		async () => {
			await invoke("stop_command", { child_id: listenObj.thread_id || 0 });
			await invoke("stop_command", { child_id: data.winipBcPid || 0 });
			await invoke("stop_command", { child_id: listenObj.server_thread_id.value || 0 });
			await stopPublishedRoom();
			await stopPreventSleep(); //关闭防休眠
			is_close = true;
		},
		async () => {
			await handleConnection();
			return data.isStart;
		},
		async () => {
			await handleReconnect();
		},
		async () => {
			await handleShowPublicServersDialog();
		}
	);

	const mainStore = useMainStore();
	const peers = ref<Member[]>([]),
		failure = ref("");
	const startedAt = ref(0),
		elapsed = ref(0);
	let clockTimer: ReturnType<typeof setInterval> | undefined;
	const sharedPanelVisibility = reactive({ lobby: false, community: false });
	const activePanels = computed(() =>
		Object.entries({
			...sharedPanelVisibility,
			member: data.memberVisible,
			gameList: data.gameListVisible,
			advance: data.advanceVisible,
			tool: data.toolVisible,
			log: data.logVisible
		})
			.filter(([, open]) => open)
			.map(([name]) => name)
	);
	const homeCommand = async (command: string) => {
		if (command === "core") return handleCoreManagement();
		if (command === "share_import") {
			const result = await ElMessageBox.confirm("分享当前联机配置，或粘贴朋友的分享码", "分享 / 导入", {
				confirmButtonText: "分享配置",
				cancelButtonText: "导入配置",
				distinguishCancelAndClose: true
			})
				.then(() => "share_config")
				.catch(reason => (reason === "cancel" ? "import_config" : null));
			if (result) await handleStartCommand(result);
			return;
		}
		await handleStartCommand(command);
	};
	const navigatePanel = async (page: string) => {
		const actions: Record<string, () => Promise<any>> = {
			member: handleShowMemberDialog,
			gameList: () => handleStartCommand("game_start_config"),
			tool: handleShowToolDialog,
			advance: handleShowAdvanceDialog,
			log: handleShowLogDialog
		};
		if (actions[page]) return actions[page]();
		if (["lobby", "community"].includes(page)) {
			const panel = page as "lobby" | "community";
			await etWindows(
				page,
				{
					title: page === "lobby" ? "房间大厅" : "社区 · 全局 IP 与公告",
					url: `#/${page}`,
					width: 600,
					height: 720,
					minWidth: 520,
					minHeight: 480
				},
				() => {
					sharedPanelVisibility[panel] = true;
				},
				() => {
					sharedPanelVisibility[panel] = false;
				}
			);
		}
	};

	const protocols = supportProtocols();
	const data = reactive({
		//easytierGame有没有新版
		logVisible: false,
		cidrVisible: false,
		advanceVisible: false,
		toolVisible: false,
		gameListVisible: false,
		nodesListVisible: false,
		serverVisible: false,
		winipBcPid: 0, //WinIPBroadcast进程id
		winipBcStart: false,
		memberVisible: false,
		log: "",
		update: false,
		releaseList: [[]],
		coreVersion: "",
		isSuccessGetIp: false,
		startLoading: false,
		isStart: false,
		connectionSuccess: false,
		configJsonSeverUrl: [] // 本地保存一次，用于回填config.json
	});

	const configStart = reactive<{ list: Array<{ path: string; name: string }>; [key: string]: any }>({
		visible: false,
		loading: false,
		list: [] //配置文件列表
	});

	const configAdminData = reactive<{ fileName: string; list: Array<{ path: string; name: string }>; [key: string]: any }>({
		visible: false,
		loading: false,
		list: [],
		fileName: ""
	});

	const importConfigData = reactive<{ data: ""; [key: string]: any }>({
		visible: false,
		loading: false,
		data: ""
	});

	const coreManagementData = reactive<{ data: ""; [key: string]: any }>({
		visible: false,
		loading: false,
		data: ""
	});

	const closePrevent = async () => {
		const appWindow = getCurrentWindow();
		if (appWindow.label == "main") {
			appWindow.onCloseRequested(async event => {
				// console.error(appWindow.label);
				if (!is_close) {
					// console.error(1);s
					event.preventDefault();
					appWindow.hide();
				}
			});
		}
	};

	const ipv6InputDialog = reactive<{ visible: boolean; [key: string]: any }>({
		visible: false
	});

	const handleDealIpv6 = async () => {
		ipv6InputDialog.visible = true;
	};

	const handleValidateIpv6 = () => {
		mainStore.config.ipv6 = mainStore.config.ipv6?.trim() || "";
		if (mainStore.config.ipv6 && !isIPv6(mainStore.config.ipv6)) {
			ElMessage.error("请输入正确的IPV6地址");
			return;
		}
		ipv6InputDialog.visible = false;
	};

	const handleCopyIp = async () => {
		const v6 = mainStore.config.ipv6?.trim();
		const v4 = mainStore.config.ipv4?.trim();
		if (v6) {
			const [err] = await ElConfirmPrimary("检测到您填写了IPV6地址，是否复制IPV6地址？", "提示", {
				confirmButtonText: "复制IPV6",
				cancelButtonText: "复制IPV4"
			});
			if (!err) {
				await copyText(v6);
			} else {
				if (!v4) {
					ElMessage.error("没有IPV4地址，无法复制");
					return;
				}
				if (data.isStart || !mainStore.config.dhcp) {
					await copyText(v4);
				} else {
					await copyText(v4, "复制成功,联机后IP可能会变化");
				}
			}
		} else {
			if (!v4) {
				ElMessage.error("没有IPV4地址，无法复制");
				return;
			}
			if (data.isStart || !mainStore.config.dhcp) {
				await copyText(v4);
			} else {
				await copyText(v4, "复制成功,联机后IP可能会变化");
			}
		}
	};

	const handleOpenCache = async () => {
		const cache_path = import.meta.env.VITE_CACHE_PATH;
		const resourceDir = await getResourceDir();
		const configPath = await join(resourceDir, cache_path);
		const isExists = await exists(cache_path, { baseDir: dataBaseDir() });
		if (!isExists) {
			try {
				await mkdir(cache_path, { baseDir: dataBaseDir() });
			} catch (err) {}
		}
		// console.error(configPath);
		await openFolder(configPath);
	};

	const handleDeleteServerUrl = (url: string) => {
		const newBasePeers = [...mainStore.basePeers];
		const idx = newBasePeers.indexOf(url);
		if (idx >= 0) {
			const selectIdx = mainStore.config.serverUrl.indexOf(url);
			if (selectIdx >= 0) {
				mainStore.config.serverUrl.splice(selectIdx, 1);
			}
			newBasePeers.splice(idx, 1);
		}
		mainStore.basePeers = uniq([...newBasePeers]);
		if (mainStore.basePeers.length > 0 && mainStore.config.serverUrl.length <= 0) {
			mainStore.config.serverUrl = [mainStore.basePeers[0]];
		}
	};

	const handleServerUrlChange = () => {
		let inputProtocols: string[] = [];
		// console.log(mainStore.config.serverUrl);
		for (const p of protocols) {
			for (const url of mainStore.config.serverUrl) {
				if (url.replace(/\\/g, "/").toLowerCase().startsWith(`${p}://`)) {
					inputProtocols.push(p);
				}
			}
		}
		if (inputProtocols) {
			mainStore.config.protocol = uniq([...mainStore.config.protocol, ...inputProtocols]);
			mainStore.config.serverUrl = (mainStore.config.serverUrl || []).map(url => {
				for (const p of protocols) {
					if (url.replace(/\\/g, "/").toLowerCase().startsWith(`${p}://`)) {
						return url.slice(p.length + 3);
					}
				}
				return url;
			});
		}
		mainStore.basePeers = uniq([...mainStore.config.serverUrl, ...mainStore.basePeers]);
	};

	const sharedRuntime = useRuntimeNetwork();
	watch(sharedRuntime, async state => {
		if (!isTauri()) return;
		peers.value = state.members;
		mainStore.networkRunning = state.client_running || state.server_running;
		if (state.client_running) data.isStart = true;
		else if (!data.startLoading) {
			data.isStart = false;
			await ipReset();
			return;
		}
		const local = state.members.find(member => member.cost === "Local");
		if (state.connected && local?.ipv4) {
			const changed = !data.isSuccessGetIp || mainStore.config.ipv4 !== local.ipv4;
			mainStore.config.ipv4 = local.ipv4;
			data.isSuccessGetIp = true;
			data.startLoading = false;
			if (!startedAt.value) startedAt.value = Date.now();
			if (changed) {
				await setTrayRunState(tray, true);
				await setTrayTooltip(tray, `IP: ${local.ipv4}`);
			}
		} else if (data.isSuccessGetIp) {
			await ipReset();
		}
	});
	const listenObj: { [key: string]: any } = {
		unListenOutPut: null,
		unListenThreadId: null,
		unListenServerThreadId: null,
		unListenStartStopServer: null,
		thread_id: null,
		server_thread_id: ref(null),
		async listenOutput() {
			// const appWindow = getCurrentWindow();
			const unListen = await listen<string>("command-output", async event => {
				if (!mainStore.networkRunning) return;
				data.isStart = true;
				mainStore.networkRunning = true;
				if (event.payload) {
					data.startLoading = false;
					let devName = /tun device ready. dev: (.*)/g.exec(event.payload as string)?.[1];
					if (
						isWindows &&
						devName &&
						mainStore.config.enableNetCardMetric &&
						mainStore.config.netCardMetricValue &&
						mainStore.config.netCardMetricValue >= 1 &&
						mainStore.config.netCardMetricValue <= 9999
					) {
						try {
							const output = await Command.create(
								"netsh",
								["interface", "ipv4", "set", "interface", devName, "metric=", `${mainStore.config.netCardMetricValue}`],
								{
									encoding: "gb2312"
								}
							).execute();
						} catch (err) {
							console.error(err);
							ElMessage.error("跃点设置失败");
						}
					}
				}
			});
			this.unListenOutPut = () => {
				unListen();
			};
		},
		async listenThreadId() {
			const unListen = await listen("thread-id", event => {
				if (event.payload) {
					this.thread_id = event.payload;
				}
			});
			this.unListenThreadId = unListen;
		},
		async listenServerThreadId() {
			const unListen = await listen("server-thread-id", event => {
				if (event.payload) {
					this.server_thread_id.value = event.payload;
				}
			});
			this.unListenServerThreadId = unListen;
		},

		async listenStartStopServer() {
			this.unListenStartStopServer = await listen<{ args: string[] }>("startStopServer", async event => {
				try {
					await invoke("stop_command", { child_id: listenObj.server_thread_id.value || 0 });
					if (listenObj.server_thread_id.value) listenObj.server_thread_id.value = null;
					else await invoke("run_command", { args: event.payload.args, is_server: true });
				} catch (error) {
					ElMessage.error(String(error));
				} finally {
					await getCurrentWindow().emitTo("server", "server-action-finished", null);
				}
			});
		}
	};

	const unListenAll = async () => {
		if (!isTauri()) return;
		await invoke("stop_command", { child_id: listenObj.thread_id || 0 });
		listenObj.unListenOutPut && (await listenObj.unListenOutPut());
		listenObj.thread_id = null;
	};

	const getCoreVersion = async (isClick = false) => {
		const coreVersion = await invoke("get_core_version");
		if (!coreVersion && isClick) {
			ElMessage.error("获取失败");
		}
		data.coreVersion = (coreVersion as string).replace("easytier-core ", "");
	};

	const haveNewCoreVersion = computed<boolean>(() => {
		if (!data.coreVersion) return false;
		const releaseLatestVersion = data?.releaseList?.[0]?.[0];
		if (!releaseLatestVersion) return false;
		const version = `v${/(\d+\.\d+\.\d+)/g.exec(data.coreVersion || "")?.[1]}`;
		// console.log(version, releaseLatestVersion)
		if (releaseLatestVersion != version) {
			return true;
		}
		return false;
	});

	const checkUpdate = async () => {
		// const latestVersionFileName = data.releaseList?.[0]?.[0]?.[1] as string;
		let [downloadUrl, versionFileName] = (coreManagementData.data as string).split("<>");
		if (mainStore.githubFastUrl) {
			let fastUrl = mainStore.githubFastUrl.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
			if (!fastUrl.endsWith("/")) fastUrl += "/";
			downloadUrl = fastUrl + downloadUrl;
		}
		if (versionFileName) {
			// console.error(latestVersionFileName, /\-v(\d+\.\d+\.\d+)/g.exec(latestVersionFileName));
			const version = /\-v(\d+\.\d+\.\d+)/g.exec(versionFileName)?.[1];
			const currentVersion = /(\d+\.\d+\.\d+)/g.exec(data.coreVersion || "")?.[1];
			if (version && currentVersion != version) {
				// console.error({ currentVersion, latestVersion });
				ElMessage.success(`变更为 -> ${version}`);
				return [true, downloadUrl, versionFileName];
			} else if (currentVersion === version) {
				ElMessage.success(`当前版本无需安装`);
				return [false, null, null];
			} else {
				ElMessage.error(`获取版本失败`);
				return [false, null, null];
			}
		} else {
			ElMessage.error(`获取版本失败`);
		}
		return [false, null, null];
	};

	const handleCoreManagement = async () => {
		coreManagementData.visible = true;
		// await getReleaseList();
	};

	const handleShowPublicServersDialog = async () => {
		await etWindows(
			"nodesList",
			{
				title: "公共服务器节点",
				width: 1000,
				height: 600,
				minWidth: 800,
				minHeight: 500,
				resizable: true,
				url: "#/nodesList"
			},
			(_, appWindow) => {
				data.nodesListVisible = true;
			},
			() => {
				data.nodesListVisible = false;
			}
		);
	};

	let unlistenDownload: UnlistenFn | null = null;
	let unlistenDownloadError: UnlistenFn | null = null;
	let progress = ref<number>(0);
	let size = 0;
	const handleInstallCore = async () => {
		try {
			if (!coreManagementData.data) {
				return ElMessage.error("请选择一个内核");
			}
			progress.value = 0;
			size = 0;
			data.update = true;
			await getCoreVersion();
			const [isNeedUpdate, downloadUrl, latestVersionFileName] = await checkUpdate();

			if (isNeedUpdate) {
				await reset();
				// console.error(downloadUrl);
				if (unlistenDownload) {
					await unlistenDownload();
				}
				if (unlistenDownloadError) {
					await unlistenDownloadError();
				}
				unlistenDownload = await listen<[number, number]>("download_core_progress", ({ payload }) => {
					size += payload[0];
					progress.value = Math.round((size / payload[1]) * 100);
				});
				unlistenDownloadError = await listen("download_core_progress_error", () => {
					data.update = false;
					progress.value = 0;
					size = 0;
					ElMessage.error("发生错误，请重试");
				});
				await invoke("download_easytier_zip", { download_url: downloadUrl, file_name: latestVersionFileName });
			}
			await getCoreVersion();
		} catch (err) {
			console.error(err);
		} finally {
			data.update = false;
		}
	};

	const getReleaseList = async () => {
		coreManagementData.loading = true;
		const list = await invoke<string[][][]>("fetch_easytier_list");
		data.releaseList = [
			...list.flat().filter(el => {
				// console.log(el, el[0], el[2], el[3]); // el[3] 是prerelease bool值
				return el && el[0] && el[2] && !el[2].includes("gui") && (el[3] != "true" || !el[3]);
			})
		] as any;
		coreManagementData.loading = false;
		// console.log(data.releaseList);
	};

	const handleAutoStartByTask = async () => {
		if (import.meta.env.DEV) return ElMessage.warning("开发环境不支持开机自启");
		await invoke("spawn_autostart", { enabled: !mainStore.config.autoStart });
		const is_enable_by_task = (await invoke("autostart_is_enabled")) as boolean;
		mainStore.config.autoStart = is_enable_by_task;
	};

	const compatibleInitAutoStart = async () => {
		if (!isWindows) {
			mainStore.config.autoStart = false;
			return;
		}
		try {
			let is_enable_by_task = (await invoke("autostart_is_enabled")) as boolean;
			if (is_enable_by_task) {
				// 每次打开Exe重新加载一次开机自启，因为可能路径变了
				if (import.meta.env.DEV) return ElMessage.warning("开发环境不支持开机自启");
				await invoke("spawn_autostart", { enabled: false });
				await invoke("spawn_autostart", { enabled: true });
			}
			is_enable_by_task = (await invoke("autostart_is_enabled")) as boolean;
			mainStore.config.autoStart = is_enable_by_task;
		} catch (err) {
			console.error(err);
			await invoke("spawn_autostart", { enabled: false });
			const is_enable_by_task = (await invoke("autostart_is_enabled")) as boolean;
			mainStore.config.autoStart = is_enable_by_task;
		}
	};

	// const compatibleIpv6Listener = async () => {
	// 	// ipv6监听在后续版本合并到customListenner里了，这里做兼容处理，去掉IPV6监听
	// 	const customListenerV4 = mainStore.config.customListenerData
	// 				.trim()
	// 				.split("\n")
	// 				.map(el => el.trim())
	// 				.filter(el => el);
	// 	const udpv6 = customListenerV4.indexOf("udp://[::]:11010")
	// 	const tcpv6 = customListenerV4.indexOf("tcp://[::]:11010")
	// 	if (udpv6 != -1) {
	// 		customListenerV4.splice(udpv6, 1);
	// 	}
	// 	if (tcpv6 != -1) {
	// 		customListenerV4.splice(tcpv6, 1);
	// 	}
	// 	mainStore.config.customListenerData = customListenerV4.join("\n");
	// };

	const initConnectAfterStart = async () => {
		if (mainStore.config.connectAfterStart && data.coreVersion) {
			await reset();
			await handleConnection();
		}
	};

	// 多选serverUrl兼容
	const compatibleInitServerUrl = async () => {
		if (typeof mainStore.config.serverUrl == "string") {
			mainStore.config.serverUrl = [mainStore.config.serverUrl || ""];
		}
	};

	const initGuiJson = async () => {
		const path = import.meta.env.VITE_CONFIG_FILE_NAME;
		const isExists = await exists(path, { baseDir: dataBaseDir() });
		if (isExists) {
			const guiJsonStrUint8 = await readFile(path, { baseDir: dataBaseDir() });
			if (guiJsonStrUint8) {
				try {
					const decoder = new TextDecoder("utf-8");
					const guiJsonStr = decoder.decode(guiJsonStrUint8);
					// console.log(guiJsonStr);
					// const regex = /^(\s*\/\/.*)/gm;
					// const regex2 = /(,?)\s*\/\/.*(?=\n|$|\r\n)/gm;
					// const resultStr = guiJsonStr.replace(regex, "").replace(regex2, "$1");
					// console.log(resultStr);
					const guiJson = JSON.parse(guiJsonStr);
					let saveServerUrl = [];
					if (guiJson.serverUrl) {
						if (Array.isArray(guiJson.serverUrl)) {
							mainStore.basePeers = uniq([...guiJson.serverUrl, ...mainStore.basePeers]);
							saveServerUrl = uniq([...guiJson.serverUrl]);
						}
						if (typeof guiJson.serverUrl === "string") {
							mainStore.basePeers = uniq([...guiJson.serverUrl.split(","), ...mainStore.basePeers]);
							saveServerUrl = [mainStore.basePeers[0] || ""];
							guiJson.serverUrl = guiJson.serverUrl ? guiJson.serverUrl.split(",") : [];
						}
					} else {
						saveServerUrl = [mainStore.basePeers.length > 0 ? mainStore.basePeers[0] || "" : ""];
					}
					data.configJsonSeverUrl = [...guiJson.serverUrl] as any;
					if (guiJson.enableKcpProxy && guiJson.enableQuicProxy) {
						// 如果同时开启kcp代理和quic代理，则禁用quic代理
						guiJson.enableQuicProxy = false;
					}
					mainStore.$patch({
						config: {
							...mainStore.config,
							...guiJson,
							customListenerData: guiJson?.customListenerData.join("\n") || "",
							serverUrl: saveServerUrl
						}
					});
					if (mainStore.createConfigInEasytier) {
						await updateConfigJson(data.configJsonSeverUrl);
					}
				} catch (err) {
					console.error(err);
					ElMessage.error(`config.json格式或编码错误`);
				} finally {
					// mainStore.$patch({
					// 	createConfigInEasytier: true // 发现本地存在config.json 默认启用该功能
					// });
				}
			}
		}
	};

	const initAutoStartServer = async () => {
		if (mainStore.serverConfig.autoStart && data.coreVersion) {
			const args = getServerArgs();

			await invoke("stop_command", { child_id: listenObj.server_thread_id.value || 0 });

			await invoke("run_command", {
				args,
				is_server: true
			});
		}
	};

	const initPreventSleep = async () => {
		if (mainStore.config.enablePreventSleep) {
			preventSleep();
		}
	};

	const mountedShow = async () => {
		const args = await getMatches();
		if (!args.args?.["task-auto-start"]?.value) {
			const appWindow = getCurrentWindow();
			await appWindow.show();
			await appWindow.setFocus();
		}
		const appWindow = getCurrentWindow();
		const logicalAppSize = {
			width: 400,
			height: 720
		};
		const scaleFactor = await appWindow.scaleFactor();
		const size = new PhysicalSize(Math.ceil(logicalAppSize.width * scaleFactor), Math.ceil(logicalAppSize.height * scaleFactor));
		appWindow.setSize(size);
		appWindow.onScaleChanged(({ payload: { scaleFactor } }) => {
			console.log("scaleFactor", scaleFactor);
			appWindow.setSize(new PhysicalSize(Math.ceil(logicalAppSize.width * scaleFactor), Math.ceil(logicalAppSize.height * scaleFactor)));
		});
	};

	let lobbyHeartbeat: ReturnType<typeof setInterval> | undefined;
	const heartbeatPublication = async () => {
		if (!mainStore.lobby.roomId) return;
		const snapshot = await networkSnapshot();
		if (!snapshot.connected) return;
		if (mainStore.configStartEnable || mainStore.lobby.connectionSnapshot !== publicationSnapshot(mainStore.config)) {
			mainStore.lobby.roomId = "";
			return;
		}
		try {
			await heartbeatRoom(mainStore.lobby.roomId, Math.max(1, snapshot.members.filter(p => p.ipv4 && p.ipv4 !== "-").length));
		} catch (error) {
			if (/房间已下架|房间不存在|心跳超时/.test(String(error))) mainStore.lobby.roomId = "";
			console.warn("房间心跳失败，将在下一轮重试", error);
		}
	};
	const saveJoinedRoom = async (title: string) => {
		const path = import.meta.env.VITE_CONFIG_ADMIN_PATH;
		await mkdir(path, { baseDir: dataBaseDir(), recursive: true });
		const { coordinator: _identity, lobby: _lobby, networkRunning: _runtime, ...roomConfig } = mainStore.$state;
		const safe = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 60) || "大厅房间";
		await writeTextFile(`${path}${safe}-${Date.now()}.json`, btoa(encodeURIComponent(JSON.stringify(roomConfig))), { baseDir: dataBaseDir() });
	};

	onMounted(async () => {
		if (!isTauri()) return;
		clockTimer = setInterval(() => {
			elapsed.value = startedAt.value ? Math.floor((Date.now() - startedAt.value) / 1000) : 0;
		}, 1000);
		await compatibleInitServerUrl();
		await initGuiJson();
		await compatibleInitAutoStart();
		// await initAutoStart();
		// await initStartWinIpBroadcast();  // 对于三层tun而言，winipbroadcast没有作用，先禁用
		await getCoreVersion();
		await listenObj.listenThreadId();
		listenObj.unListenExit = await listen<{ pid: number; error: string }>("command-exit", async event => {
			if (event.payload.pid !== listenObj.thread_id) return;
			data.startLoading = false;
			data.isStart = false;
			mainStore.networkRunning = false;
			listenObj.thread_id = null;
			await ipReset();
			if (event.payload.error) {
				failure.value = event.payload.error;
				ElMessage.error(event.payload.error);
			}
			await stopPublishedRoom();
		});
		await listenObj.listenServerThreadId();
		listenObj.unListenServerExit = await listen<{ pid: number; error: string }>("server-command-exit", event => {
			if (event.payload.pid === listenObj.server_thread_id.value) listenObj.server_thread_id.value = null;
		});
		await listenObj.listenStartStopServer();
		lobbyHeartbeat = setInterval(heartbeatPublication, 30000);
		listenObj.unListenLobbyJoin = await listen<{ requestId: string; replyTo: string; roomId: string; password: string; saveConfig: boolean }>(
			"lobby-join",
			async ({ payload }) => {
				if (payload.replyTo !== "lobby") return;
				let error = "";
				try {
					if (data.startLoading) throw new Error("当前正在启动，请稍后重试");
					const connection = await roomConnection(payload.roomId);
					const patch = roomJoinPatch(mainStore.config, connection, typeof payload.password === "string" ? payload.password : "");
					if (data.isStart) await reset();
					mainStore.$patch({ config: patch, configStartEnable: false });
					mainStore.$persist();
					if (payload.saveConfig) await saveJoinedRoom(connection.network_name);
					await handleConnection();
					if (!data.isStart) throw new Error(failure.value || "未能启动联机，请检查主窗口提示");
				} catch (e) {
					error = String(e instanceof Error ? e.message : e);
				}
				await getCurrentWindow().emitTo("lobby", "lobby-join-result", { requestId: payload.requestId, error });
			}
		);
		await initConfigDir();
		await initAutoStartServer();
		await initConnectAfterStart();
		initPreventSleep();
		mountedShow(); // 不需要await
		closePrevent();
		if (import.meta.env.PROD) {
			getReleaseList();
			checkNewVersion();
		}
	});

	// storageEventEmitter.addEventListener("localStorageChange", () => {
	// 	if(mainStore.createConfigInEasytier) {
	// 		updateConfigJsonBounce(data.configJsonSeverUrl)
	// 	}
	// })

	dataSubscribe(null, () => {
		return data.configJsonSeverUrl;
	});

	onBeforeUnmount(() => {
		clearInterval(clockTimer);
		clearInterval(lobbyHeartbeat);
		listenObj.unListenLobbyJoin?.();
		if (!isTauri()) return;
		unListenAll();
		listenObj.unListenReleaseList && listenObj.unListenReleaseList();
		listenObj.unListenStartStopServer && listenObj.unListenStartStopServer();
		listenObj.unListenExit?.();
		listenObj.unListenServerExit?.();
		stopPreventSleep();
		// unListenStorage && unListenStorage();
	});

	const getArgs = async () => {
		// console.error(config.proxyNetworks);
		const args = [];
		let fixedAddress: string | null;
		try {
			fixedAddress = await registeredAddress();
		} catch (error) {
			ElMessage.error(String(error));
			return [];
		}
		if (mainStore.configStartEnable) {
			if (mainStore.configPath) {
				const isExists = await exists(mainStore.configPath, { baseDir: dataBaseDir() });
				if (isExists) {
					const resourceDir = await getResourceDir();
					const configPath = await join(resourceDir, mainStore.configPath);
					args.push("-c", configPath);
					return args;
				} else {
					const appWindow = getCurrentWindow();
					const isVisible = await appWindow.isVisible();
					if (!isVisible) {
						await appWindow.show();
						await appWindow.setFocus();
					}
					mainStore.configPath = "";
					ElMessage.error(`配置文件不存在 请重新选择`);
					await handleStartCommand("toml"); // 配置文件不存在，显示配置文件弹窗
					return [];
				}
			} else {
				ElMessage.warning(`配置文件不存在 请选择`);
				await handleStartCommand("toml"); // 配置文件不存在，显示配置文件弹窗
				return [];
			}
		}
		if (mainStore.config.serverUrl?.length <= 0) {
			ElMessage.warning(`请至少选择一个服务器`);
			return [];
		}
		// 		lodash-es 如何将两个数组的值混合  比如["tcp","udp"] [1,2]
		// 混合后["tcp1","tcp2","udp1","udp2"]
		if (mainStore.config.protocol?.length <= 0) {
			ElMessage.warning(`请至少选择一个协议`);
			return [];
		}
		if (!fixedAddress && mainStore.config.dhcp) {
			args.push("-d");
		}
		if (mainStore.config.hostname) {
			args.push("--hostname", mainStore.config.hostname);
		}
		if (mainStore.config.networkName) {
			args.push("--network-name", mainStore.config.networkName);
		}
		if (mainStore.config.networkPassword) {
			args.push("--network-secret", mainStore.config.networkPassword);
		}
		if (fixedAddress || (!mainStore.config.dhcp && mainStore.config.ipv4)) {
			args.push("--ipv4", fixedAddress || mainStore.config.ipv4.trim());
		}
		if (mainStore.config.serverUrl) {
			args.push("--peers", ...exactPeerUrls(mainStore.config));
		}
		if (mainStore.config.enableCustomProtocol) {
			const includes = mainStore.config.protocol.includes(mainStore.config.customProtocol);
			if (includes) {
				args.push("--default-protocol", mainStore.config.customProtocol);
			}
		}
		if (mainStore.config.disbleP2p) {
			args.push("--disable-p2p");
		}
		if (mainStore.config.disableIpv6) {
			args.push("--disable-ipv6", "true");
		}
		if (mainStore.config.disbleListenner) {
			args.push("--no-listener");
		}
		if (!mainStore.config.disbleListenner && mainStore.config.enableCustomListener && mainStore.config.customListenerData) {
			const customListener = mainStore.config.customListenerData
				.trim()
				.split("\n")
				.map(el => el.trim())
				.filter(el => el);
			if (customListener.length > 0) {
				args.push("-l", ...customListener);
			}
		}

		if (!mainStore.config.disbleListenner && !mainStore.config.enableCustomListener && mainStore.config.port) {
			args.push("-l", mainStore.config.port);
		}
		if (mainStore.cidrEnable && mainStore.config.proxyNetworks) {
			let formatProxyNetworks = mainStore.config.proxyNetworks.trim().split("\n");
			const newformatProxyNetworks = formatProxyNetworks
				.map(el => el.trim())
				.filter(cidr => {
					return /^\d+\.\d+\.\d+\.\d+\/\d+$/g.test(cidr);
				});
			if (newformatProxyNetworks.length > 0) {
				for (const cidr of newformatProxyNetworks) {
					args.push("-n", cidr);
				}
			}
			mainStore.config.proxyNetworks = formatProxyNetworks.join("\n");
		}
		if (mainStore.config.disableEncryption) {
			args.push("--disable-encryption", "true");
		}
		if (mainStore.config.multiThread) {
			args.push("--multi-thread", "true");
		}
		if (mainStore.config.enablExitNode) {
			args.push("--enable-exit-node", "true");
		}
		if (mainStore.config.noTun) {
			args.push("--no-tun", "true");
		}
		if (mainStore.config.latencyfirst) {
			args.push("--latency-first", "true");
		}
		if (mainStore.config.useSmoltcp) {
			args.push("--use-smoltcp", "true");
		}
		if (mainStore.config.disableUdpHolePunching) {
			args.push("--disable-udp-hole-punching", "true");
		}
		if (mainStore.config.relayAllPeerrpc) {
			args.push("--relay-all-peer-rpc", "true");
		}
		if (mainStore.config.saveErrorLog) {
			args.push(
				"--file-log-level",
				mainStore.config.logLevel,
				"--file-log-dir",
				await join(await getResourceDir(), import.meta.env.VITE_LOG_PATH)
			);
		}
		if (isWindows && mainStore.config.devName && mainStore.config.devNameValue) {
			args.push("--dev-name", mainStore.config.devNameValue);
		}
		if (mainStore.config.compression && mainStore.config.compression != "none") {
			args.push("--compression", mainStore.config.compression);
		}
		if (mainStore.config.enableKcpProxy) {
			args.push("--enable-kcp-proxy", "true");
		}
		if (mainStore.config.disableKcpInput) {
			args.push("--disable-kcp-input", "true");
		}
		if (mainStore.config.enableQuicProxy) {
			args.push("--enable-quic-proxy", "true");
		}
		if (mainStore.config.disableQuicInput) {
			args.push("--disable-quic-input", "true");
		}
		if (isWindows && mainStore.config.enableUdpBroadcastRelay) {
			args.push("--enable-udp-broadcast-relay", "true");
		}
		if (!mainStore.config.enableUpnp) {
			args.push("--disable-upnp", "true");
		}
		if (mainStore.config.ipv6PublicAddrProvider) {
			args.push("--ipv6-public-addr-provider", "true");
		}
		if (mainStore.config.ipv6PublicAddrAuto) {
			args.push("--ipv6-public-addr-auto", "true");
		}
		if (mainStore.config.disableRelayData) {
			args.push("--disable-relay-data", "true");
		}
		if (isWindows && mainStore.config.bindDeviceEnable) {
			args.push("--bind-device", "true");
		}
		if (mainStore.proxyForwardBySystem) {
			args.push("--proxy-forward-by-system", "true");
		}
		if (mainStore.config.acceptDNS) {
			args.push("--accept-dns", "true");
		}
		if (mainStore.config.enablePortForward) {
			let formatPortForward = mainStore.config.portForwardData.trim().split("\n");
			const newformatPortForward = formatPortForward.map(el => el.trim()).filter(el => el);
			if (newformatPortForward.length > 0) {
				newformatPortForward.map(el => {
					args.push("--port-forward", el);
				});
			}
		}
		if (mainStore.config.privateMode) {
			args.push("--private-mode", "true");
		}
		if (mainStore.config.ipv6 && !mainStore.config.disableIpv6) {
			args.push("--ipv6", mainStore.config.ipv6.trim());
		}
		const tcpWhitelist = mainStore.config.tcpWhitelist.trim();
		if (mainStore.config.tcpWhitelistEnable && tcpWhitelist) {
			args.push("--tcp-whitelist", tcpWhitelist);
		}
		const udpWhitelist = mainStore.config.udpWhitelist.trim();
		if (mainStore.config.udpWhitelistEnable && udpWhitelist) {
			args.push("--udp-whitelist", udpWhitelist);
		}
		return args;
	};

	const ipReset = async () => {
		data.isSuccessGetIp = false;
		peers.value = [];
		startedAt.value = 0;
		elapsed.value = 0;
		if (mainStore.config.dhcp) {
			mainStore.config.ipv4 = "";
		}
		await setTrayRunState(tray, false);
		await setTrayTooltip(tray);
	};

	const reset = async () => {
		await unListenAll();
		await stopPublishedRoom();
		data.startLoading = false;
		data.isStart = false;
		mainStore.networkRunning = false;
		const memberDialog = await getAllWebviewWindows();
		const memberDialogs = memberDialog.filter(item => item.label === "member");
		if (memberDialogs && memberDialogs.length > 0) {
			data.memberVisible = false;
			for (const memberDialog of memberDialogs) {
				const isVisible = await memberDialog.isVisible();
				if (isVisible) {
					await memberDialog.destroy();
				}
			}
		}
		await ipReset();
	};

	const stopPublishedRoom = async () => {
		const id = mainStore.lobby.roomId;
		if (!id || !mainStore.lobby.autoRemove) return;
		mainStore.lobby.roomId = "";
		try {
			await removeRoom(id);
		} catch (error) {
			console.warn("房间下架请求失败，将在心跳超时后下架", error);
		}
	};
	const handleConnection = async () => {
		if (!isTauri()) {
			ElMessage.info("请在桌面客户端启动联机，浏览器中可预览界面");
			return;
		}
		if (data.startLoading) return;
		if (data.isStart) {
			try {
				await reset();
			} catch (error) {
				ElMessage.error(String(error));
			}
		} else {
			data.startLoading = true;
			failure.value = "";
			try {
				await setTrayTooltip(tray, "请求联机中...");
				const args = await getArgs();
				if (!args || args.length <= 0) {
					await reset();
					return;
				}
				if (args[0] === "-c") {
					ElMessage.warning({
						message: "使用配置文件中.",
						duration: 5000
					});
				}
				data.startLoading = true;
				await unListenAll();
				await listenObj.listenOutput();
				mainStore.networkRunning = true;
				await invoke("run_command", { args });
				data.isStart = true;
				data.startLoading = false;
			} catch (error) {
				data.startLoading = false;
				await reset();
				failure.value = String(error);
				ElMessage.error(String(error));
			}
		}
	};

	//configStart
	const handleStartCommand = async (command: string | number | object) => {
		if (command === "toml") {
			configStart.visible = true;
			const path = import.meta.env.VITE_CONFIG_PATH;
			const isExists = await exists(path, { baseDir: dataBaseDir() });
			if (!isExists) {
				mainStore.configStartEnable = false;
				mainStore.configPath = "";
				try {
					await mkdir(path, { baseDir: dataBaseDir(), recursive: true });
				} catch (err) {
					console.error(err);
					return;
				}
			}
			const entries = await readDir(path, { baseDir: dataBaseDir() });
			configStart.list = entries
				.filter(item => {
					const nameLower = item.name.toLowerCase();
					return item.isFile && (nameLower.endsWith(".toml") || nameLower.endsWith(".yaml"));
				})
				.map(item => ({
					name: item.name,
					path: `${path}${item.name}`
				})) as any;
		}
		if (command === "share_config") {
			try {
				const {
					protocol,
					peerUrls,
					serverUrl,
					networkName,
					networkPassword,
					dhcp,
					disableIpv6,
					disbleP2p,
					enableCustomProtocol,
					customProtocol,
					disbleListenner,
					port,
					enableCustomListener,
					customListenerData,
					devName,
					devNameValue,
					enableNetCardMetric,
					netCardMetricValue,
					disableEncryption,
					multiThread,
					latencyfirst,
					disableUdpHolePunching,
					relayAllPeerrpc,
					compression,
					enablePreventSleep,
					enableKcpProxy,
					disableKcpInput,
					enableQuicProxy,
					disableQuicInput,
					privateMode
				} = mainStore.config;
				const WT = btoa(
					encodeURIComponent(
						JSON.stringify({
							config: {
								protocol,
								peerUrls,
								serverUrl,
								networkName,
								networkPassword,
								dhcp,
								disableIpv6,
								disbleP2p,
								enableCustomProtocol,
								customProtocol,
								disbleListenner,
								port,
								enableCustomListener,
								customListenerData,
								devName,
								devNameValue,
								enableNetCardMetric,
								netCardMetricValue,
								disableEncryption,
								multiThread,
								latencyfirst,
								disableUdpHolePunching,
								relayAllPeerrpc,
								compression,
								enablePreventSleep,
								enableKcpProxy,
								disableKcpInput,
								enableQuicProxy,
								disableQuicInput,
								privateMode
							}
						})
					)
				);
				await writeText(WT);
				await ElConfirmPrimary(
					`{action} 虚拟网IP，主机名，子网代理，为子网代理启用smoltcp堆栈，开机自启，软件启动自动联机，出口节点，不生成Tun网卡，错误日志相关配置`,
					"提示",
					{
						confirmButtonText: "知道了",
						showCancelButton: false,
						action: "不会分享"
					}
				);
				ElMessage.success("配置已复制");
			} catch (err) {
				console.error(err);
				ElMessage.error("分享失败");
			}
		}
		if (command === "import_config") {
			importConfigData.data = "";
			importConfigData.visible = true;
		}
		if (command === "create_server") {
			await handleShowServerDialog();
		}
		if (command === "cidr") {
			await handleShowCidrDialog();
		}
		if (command === "config_admin") {
			configAdminData.visible = true;
			const path = import.meta.env.VITE_CONFIG_ADMIN_PATH;
			const isExists = await exists(path, { baseDir: dataBaseDir() });
			if (!isExists) {
				try {
					await mkdir(path, { baseDir: dataBaseDir(), recursive: true });
				} catch (err) {
					console.error(err);
					return;
				}
			}
			const entries = await readDir(path, { baseDir: dataBaseDir() });
			configAdminData.list = entries
				.filter(item => item.isFile)
				.map(item => ({
					name: item.name,
					path: `${path}${item.name}`
				})) as any;
		}
		if (command === "save_config_admin") {
			const { coordinator: _identity, lobby: _lobby, networkRunning: _runtime, ...roomConfig } = mainStore.$state;
			const config = btoa(encodeURIComponent(JSON.stringify(roomConfig)));
			const [error, { value = "" } = {}] = await ATJ(
				ElMessageBox.prompt("请输入配置的存储名", "提示", {
					confirmButtonText: "保存",
					cancelButtonText: "取消",
					inputPlaceholder: "请输入2个字以上的存储名",
					closeOnPressEscape: false,
					closeOnClickModal: false,
					inputValidator: (value: string) => {
						const result = isValidWindowsFileName(value);
						if (result) {
							return true;
						}
						return "文件名不合法";
					}
				})
			);
			if (!error) {
				const dir = import.meta.env.VITE_CONFIG_ADMIN_PATH;
				const filePath = `${dir}${value}`;
				const isExistsDir = await exists(dir, { baseDir: dataBaseDir() });
				if (!isExistsDir) {
					try {
						await mkdir(dir, { baseDir: dataBaseDir(), recursive: true });
					} catch (err) {
						console.error(err);
						return;
					}
				}
				const isExists = await exists(filePath, { baseDir: dataBaseDir() });
				let allowWrite = true;
				if (isExists) {
					const [err] = await ElConfirmPrimary("配置名已存在，是否覆盖?", "提示", {
						confirmButtonText: "确定",
						cancelButtonText: "取消"
					});
					if (err) {
						allowWrite = false;
					}
				}
				if (allowWrite) {
					let encoder = new TextEncoder();
					let data = encoder.encode(config);
					// console.log(filePath, data);
					await writeFile(filePath, data, { baseDir: dataBaseDir() });
					ElMessage.success("保存成功");
				}
			}
		}

		if (command === "game_start_config") {
			await etWindows(
				"gameList",
				{
					title: "本地游戏列表",
					width: 600,
					height: 720,
					minWidth: 800,
					minHeight: 400,
					resizable: true,
					url: "#/gameList"
				},
				(_, appWindow) => {
					data.gameListVisible = true;
				},
				() => {
					data.gameListVisible = false;
				}
			);
		}

		if (command === "reconnect") {
			handleReconnect();
		}
	};

	const handleReconnect = async () => {
		if (data.isStart) {
			ElMessage.info({
				message: "正在重新联机...",
				duration: 2200
			});
			await handleConnection();
			setTimeout(() => {
				handleConnection();
			}, 2000);
		} else {
			handleConnection();
		}
	};

	const handleDeleteAdminConfig = async () => {
		const path = configAdminData.fileName;
		if (!path) return ElMessage.warning("请选择配置");
		const [err] = await ElConfirmDanger("确定{action}选中的配置吗?", "提示", {
			confirmButtonText: "确定",
			cancelButtonText: "取消",
			action: "删除"
		});
		if (err) return;
		try {
			await removeFile(path, { baseDir: dataBaseDir() });
			ElMessage.success("删除成功");
			configAdminData.fileName = "";
			await handleStartCommand("config_admin");
		} catch (err) {
			ElMessage.error("删除配置失败");
			console.log(err);
		}
	};

	const handleExchangeAdminConfig = async () => {
		const path = configAdminData.fileName;
		if (!path) return ElMessage.warning("请选择配置");
		// import.meta.env.VITE_CONFIG_ADMIN_PATH
		const [err] = await ElConfirmPrimary("会覆盖当前配置,确定切换吗?");
		if (err) return;
		const base64U8Arrray = await readFile(path, { baseDir: dataBaseDir() });
		const decoder = new TextDecoder("utf-8");
		try {
			if (data.isStart) {
				ElMessage.warning("停止联机..");
				await reset();
			}
			const json: typeof mainStore.$state = JSON.parse(decodeURIComponent(atob(decoder.decode(base64U8Arrray))));
			const { coordinator: _identity, lobby: _lobby, networkRunning: _runtime, ...roomConfig } = json;
			mainStore.$patch(roomConfig);
			ElMessage.success("切换成功");
			configAdminData.visible = false;
		} catch (err) {
			ElMessage.error("读取配置失败");
			console.log(err);
		}
	};

	const handleStartImport = async () => {
		const [err] = await ElConfirmPrimary("确定导入?", "提示", {
			confirmButtonText: "确定",
			cancelButtonText: "取消"
		});
		if (!err) {
			const payload = JSON.parse(decodeURIComponent(atob(importConfigData.data)));
			payload.config.serverUrl = Array.isArray(payload?.config?.serverUrl)
				? payload?.config?.serverUrl
				: typeof payload?.config?.serverUrl == "string"
					? payload.config.serverUrl
							.split(",")
							.map((url: string) => url.trim())
							.filter(Boolean)
					: typeof mainStore.config.serverUrl == "string"
						? [mainStore.config.serverUrl]
						: [];
			mainStore.$patch({
				config: {
					...mainStore.config,
					...payload.config
				}
			});
			ElMessage.success("导入成功");
			importConfigData.visible = false;
			mainStore.basePeers = uniq([...(mainStore.config.serverUrl || []), ...mainStore.basePeers].filter(el => el.trim()));
		} else {
			console.error(err);
			if (err !== "cancel") {
				ElMessage.error("导入失败");
			}
		}
	};

	const initConfigDir = async () => {
		const path = import.meta.env.VITE_CONFIG_PATH;
		const isExists = await exists(path, { baseDir: dataBaseDir() });
		if (!isExists) {
			mainStore.configStartEnable = false;
			mainStore.configPath = "";
			try {
				await mkdir(path, { baseDir: dataBaseDir() });
			} catch (err) {
				console.error(err);
			}
		}
	};

	const openConfigDir = async () => {
		const resourceDir = await getResourceDir();
		const configPath = await join(resourceDir, import.meta.env.VITE_CONFIG_PATH);
		// console.error(configPath);
		await openFolder(configPath);
	};
	const openConfigAdminDir = async () => {
		const resourceDir = await getResourceDir();
		const configPath = await join(resourceDir, import.meta.env.VITE_CONFIG_ADMIN_PATH);
		// console.error(configPath);
		await openFolder(configPath);
	};

	const handleShowMemberDialog = async () => {
		// if (!mainStore.config.ipv4) {
		// 	return ElMessage.warning("请等待获取IP");
		// }

		await etWindows(
			"member",
			{
				title: "成员列表",
				width: 600,
				height: 720,
				url: "#/member"
			},
			() => {
				data.memberVisible = true;
			},
			() => {
				data.memberVisible = false;
			}
		);
	};

	const handleShowLogDialog = async () => {
		await etWindows(
			"log",
			{ title: "联机日志", width: 600, height: 720, minWidth: 520, minHeight: 480, resizable: true, url: "#/log" },
			() => {
				data.logVisible = true;
			},
			() => {
				data.logVisible = false;
			}
		);
	};
	const handleShowCidrDialog = async () => {
		await etWindows(
			"cidr",
			{ title: "子网代理", width: 600, height: 720, minWidth: 520, minHeight: 480, resizable: true, url: "#/cidr" },
			() => {
				data.cidrVisible = true;
			},
			() => {
				data.cidrVisible = false;
			}
		);
	};
	const handleShowAdvanceDialog = async () => {
		await etWindows(
			"advance",
			{
				title: "高级选项",
				width: 600,
				height: 720,
				resizable: true,
				url: "#/advance"
			},
			(_, appWindow) => {
				data.advanceVisible = true;
			},
			() => {
				data.advanceVisible = false;
			}
		);
	};

	const handleShowToolDialog = async () => {
		await etWindows(
			"tool",
			{
				title: "增强工具",
				width: 600,
				height: 720,
				resizable: true,
				url: "#/tool"
			},
			(_, appWindow) => {
				data.toolVisible = true;
			},
			() => {
				data.toolVisible = false;
			}
		);
	};

	const handleShowServerDialog = async () => {
		await etWindows(
			"server",
			{ title: "自建服务器", width: 600, height: 720, minWidth: 520, minHeight: 480, resizable: true, url: "#/server" },
			() => {
				data.serverVisible = true;
			},
			() => {
				data.serverVisible = false;
			}
		);
	};
</script>

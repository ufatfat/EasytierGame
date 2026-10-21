<template>
	<section class="panel-window">
		<PanelHeader
			icon="wrench"
			title="联机工具"
			subtitle="按顺序排查，解决找不到房间和连接问题"
		/>
		<div
			v-if="!isWindows"
			class="empty-state"
		>
			<AppIcon
				name="monitor"
				:size="32"
			/>
			<h2>Windows 专属工具</h2>
			<p>macOS 可直接在主窗口启动联机</p>
		</div>
		<div
			v-else
			class="panel-scroll tools-content"
		>
			<div class="inline-notice">
				<AppIcon
					name="info"
					:size="14"
				/>
				找不到游戏房间？建议按下面的顺序逐步排查
			</div>
			<article class="tool-card surface-card">
				<div class="tool-heading">
					<span class="step">1</span>
					<div>
						<h2>局域网广播</h2>
						<p>让游戏发现虚拟局域网中的其他玩家</p>
					</div>
					<span class="ui-tag success">推荐</span>
				</div>
				<div class="tool-setting">
					<span>
						Windows UDP 广播中继
						<small>使用 EasyTier 内核广播能力，下次联机时生效</small>
					</span>
					<UiSwitch
						v-model="mainStore.config.enableUdpBroadcastRelay"
						label="Windows UDP 广播中继"
					/>
				</div>
			</article>
			<article class="tool-card surface-card">
				<div class="tool-heading">
					<span class="step">2</span>
					<div>
						<h2>网卡优先级</h2>
						<p>降低联机网卡跃点，优先使用虚拟网络</p>
					</div>
					<button
						class="ui-button"
						@click="initNetCardInfo"
					>
						<AppIcon
							name="refresh"
							:size="13"
						/>
						查询
					</button>
				</div>
				<ElTable
					v-if="data.netcardList.length"
					:data="data.netcardList"
					highlight-current-row
					@row-click="handleRowClick"
					max-height="180"
				>
					<ElTableColumn
						prop="name"
						label="网卡名称"
					/>
					<ElTableColumn
						prop="metric"
						label="跃点"
						width="64"
					/>
				</ElTable>
				<div
					v-if="data.row.name"
					class="tool-controls"
				>
					<span>{{ data.row.name }}</span>
					<input
						v-model="data.row.metric"
						type="number"
						min="1"
						max="9999"
						class="ui-input mono"
					/>
					<button
						class="ui-button primary"
						@click="handleSaveMetric"
					>
						保存
					</button>
				</div>
				<p
					v-else
					class="tool-note"
				>
					查询网卡后选择 EasyTier 虚拟网卡，将跃点设置为 1
				</p>
			</article>
			<article class="tool-card surface-card">
				<div class="tool-heading">
					<span class="step">3</span>
					<div>
						<h2>防火墙检查</h2>
						<p>确认 Windows 防火墙没有拦截游戏和联机程序</p>
					</div>
					<button
						class="icon-button"
						aria-label="刷新防火墙状态"
						@click="initFirewall"
					>
						<AppIcon
							name="refresh"
							:size="14"
						/>
					</button>
				</div>
				<div class="firewall-states">
					<span
						v-for="item in [
							['domain', '域网络'],
							['public', '公用网络'],
							['dedicated', '专用网络']
						]"
						:key="item[0]"
					>
						{{ item[1] }}
						<b
							class="ui-tag"
							:class="data.firewallStatus[item[0]] ? 'success' : ''"
						>
							{{ data.firewallStatus[item[0]] ? "已开启" : "已关闭" }}
						</b>
					</span>
				</div>
				<div class="inline-notice warning">
					<AppIcon
						name="warning"
						:size="14"
					/>
					建议先允许游戏通过防火墙。临时关闭后请及时恢复。
				</div>
				<button
					class="ui-button danger"
					@click="handleCloseAllFireWall"
				>
					临时关闭防火墙
				</button>
			</article>
			<article class="tool-card surface-card">
				<div class="tool-heading">
					<span class="step">4</span>
					<div>
						<h2>Ping 测试</h2>
						<p>测试到其他玩家虚拟 IP 的连通性</p>
					</div>
				</div>
				<div class="tool-controls">
					<input
						v-model="data.pingIp"
						class="ui-input mono"
						placeholder="对方虚拟 IP"
						aria-label="Ping 目标 IP"
					/>
					<ElInputNumber
						v-model="data.pingNum"
						:min="1"
						:max="10"
						:precision="0"
						controls-position="right"
						size="small"
					/>
					<button
						class="ui-button primary"
						:disabled="data.isPing"
						@click="handleTestPing('v4')"
					>
						{{ data.isPing ? "测试中…" : "开始测试" }}
					</button>
				</div>
				<pre
					v-if="data.pingLog"
					class="ping-output mono"
					>{{ data.pingLog }}</pre
				>
			</article>
			<article class="tool-card surface-card">
				<details>
					<summary>
						<div class="tool-heading">
							<span class="step">5</span>
							<div>
								<h2>ForceBindIP</h2>
								<p>强制游戏绑定联机 IP 或网卡</p>
							</div>
							<span class="ui-tag warning">进阶</span>
							<AppIcon
								name="chevron-down"
								:size="14"
							/>
						</div>
					</summary>
					<div class="forcebind-form">
						<div class="tool-controls">
							<ElRadioGroup v-model="mainStore.forceBindIpBit">
								<ElRadio value="32">32 位</ElRadio>
								<ElRadio value="64">64 位</ElRadio>
							</ElRadioGroup>
							<ElCheckbox v-model="mainStore.delayInjectDll">延迟注入 DLL</ElCheckbox>
						</div>
						<div class="tool-controls">
							<ElSelect
								v-model="mainStore.forceBindInput"
								filterable
								allow-create
								placeholder="IP 地址或网卡"
							>
								<ElOption
									v-for="guid in data.guids"
									:key="guid[0]"
									:label="guid[1]"
									:value="guid[0]"
								/>
							</ElSelect>
							<button
								class="ui-button"
								@click="getGuids"
							>
								刷新
							</button>
						</div>
						<div class="tool-controls">
							<input
								v-model="mainStore.forceBindFile"
								class="ui-input"
								placeholder="应用程序路径"
							/>
							<button
								class="ui-button"
								@click="handleBrowser"
							>
								浏览
							</button>
							<button
								class="ui-button primary"
								:disabled="data.forceBindStart"
								@click="startForceBindIp"
							>
								启动
							</button>
						</div>
					</div>
				</details>
			</article>
		</div>
	</section>
</template>
<script setup lang="ts">
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import UiSwitch from "@/components/UiSwitch.vue";
	import { isWindows, dataBaseDir } from "@/composables/platform";
	import { open, Command } from "@tauri-apps/plugin-shell";
	import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
	import { ElMessage, ElMessageBox, type TabPaneName } from "element-plus";
	import { QuestionFilled } from "@element-plus/icons-vue";
	import { onMounted, reactive } from "vue";
	import useMainStore from "@/stores/index";
	import { handleWinipBcStart, initStartWinIpBroadcast } from "@/composables/netcard";
	import { isValidIP } from "~/utils";
	import { dataSubscribe } from "~/composables/windows";
	import { invoke, isTauri } from "@tauri-apps/api/core";
	import { BaseDirectory, exists } from "@tauri-apps/plugin-fs";

	const mainStore = useMainStore();
	const data = reactive<{ guids: string[][]; [key: string]: any }>({
		activeTab: "netcard",
		winipBcPid: 0,
		pingNum: 1,
		winipBcStart: false,
		pingIp: "",
		isPing: false,
		pingLog: "",
		firewallStatus: {
			domain: false,
			public: false,
			dedicated: false
		},
		row: {
			name: "",
			metric: ""
		},
		netcardList: [],
		guids: [],
		forceBindStart: false
	});

	const handleCloseAllFireWall = async () => {
		try {
			await ElMessageBox.confirm("这会关闭所有网络配置文件的 Windows 防火墙。完成排查后请在系统安全设置中重新开启。", "关闭防火墙", {
				type: "warning",
				confirmButtonText: "关闭防火墙"
			});
		} catch {
			return;
		}
		try {
			const output = await Command.create("netsh", ["advfirewall", "set", "allprofiles", "state", "off"], {
				encoding: "gb2312"
			}).execute();
			ElMessage.success("关闭成功");
			await initFirewall();
		} catch (err) {
			ElMessage.error(`关闭失败${err}`);
			console.error(err);
		}
	};

	const handleTabsChange = async (tabPaneName: TabPaneName) => {
		if (tabPaneName === "netcard") {
			// await initNetCardInfo();
		} else if (tabPaneName == "firewall") {
			await initFirewall();
		}
	};

	const handleRowClick = async (row: any, column: any, event: Event) => {
		data.row = { ...row };
	};

	const handleSaveMetric = async () => {
		if (!Number.isInteger(Number(data.row.metric)) || Number(data.row.metric) < 1 || Number(data.row.metric) > 9999)
			return ElMessage.error("跃点需为 1–9999 的整数");
		if (data.row.metric && data.row.name) {
			try {
				const output = await Command.create("netsh", ["interface", "ipv4", "set", "interface", data.row.name, "metric=", data.row.metric], {
					encoding: "gb2312"
				}).execute();
				ElMessage.success("设置成功");
				await initNetCardInfo();
			} catch (err) {
				console.error(err);
			}
		}
	};

	const awaitTime = (time: number) => {
		return new Promise(res => {
			setTimeout(res, time);
		});
	};

	const handleTestPing = async (type: "v4" | "v6" = "v4") => {
		// const is = isValidIP(data.pingIp);
		if (isValidIP(data.pingIp)) {
			data.pingLog = "";
			data.isPing = true;
			const args = type === "v4" ? ["-n", "1", data.pingIp] : ["-6", "-n", "1", data.pingIp];
			try {
				for (let i = 0; i < data.pingNum; i++) {
					const output = await Command.create("ping", args, {
						encoding: "gb2312"
					}).execute();
					if (output.stdout) {
						data.pingLog += `${i + 1} - ${output.stdout.split("\n")[2]}`;
					}
					if (output.stderr) {
						data.pingLog += `${i + 1}error - ${output.stderr}`;
					}
					if (i != data.pingNum - 1) {
						await awaitTime(1000);
					}
				}
				data.pingLog += "完毕";
			} catch (err) {
				ElMessage.error("Ping发生错误");
				console.error(err);
			} finally {
				data.isPing = false;
			}
		} else {
			ElMessage.error("请输入正确的IP");
		}
	};

	const initNetCardInfo = async () => {
		try {
			const output = await Command.create("netsh", ["interface", "ipv4", "show", "interface"], {
				encoding: "gb2312"
			}).execute();
			data.netcardList = output.stdout
				.split("\n")
				.map(el => el.trim().replace(/\s+/g, " "))
				.filter(el => el)
				.slice(2)
				.map(el => {
					const [idx, Met, MTU, status, ...rest] = el.split(" ");
					return {
						index: idx,
						metric: Met,
						MTU,
						status,
						name: rest.join(" ")
					};
				}) as any;
		} catch (err) {
			ElMessage.error("网卡获取失败");
			console.error(err);
		}
	};

	const initFirewall = async () => {
		try {
			const output = await Command.create("netsh", ["advfirewall", "show", "allprofiles", "state"], {
				encoding: "gb2312"
			}).execute();
			const state = output.stdout
				.trim()
				.replace(/[\-]+/g, "")
				.split("\n")
				.map(el => el.trim())
				.filter(el => el)
				.slice(0, -1);
			for (let idx = 0; idx < state.length; idx += 2) {
				const status = state[idx + 1].replace(/状态\s+/, "");
				const matchName = /域|公用|专用/.exec(state[idx]);
				if (matchName) {
					const name = matchName[0];
					if (name == "域") {
						data.firewallStatus.domain = status != "关闭";
					} else if (name == "公用") {
						data.firewallStatus.public = status != "关闭";
					} else if (name == "专用") {
						data.firewallStatus.dedicated = status != "关闭";
					}
				}
			}
		} catch (err) {
			// netsh advfirewall firewall add rule name="EXE名称" dir=out action=allow program="EXE绝对路径"
			ElMessage.error("获取防火墙状态失败");
			console.error(err);
		}
	};

	const handleBrowser = async () => {
		const file = await dialogOpen({
			multiple: false,
			directory: false
		});
		if (file) {
			mainStore.forceBindFile = file;
		} else {
			ElMessage.error("获取文件路径失败");
		}
	};

	const startForceBindIp = async () => {
		if (!mainStore.forceBindInput) {
			return ElMessage.error("请输入IP地址或者选择一个网卡");
		}
		if (!mainStore.forceBindFile) {
			return ElMessage.error("请选择一个执行文件");
		}

		const forceBindIpExe = mainStore.forceBindIpBit == "32" ? "ForceBindIP" : "ForceBindIP64";
		const isExists = await exists(`easytier/tool/${forceBindIpExe}.exe`, { baseDir: dataBaseDir() });
		if (!isExists) {
			return ElMessage.error("forcebindIP文件不存在");
		}

		data.forceBindStart = true;
		try {
			const dealyDll = mainStore.delayInjectDll ? "-i" : "";
			const child = await Command.create(
				forceBindIpExe,
				[dealyDll, mainStore.forceBindInput, mainStore.forceBindFile.replace(/\//g, "\\")].filter(el => el),
				{
					encoding: "gb2312"
				}
			).spawn();
			// console.log({child});
		} catch (err) {
			ElMessage.error("forcebindIP启动发生未知错误");
			console.error(err);
		} finally {
			data.forceBindStart = false;
		}
	};

	const getGuids = async () => {
		const guids = await invoke<string[][]>("get_network_adapter_guids");
		data.guids = guids && guids.length > 0 ? guids : [];
		if (mainStore.forceBindInput.startsWith("{")) {
			const has = data.guids.find(el => el[0] == mainStore.forceBindInput);
			if (!has) {
				mainStore.forceBindInput = "";
			}
		}
	};

	onMounted(() => {
		if (!isWindows || !isTauri()) return;
		data.pingIp = mainStore.config.ipv4;
		// initStartWinIpBroadcast();
		getGuids();
		void initFirewall();
	});

	dataSubscribe();
</script>

<style scoped>
	.tools-content {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tool-card {
		padding: 14px;
		flex-shrink: 0;
	}
	.tool-heading {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.step {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: var(--primary-soft);
		color: var(--primary);
		font: 600 12px var(--mono);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tool-heading > div {
		flex: 1;
	}
	.tool-heading h2 {
		font-size: 13px;
		font-weight: 600;
	}
	.tool-heading p,
	.tool-note {
		font-size: 10px;
		line-height: 18px;
		color: var(--text-3);
		margin-top: 3px;
	}
	.tool-setting {
		margin-top: 14px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
	}
	.tool-setting small {
		display: block;
		font-size: 10px;
		color: var(--text-3);
		margin-top: 4px;
	}
	.tool-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
	}
	.tool-controls > .ui-input {
		min-width: 0;
		flex: 1;
		height: 32px;
		font-size: 11px;
	}
	.tool-controls > span {
		font-size: 11px;
	}
	.tool-controls .el-input-number {
		width: 80px;
		flex-shrink: 0;
	}
	.tool-controls .ui-button {
		white-space: nowrap;
	}
	.firewall-states {
		display: flex;
		gap: 16px;
		padding: 14px 0;
	}
	.firewall-states > span {
		font-size: 10px;
		color: var(--text-2);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tool-card .inline-notice {
		font-size: 10px;
		margin: 0 0 12px;
	}
	.tool-note {
		margin-top: 12px;
	}
	.ping-output {
		white-space: pre-wrap;
		font-size: 11px;
		color: var(--text-2);
		background: var(--console);
		padding: 12px;
		margin-top: 12px;
		border-radius: 8px;
	}
	.tool-card summary {
		list-style: none;
		cursor: pointer;
	}
	.tool-card summary::-webkit-details-marker {
		display: none;
	}
	.forcebind-form {
		padding-top: 4px;
	}
</style>

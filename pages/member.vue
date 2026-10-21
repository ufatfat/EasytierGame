<template>
	<section class="panel-page">
		<PanelHeader
			icon="users"
			title="房间信息"
			:subtitle="`${store.config.networkName || '当前房间'} · ${data.member.filter(m => !isServer(m)).length} 位成员 · ${data.member.filter(isServer).length} 个服务器节点`"
		>
			<button
				class="ui-button"
				:disabled="refreshing"
				@click="refresh"
			>
				<AppIcon
					name="refresh"
					:size="13"
				/>
				刷新
			</button>
		</PanelHeader>
		<div class="member-summary">
			<section class="surface-card">
				<span>连接方式</span>
				<strong class="mono">{{ directCount }} 直连 · {{ relayCount }} 中转</strong>
				<small>P2P 打洞成功率 {{ directCount + relayCount ? Math.round((directCount / (directCount + relayCount)) * 100) : 0 }}%</small>
			</section>
			<section class="surface-card">
				<span>平均延迟</span>
				<strong class="mono text-success">{{ averageLatency }} ms</strong>
				<small>越低越好 · 房间内</small>
			</section>
			<section class="surface-card">
				<span>累计流量</span>
				<strong class="mono">↓ {{ traffic.rx }}　↑ {{ traffic.tx }}</strong>
				<small>实时统计</small>
			</section>
		</div>
		<div class="section-toolbar member-filters">
			<div class="segmented">
				<button
					v-for="item in [
						{ value: 'all', label: '全部', count: data.member.length },
						{ value: 'member', label: '成员', count: data.member.filter(m => !isServer(m)).length },
						{ value: 'server', label: '服务器', count: data.member.filter(isServer).length }
					]"
					:key="item.value"
					:class="{ active: filter === item.value }"
					@click="filter = item.value"
				>
					{{ item.label }} {{ item.count }}
				</button>
			</div>
			<span>每 2 秒自动刷新</span>
		</div>
		<div class="panel-content member-list">
			<article
				v-for="member in visibleMembers"
				:key="member.id"
				class="peer-card surface-card"
				:class="{ local: member.cost === 'Local' }"
			>
				<button
					class="peer-card-main"
					@click="expanded = expanded === member.id ? '' : member.id"
				>
					<span class="avatar">
						<AppIcon
							v-if="isServer(member)"
							name="server"
							:size="16"
						/>
						<template v-else>{{ displayName(member).slice(0, 1) }}</template>
					</span>
					<div class="peer-identity">
						<strong>
							{{ displayName(member) }}
							<small v-if="member.cost === 'Local'">本机</small>
						</strong>
						<span class="mono">{{ member.ipv4 || "—" }} · v{{ member.version?.replace(/^v/, "") || "—" }}</span>
					</div>
					<div class="peer-badges">
						<span
							class="ui-tag"
							:class="member.cost === 'Local' ? 'primary' : isServer(member) ? '' : member.cost === 'p2p' ? 'success' : 'warning'"
						>
							<i class="dot" />
							{{ member.cost === "Local" ? "本机" : isServer(member) ? "服务器" : member.cost === "p2p" ? "直连" : "中转" }}
						</span>
						<span class="ui-tag mono">{{ member.tunnel_proto || "—" }}</span>
						<span class="ui-tag mono">{{ member.nat_type || "—" }}</span>
					</div>
					<div class="peer-quality">
						<strong
							class="mono"
							:class="Number(member.lat_ms) < 50 ? 'text-success' : 'text-warning'"
						>
							{{ member.cost === "Local" ? "—" : `${formatLatency(member.lat_ms)} ms` }}
						</strong>
						<small v-if="member.cost !== 'Local'">丢包 {{ member.loss_rate || "0%" }}</small>
					</div>
					<AppIcon
						name="chevron-down"
						:size="12"
						class="text-muted"
					/>
				</button>
				<div
					v-if="expanded === member.id"
					class="peer-expanded"
				>
					<div>
						<span>接收 / 发送</span>
						<b class="mono">{{ member.rx_bytes || "—" }} / {{ member.tx_bytes || "—" }}</b>
					</div>
					<div>
						<span>NAT / 协议</span>
						<b class="mono">{{ member.nat_type || "—" }} / {{ member.tunnel_proto || "—" }}</b>
					</div>
					<div
						v-for="address in member.connections_addrs"
						:key="address"
					>
						<span>连接地址</span>
						<b class="mono">{{ address }}</b>
					</div>
					<button
						class="text-button"
						@click="copyText(member.ipv4)"
					>
						<AppIcon
							name="copy"
							:size="12"
						/>
						复制虚拟 IP
					</button>
				</div>
			</article>
			<div
				v-if="!visibleMembers.length"
				class="empty-state"
			>
				<AppIcon
					name="users"
					:size="30"
				/>
				<p>等待成员信息，请先在主窗口启动联机</p>
			</div>
			<div class="subnet-heading">
				<AppIcon
					name="network"
					:size="14"
				/>
				<span>子网代理</span>
				<small>由成员共享的其他局域网网段</small>
				<button
					class="text-button"
					@click="openCidr"
				>
					子网代理设置
				</button>
			</div>
			<div
				v-for="member in data.member.filter(m => m.cidr && m.cidr !== '-')"
				:key="`subnet-${member.id}`"
				class="subnet-route surface-card"
			>
				<span class="mono">{{ member.cidr }}</span>
				<span>→ {{ displayName(member) }} · {{ member.ipv4 }}</span>
			</div>
		</div>
	</section>
</template>
<script setup lang="ts">
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import openWindow from "@/composables/windows";
	import { useRuntimeNetwork, refreshRuntimeNetwork } from "@/composables/runtime";
	import useMainStore from "@/stores/index";
	import { copyText } from "@/utils";
	import { invoke, isTauri } from "@tauri-apps/api/core";
	import { reactive, onMounted, onBeforeUnmount, computed, ref, watch } from "vue";
	import { ATJ } from "@/utils";
	import { ElConfirmDanger } from "~/utils/element";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { isNaN } from "lodash-es";

	const store = useMainStore();
	const filter = ref("all"),
		expanded = ref(""),
		refreshing = ref(false);
	const isServer = (member: Member) => /publicserver/i.test(member.hostname || "") || !member.ipv4 || member.ipv4 === "-";
	const displayName = (member: Member) => (/publicserver/i.test(member.hostname || "") ? "服务器" : member.hostname || "未命名成员");
	const visibleMembers = computed(() =>
		computedMember.value.filter(member => filter.value === "all" || (filter.value === "server" ? isServer(member) : !isServer(member)))
	);
	const directCount = computed(() => data.member.filter(m => m.cost === "p2p").length);
	const relayCount = computed(() => data.member.filter(m => m.cost !== "Local" && m.cost !== "p2p" && !isServer(m)).length);
	const averageLatency = computed(() => {
		const values = data.member
			.filter(m => m.cost !== "Local" && !isServer(m) && Number.isFinite(Number(m.lat_ms)) && Number(m.lat_ms) >= 0)
			.map(m => Number(m.lat_ms));
		return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : "—";
	});
	const bytes = (value: string) => {
		const match = String(value || "").match(/([\d.]+)\s*([kmgt]?)/i);
		return match ? Number(match[1]) * 1024 ** Math.max(0, ["", "k", "m", "g", "t"].indexOf(match[2].toLowerCase())) : 0;
	};
	const traffic = computed(() => {
		const rx = data.member.reduce((sum, m) => sum + bytes(m.rx_bytes), 0),
			tx = data.member.reduce((sum, m) => sum + bytes(m.tx_bytes), 0);
		const format = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(0)} MB`);
		return { rx: format(rx), tx: format(tx) };
	});
	const refresh = async () => {
		if (!isTauri()) return;
		refreshing.value = true;
		try {
			await refreshRuntimeNetwork();
		} finally {
			refreshing.value = false;
		}
	};
	const openCidr = () => openWindow("cidr", { url: "#/cidr", title: "子网代理", width: 600, height: 720 });
	const natMaps = {
		unknown: "未知",
		OpenInternet: "nat0-openinternet",
		nopat: "nat0-nopat",
		fullcone: "nat1",
		restricted: "nat2",
		portrestricted: "nat3",
		symmetric: "nat4",
		symmetriceasydec: "nat4-easydec",
		symmetriceasyinc: "nat4-easyinc",
		symUdpfirewall: "nat4-udpfirewall"
	};

	type NATKyes = keyof typeof natMaps;

	const data = reactive<{ member: Member[]; proxy: Proxy[] }>({
		member: [],
		proxy: []
	});

	const computedMember = computed(() => {
		const localMember = data.member.find(member => member?.cost == "Local");
		if (!localMember) return data.member;
		const ipv4 = localMember.ipv4;
		const proxyMember = data.proxy?.filter(proxy => proxy.src.startsWith(`${ipv4}:`));
		const proxyObj: Record<string, [string, "Connected" | "Closed"]> = {};
		for (const proxy of proxyMember) {
			proxyObj[proxy.dst.split(":")[0]] = [proxy.transport_type, proxy.state];
		}
		return data.member.map(m => {
			m.proxy = proxyObj?.[m.ipv4.split(":")?.[0]] || m?.proxy || ["", "Closed"];
			return m;
		});
	});

	// 延迟排序函数
	const sortLatMs = (a: Member, b: Member): number => {
		const getLatencyValue = (row: Member): number => {
			const latMs = row.lat_ms;

			if (latMs === null || latMs === undefined || latMs === "") {
				return Infinity;
			}

			const num = Number(latMs);
			if (isNaN(num) || num < 0) {
				return Infinity;
			}

			return Math.floor(num);
		};

		const valueA = getLatencyValue(a);
		const valueB = getLatencyValue(b);

		if (valueA === Infinity && valueB === Infinity) {
			return 0;
		}

		return valueA - valueB;
	};

	// IP地址排序函数
	const sortIpv4 = (a: any, b: any): number => {
		const ipToNumber = (ip: string): number => {
			if (!ip || ip === "-" || ip === "") {
				return 0;
			}

			// 处理可能包含端口号或子网掩码的情况
			const cleanIp = ip.split("/")[0].split(":")[0];
			const parts = cleanIp.split(".");

			if (parts.length !== 4) {
				return 0;
			}

			try {
				const nums = parts.map(part => {
					const num = parseInt(part, 10);
					return isNaN(num) || num < 0 || num > 255 ? 0 : num;
				});

				// 将IP地址转换为32位数字进行比较
				return (nums[0] << 24) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
			} catch {
				return 0;
			}
		};

		const numA = ipToNumber(a.ipv4);
		const numB = ipToNumber(b.ipv4);

		return numA - numB;
	};

	// 字节数据排序函数
	const sortBytes = (a: any, b: any, field: string = "rx_bytes"): number => {
		const parseBytes = (bytesStr: string): number => {
			if (!bytesStr || bytesStr === "-" || bytesStr === "") {
				return 0;
			}

			// 统一转换为小写并去除空格
			const cleanStr = bytesStr.toLowerCase().trim();

			// 使用正则表达式匹配数字和单位
			const match = cleanStr.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
			if (!match) {
				return 0;
			}

			const value = parseFloat(match[1]);
			const unit = match[2];

			if (isNaN(value)) {
				return 0;
			}

			// 根据单位转换为字节数
			switch (unit) {
				case "b":
				case "byte":
				case "bytes":
				case "":
					return value;
				case "k":
				case "kb":
				case "kib":
					return value * 1024;
				case "m":
				case "mb":
				case "mib":
					return value * 1024 * 1024;
				case "g":
				case "gb":
				case "gib":
					return value * 1024 * 1024 * 1024;
				case "t":
				case "tb":
				case "tib":
					return value * 1024 * 1024 * 1024 * 1024;
				case "p":
				case "pb":
				case "pib":
					return value * 1024 * 1024 * 1024 * 1024 * 1024;
				default:
					return value; // 未知单位当作字节处理
			}
		};

		const bytesA = parseBytes(a[field]);
		const bytesB = parseBytes(b[field]);

		return bytesA - bytesB;
	};

	// 格式化延迟显示
	const formatLatency = (latMs: any): string => {
		if (latMs === null || latMs === undefined || latMs === "") {
			return "-";
		}

		const num = Number(latMs);
		if (isNaN(num)) {
			return "-";
		}

		if (num < 0) {
			return "-";
		}

		return num.toFixed(0);
	};

	const runtime = useRuntimeNetwork("members");
	watch(
		runtime,
		state => {
			const connections = new Map(state.connections.map(connection => [String(connection.route.peer_id), connection]));
			data.member = state.members.map(member => ({
				...member,
				connections_addrs: connections.get(String(member.id))?.peer?.conns?.map(conn => conn?.tunnel?.remote_addr?.url || "") || []
			}));
			data.proxy = state.proxies;
		},
		{ immediate: true }
	);
</script>

<style scoped>
	.member-summary {
		display: flex;
		gap: 10px;
		padding: 14px 20px 6px;
	}
	.member-summary > section {
		flex: 1;
		min-width: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.member-summary span,
	.member-summary small {
		font-size: 10px;
		color: var(--text-3);
		line-height: 16px;
	}
	.member-summary strong {
		font-size: 13px;
		font-weight: 600;
		line-height: 20px;
	}
	.member-summary > section:last-child strong {
		font-size: 11px;
	}
	.member-filters {
		padding-top: 10px;
		padding-bottom: 10px;
	}
	.member-filters > span {
		margin-left: auto;
		font-size: 10px;
		color: var(--text-3);
	}
	.member-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 0;
	}
	.peer-card {
		flex-shrink: 0;
		overflow: hidden;
	}
	.peer-card.local {
		background: var(--primary-soft);
		border-color: color-mix(in srgb, var(--primary) 25%, transparent);
	}
	.peer-card-main {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
	}
	.peer-identity {
		flex: 1;
		min-width: 0;
	}
	.peer-identity > strong {
		display: block;
		font-size: 12px;
		line-height: 20px;
		font-weight: 600;
	}
	.peer-identity small {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-3);
		margin-left: 4px;
	}
	.peer-identity > span {
		font-size: 10px;
		color: var(--text-3);
	}
	.peer-badges {
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: 188px;
	}
	.peer-badges .ui-tag {
		font-size: 9px;
		padding: 0 5px;
		line-height: 16px;
	}
	.peer-quality {
		width: 64px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.peer-quality strong {
		font-size: 12px;
		font-weight: 500;
	}
	.peer-quality small {
		font-size: 9px;
		color: var(--text-3);
	}
	.peer-expanded {
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 11px;
	}
	.peer-expanded > div {
		display: flex;
		gap: 12px;
	}
	.peer-expanded span {
		color: var(--text-3);
		min-width: 80px;
	}
	.peer-expanded b {
		font-size: 10px;
		font-weight: 400;
		overflow-wrap: anywhere;
	}
	.subnet-heading {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-top: 10px;
		font-size: 11px;
		color: var(--text-2);
	}
	.subnet-heading small {
		font-size: 10px;
		color: var(--text-3);
	}
	.subnet-heading .text-button {
		margin-left: auto;
		font-size: 10px;
	}
	.subnet-route {
		padding: 12px;
		display: flex;
		gap: 8px;
		font-size: 10px;
		color: var(--text-2);
	}
	@media (max-width: 550px) {
		.peer-badges .ui-tag:last-child {
			display: none;
		}
		.member-summary > section {
			padding: 10px;
		}
		.member-summary {
			gap: 6px;
		}
	}
</style>

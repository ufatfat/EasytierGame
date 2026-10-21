<template>
	<button
		v-if="!standalone"
		class="ui-button"
		@click="openCommunity"
	>
		全局 IP / 公告
	</button>
	<section
		v-else
		class="panel-page community-page"
	>
		<PanelHeader
			icon="megaphone"
			title="社区 · 全局 IP 与公告"
			subtitle="通过独立协调服务共享，不按房间隔离"
		/>
		<div class="community-service">
			<span
				class="connection-label"
				:class="{ online: state && !error }"
			>
				<i class="dot" />
				{{ state ? (error ? "连接异常" : "已连接") : "未连接" }}
			</span>
			<span
				class="mono service-url"
				:title="serviceUrls.join('\n')"
			>
				{{ currentServiceUrl || "请设置协调服务" }}
			</span>
			<span
				v-if="serviceUrls.length > 1"
				class="ui-tag"
				:class="currentServiceUrl !== serviceUrls[0] ? 'warning' : ''"
			>
				{{ currentServiceUrl !== serviceUrls[0] ? "备用" : "" }} {{ serviceUrls.length }} 地址
			</span>
			<span
				v-if="state"
				class="service-member"
			>
				· {{ state.me.name }}
			</span>
			<span
				v-if="state"
				class="ui-tag"
				:class="isAdmin ? 'warning' : ''"
			>
				{{ isAdmin ? "管理员" : "成员" }}
			</span>
			<span class="service-updated">{{ updatedAt ? `更新于 ${updatedAt}` : "" }}</span>
			<button
				class="icon-button service-settings"
				aria-label="服务设置"
				:disabled="store.networkRunning || busy"
				@click="openSettings"
			>
				<AppIcon
					name="settings"
					:size="14"
				/>
			</button>
			<button
				v-if="serviceUrls.length"
				class="icon-button"
				aria-label="刷新社区"
				:disabled="busy"
				@click="refresh"
			>
				<AppIcon
					name="refresh"
					:size="14"
					:class="{ spinning: busy }"
				/>
			</button>
		</div>
		<nav
			class="community-tabs"
			aria-label="社区分类"
		>
			<button
				v-for="item in [
					{ value: 'ip', label: '固定 IP 登记' },
					{ value: 'announcements', label: '公告' },
					{ value: 'members', label: '成员管理' }
				].filter(t => t.value !== 'members' || isAdmin)"
				:key="item.value"
				:class="{ active: tab === item.value }"
				@click="
					tab = item.value;
					onTabChange(item.value);
				"
			>
				{{ item.label }}
				<span
					v-if="item.value === 'announcements'"
					class="tab-count"
				>
					{{ state?.announcements.length || 0 }}
				</span>
				<span
					v-if="item.value === 'members'"
					class="tab-count"
				>
					{{ members.length }}
				</span>
			</button>
		</nav>
		<div class="panel-content community-content">
			<div
				v-if="error"
				class="inline-notice error"
				role="alert"
			>
				<AppIcon
					name="warning"
					:size="15"
				/>
				<span>{{ error }}</span>
			</div>
			<div
				v-if="!serviceUrls.length || !store.coordinator.serviceToken"
				class="empty-state"
			>
				<AppIcon
					name="link"
					:size="30"
				/>
				<p>连接协调服务后使用全局 IP、公告和房间大厅</p>
				<button
					class="ui-button primary mt-3"
					@click="openSettings"
				>
					设置服务与个人密钥
				</button>
			</div>
			<template v-else-if="tab === 'ip'">
				<section class="ip-reservation surface-card">
					<div class="reservation-header">
						<span>本机已登记</span>
						<span class="mono">可用网段 {{ state?.pool || "连接后显示" }}</span>
					</div>
					<div class="reservation-value">
						<strong class="mono">{{ mine?.ip || "尚未登记" }}</strong>
						<span
							v-if="mine && store.coordinator.useRegisteredIp"
							class="ui-tag success"
						>
							<i class="dot" />
							联机时使用
						</span>
						<label class="reservation-mode">
							用于联机
							<UiSwitch
								v-model="store.coordinator.useRegisteredIp"
								label="联机时使用登记 IP"
								:disabled="(!mine && !store.coordinator.useRegisteredIp) || store.networkRunning || busy"
								@update:model-value="applyMode"
							/>
						</label>
					</div>
					<div class="reservation-form">
						<input
							v-model="ip"
							class="ui-input mono"
							placeholder="想要换为… 10.126.126."
							maxlength="15"
							:disabled="store.networkRunning || busy"
							aria-label="想登记的 IPv4 地址"
						/>
						<button
							class="ui-button primary"
							:disabled="!state || store.networkRunning || busy"
							@click="claim"
						>
							{{ mine ? "更换登记" : "登记 IP" }}
						</button>
						<button
							class="ui-button danger"
							:disabled="!mine || store.networkRunning || busy"
							@click="release"
						>
							释放
						</button>
					</div>
				</section>
				<div class="inline-notice">
					<AppIcon
						name="warning"
						:size="14"
					/>
					<span>登记仅约束使用此协调服务的客户端；手动设 IP 或 DHCP 的客户端仍可能冲突。所有联机成员应统一使用登记模式。</span>
				</div>
				<p
					v-if="store.networkRunning"
					class="section-caption"
				>
					请停止联机后修改或释放 IP、切换服务。
				</p>
				<div class="community-table surface-card">
					<ElTable
						:data="state?.claims || []"
						empty-text="暂无登记"
					>
						<ElTableColumn
							prop="ip"
							label="IP"
							width="134"
						>
							<template #default="{ row }">
								<span class="mono">{{ row.ip }}</span>
							</template>
						</ElTableColumn>
						<ElTableColumn
							label="成员（主机名）"
							min-width="145"
						>
							<template #default="{ row }">{{ row.member_name || "未归属" }}（{{ row.hostname }}）</template>
						</ElTableColumn>
						<ElTableColumn
							label="归属"
							width="70"
						>
							<template #default="{ row }">
								<span
									v-if="row.client_id === state?.clientId"
									class="ui-tag primary"
								>
									本机
								</span>
								<span v-else>{{ row.member_id === state?.me.id ? "我的设备" : "其他" }}</span>
							</template>
						</ElTableColumn>
						<ElTableColumn
							label="登记时间"
							width="106"
						>
							<template #default="{ row }">
								<span class="mono text-muted">{{ formatTime(row.updated_at) }}</span>
							</template>
						</ElTableColumn>
						<ElTableColumn
							v-if="isAdmin"
							label=""
							width="48"
						>
							<template #default="{ row }">
								<button
									v-if="row.client_id !== state?.clientId"
									class="text-button text-danger"
									:disabled="busy"
									@click="forceRelease(row.ip)"
								>
									释放
								</button>
							</template>
						</ElTableColumn>
					</ElTable>
				</div>
			</template>
			<template v-else-if="tab === 'announcements'">
				<section class="announcement-composer surface-card">
					<input
						v-model="title"
						class="composer-title"
						maxlength="100"
						placeholder="标题，例如：今晚 9 点怪猎集会"
						aria-label="公告标题"
					/>
					<textarea
						v-model="content"
						class="composer-body"
						maxlength="2000"
						placeholder="写点什么… 所有连接此服务的客户端都能看到"
						aria-label="公告内容"
					/>
					<div class="composer-footer">
						<span>以 {{ state?.me.name || store.config.hostname || "当前成员" }} 的身份发布</span>
						<button
							class="ui-button primary small"
							:disabled="!state || busy || !title.trim() || !content.trim()"
							@click="publish"
						>
							发布公告
						</button>
					</div>
				</section>
				<div class="announcement-filter">
					<span>最近 100 条 · 按时间倒序</span>
					<label>
						<UiSwitch
							v-model="mineOnly"
							label="仅看我发布的公告"
							:disabled="busy"
							@update:model-value="refresh"
						/>
						仅看我发布的
					</label>
				</div>
				<article
					v-for="item in state?.announcements"
					:key="item.id"
					class="announcement-item"
				>
					<span class="avatar">{{ (item.member_name || item.hostname).slice(0, 1) }}</span>
					<div class="announcement-text">
						<div class="announcement-meta">
							{{ item.member_name || "未归属" }}
							<span
								v-if="item.member_id === state?.me.id"
								class="ui-tag primary"
							>
								我
							</span>
							<span class="mono">· {{ formatTime(item.created_at) }}</span>
							<button
								v-if="canWithdraw(item)"
								class="text-button text-danger"
								:disabled="busy"
								@click="withdraw(item.id)"
							>
								{{ item.member_id === state?.me.id ? "撤回" : "删除" }}
							</button>
						</div>
						<h3>{{ item.title }}</h3>
						<p>{{ item.content }}</p>
						<small class="text-muted">{{ item.hostname }}</small>
					</div>
				</article>
				<div
					v-if="!state?.announcements.length"
					class="empty-state"
				>
					还没有公告，发布第一条吧
				</div>
			</template>
			<template v-else-if="tab === 'members' && isAdmin">
				<div class="create-member">
					<input
						v-model="newMemberName"
						class="ui-input"
						placeholder="成员名，例如：阿杰"
						maxlength="32"
						aria-label="新成员名字"
					/>
					<select
						v-model="newMemberRole"
						class="ui-input"
						aria-label="新成员角色"
					>
						<option value="member">成员</option>
						<option value="admin">管理员</option>
					</select>
					<button
						class="ui-button primary"
						:disabled="busy || !newMemberName.trim()"
						@click="addMember"
					>
						新建并生成密钥
					</button>
				</div>
				<section
					v-if="issued"
					class="issued-key"
				>
					<div>
						<AppIcon
							name="key"
							:size="15"
						/>
						<strong>已为“{{ issued.member.name }}”生成访问密钥</strong>
						<button
							class="icon-button"
							aria-label="关闭一次性密钥"
							@click="issued = null"
						>
							<AppIcon
								name="x"
								:size="14"
							/>
						</button>
					</div>
					<div class="key-value">
						<code>{{ issued.key }}</code>
						<button
							class="text-button"
							@click="copyText(issued.key)"
						>
							<AppIcon
								name="copy"
								:size="13"
							/>
							复制
						</button>
					</div>
					<p>只显示这一次，关闭后无法再查看。请通过私聊发给本人，不要发到群里。</p>
				</section>
				<div class="members-table surface-card">
					<div class="member-grid table-head">
						<span>成员</span>
						<span>最近使用</span>
						<span>IP / 公告</span>
						<span>操作</span>
					</div>
					<div
						v-for="member in members"
						:key="member.id"
						class="member-grid"
						:class="{ revoked: member.revoked_at }"
					>
						<div class="member-name-cell">
							<span class="avatar">{{ member.name.slice(0, 1) }}</span>
							<strong>{{ member.name }}</strong>
							<span
								v-if="member.revoked_at"
								class="ui-tag danger"
							>
								已吊销
							</span>
							<span
								v-else-if="member.role === 'admin'"
								class="ui-tag warning"
							>
								管理员
							</span>
							<span
								v-if="member.id === state?.me.id"
								class="ui-tag primary"
							>
								我
							</span>
						</div>
						<span class="member-last-seen">
							{{ member.revoked_at ? `${formatTime(member.revoked_at)} 吊销` : formatTime(member.last_seen_at) }}
						</span>
						<span class="mono">{{ member.claim_count }} / {{ member.announcement_count }}</span>
						<div
							v-if="!member.revoked_at"
							class="member-actions"
						>
							<button
								class="text-button"
								:disabled="busy"
								@click="resetKey(member)"
							>
								重置密钥
							</button>
							<button
								class="text-button"
								:disabled="busy || member.id === state?.me.id"
								@click="toggleRole(member)"
							>
								{{ member.role === "admin" ? "设为成员" : "设为管理员" }}
							</button>
							<button
								class="text-button text-danger"
								:disabled="busy || member.id === state?.me.id"
								@click="revokeTarget = member"
							>
								吊销
							</button>
						</div>
					</div>
				</div>
				<p class="section-caption">管理员不能修改自己的角色或吊销自己；吊销后密钥立即失效并释放其 IP，公告保留，同名可重新创建。</p>
			</template>
		</div>
		<ElDialog
			v-model="settingsOpen"
			title="协调服务设置"
			width="420px"
			:close-on-click-modal="false"
		>
			<ElForm label-position="top">
				<ElFormItem label="协调服务地址（每行一个）">
					<ElInput
						v-model="serviceDraft.urls"
						type="textarea"
						:rows="4"
						resize="vertical"
						placeholder="https://et-hub.example.com&#10;https://backup.example.com"
					/>
				</ElFormItem>
				<p class="section-caption service-address-help">
					最多 5 个，按顺序尝试，成功后优先复用。备用地址须连接同一套协调服务数据，使用相同的个人密钥。
				</p>
				<ElFormItem label="个人访问密钥">
					<ElInput
						v-model="serviceDraft.key"
						type="password"
						show-password
						placeholder="etk_…（向管理员索取）"
					/>
				</ElFormItem>
				<p class="section-caption">密钥仅保存在本机，不会进入房间分享码。</p>
			</ElForm>
			<template #footer>
				<button
					class="ui-button"
					@click="settingsOpen = false"
				>
					取消
				</button>
				<button
					class="ui-button primary ml-2"
					:disabled="busy"
					@click="saveSettings"
				>
					连接服务
				</button>
			</template>
		</ElDialog>
		<ElDialog
			:model-value="!!revokeTarget"
			:title="`吊销成员‘${revokeTarget?.name || ''}’？`"
			width="380px"
			@close="revokeTarget = null"
		>
			<div class="revoke-details">
				<p>
					<AppIcon
						name="warning"
						:size="15"
					/>
					访问密钥立即失效，客户端下次刷新即断开
				</p>
				<p>
					<AppIcon
						name="network"
						:size="15"
					/>
					释放其登记的 {{ revokeTarget?.claim_count || 0 }} 个 IP
				</p>
				<p>
					<AppIcon
						name="megaphone"
						:size="15"
					/>
					已发布公告保留，可单独删除
				</p>
				<p class="section-caption">此操作不可撤销。需要恢复时可重新创建同名成员并发放新密钥。</p>
			</div>
			<template #footer>
				<button
					class="ui-button"
					@click="revokeTarget = null"
				>
					取消
				</button>
				<button
					class="ui-button danger ml-2"
					:disabled="busy"
					@click="revokeTarget && revoke(revokeTarget)"
				>
					吊销
				</button>
			</template>
		</ElDialog>
	</section>
</template>
<script setup lang="ts">
	import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
	import { ElMessage, ElMessageBox } from "element-plus";
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import UiSwitch from "@/components/UiSwitch.vue";
	import { useRuntimeNetwork } from "@/composables/runtime";
	import openWindow, { dataSubscribe } from "@/composables/windows";
	import useMainStore from "@/stores/index";
	import {
		activeCoordinatorUrl,
		coordinatorUrls,
		adminReleaseIp,
		coordinatorRequest,
		createMember,
		listMembers,
		registerIp,
		resetMemberKey,
		revokeMember,
		setMemberRole,
		sharedState,
		type Claim,
		type IssuedKey,
		type Member,
		type Role,
		type SharedState
	} from "@/composables/coordinator";
	import { normalizeCoordinatorUrls } from "@/utils/coordinator-failover";
	import { copyText } from "@/utils";
	const { standalone = false } = defineProps<{ standalone?: boolean }>();
	const openCommunity = () =>
		openWindow("community", { url: "#/community", title: "全局 IP 登记与公告", width: 600, height: 720, minWidth: 520, minHeight: 500 });
	const store = useMainStore();
	const settingsOpen = ref(false),
		revokeTarget = ref<Member | null>(null);
	const serviceUrls = computed(coordinatorUrls),
		currentServiceUrl = computed(activeCoordinatorUrl);
	const serviceDraft = ref({ urls: serviceUrls.value.join("\n"), key: store.coordinator.serviceToken });
	const openSettings = () => {
		serviceDraft.value = { urls: serviceUrls.value.join("\n") || store.coordinator.url, key: store.coordinator.serviceToken };
		settingsOpen.value = true;
	};
	const saveSettings = () =>
		perform(async () => {
			if (store.networkRunning) throw new Error("请先停止联机和自建服务器");
			const urls = normalizeCoordinatorUrls(serviceDraft.value.urls),
				key = serviceDraft.value.key.trim();
			if (!urls.length || !key) throw new Error("请填写至少一个协调服务地址和个人访问密钥");
			store.coordinator.urls = urls;
			store.coordinator.url = urls[0];
			store.coordinator.activeUrl = "";
			store.coordinator.serviceToken = key;
			clearState();
			await load();
			settingsOpen.value = false;
		});
	const formatTime = (time: string | null) =>
		time ? new Date(time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "从未";
	const canWithdraw = (item: any) => isAdmin.value || (!!item.member_id && item.member_id === state.value?.me.id);

	if (standalone) dataSubscribe();
	const visible = ref(standalone),
		busy = ref(false),
		tab = ref("ip"),
		error = ref(""),
		updatedAt = ref("");
	const mineOnly = ref(false);
	const ip = ref(""),
		title = ref(""),
		content = ref("");
	const state = ref<SharedState | null>(null);
	const mine = computed(() => state.value?.claims.find(claim => claim.client_id === state.value?.clientId));
	const isAdmin = computed(() => state.value?.me.role === "admin");
	const members = ref<Member[]>([]),
		issued = ref<IssuedKey | null>(null),
		newMemberName = ref(""),
		newMemberRole = ref<Role>("member");
	const ownership = (row: Claim) =>
		row.client_id === state.value?.clientId ? "本机" : row.member_id === state.value?.me.id ? "我的其他设备" : "其他";
	const clearState = () => {
		state.value = null;
		members.value = [];
		issued.value = null;
		updatedAt.value = "";
		error.value = "";
	};
	async function load() {
		state.value = await sharedState(mineOnly.value);
		updatedAt.value = new Date().toLocaleTimeString();
		if (!ip.value && mine.value) ip.value = mine.value.ip;
		if (!isAdmin.value && tab.value === "members") tab.value = "ip";
		if (isAdmin.value) members.value = await listMembers();
	}
	async function perform(action: () => Promise<void>) {
		if (busy.value) return;
		busy.value = true;
		error.value = "";
		try {
			await action();
		} catch (e) {
			// ElMessageBox rejects with "cancel"/"close" when the user backs out of a confirmation.
			if (e === "cancel" || e === "close") return;
			if (/访问密钥无效|已被吊销/.test(String(e))) clearState();
			error.value = String(e instanceof Error ? e.message : e);
		} finally {
			busy.value = false;
		}
	}
	const refresh = () => {
		if (!serviceUrls.value.length || !store.coordinator.serviceToken) return;
		return perform(load);
	};
	const applyMode = () => {
		if (store.coordinator.useRegisteredIp && mine.value) {
			store.config.dhcp = false;
			store.config.ipv4 = mine.value.ip;
		}
	};
	const claim = () =>
		perform(async () => {
			if (store.networkRunning) throw new Error("请先停止联机");
			const result = await registerIp(ip.value);
			store.coordinator.useRegisteredIp = true;
			store.config.dhcp = false;
			store.config.ipv4 = result.ip;
			await load();
			ElMessage.success("固定 IP 登记成功，下次联机生效");
		});
	const release = () =>
		perform(async () => {
			if (store.networkRunning) throw new Error("请先停止联机");
			await coordinatorRequest("/v1/claim", "DELETE");
			store.coordinator.useRegisteredIp = false;
			store.config.dhcp = true;
			store.config.ipv4 = "";
			ip.value = "";
			await load();
		});
	const publish = () =>
		perform(async () => {
			if (!store.config.hostname.trim()) throw new Error("请先填写主机名");
			await coordinatorRequest("/v1/announcements", "POST", { hostname: store.config.hostname, title: title.value, content: content.value });
			title.value = "";
			content.value = "";
			await load();
			ElMessage.success("公告已发布");
		});
	const withdraw = (id: string) =>
		perform(async () => {
			await coordinatorRequest(`/v1/announcements/${id}`, "DELETE");
			await load();
		});
	const onTabChange = (name: string | number) => {
		if (name === "members") void perform(load);
	};
	const forceRelease = (target: string) =>
		perform(async () => {
			await ElMessageBox.confirm(`释放 ${target} 后，该成员下次联机需要重新登记。`, "释放 IP", { type: "warning" });
			await adminReleaseIp(target);
			await load();
		});
	const addMember = () =>
		perform(async () => {
			issued.value = await createMember(newMemberName.value, newMemberRole.value);
			newMemberName.value = "";
			newMemberRole.value = "member";
			await load();
		});
	const resetKey = (member: Member) =>
		perform(async () => {
			await ElMessageBox.confirm(`“${member.name}”的旧密钥会立即失效，需要把新密钥发给本人。`, "重置密钥", { type: "warning" });
			issued.value = await resetMemberKey(member.id);
			// Resetting your own key would otherwise lock this client out on the next request.
			if (member.id === state.value?.me.id) store.coordinator.serviceToken = issued.value.key;
			await load();
		});
	const toggleRole = (member: Member) =>
		perform(async () => {
			await setMemberRole(member.id, member.role === "admin" ? "member" : "admin");
			await load();
		});
	const revoke = (member: Member) =>
		perform(async () => {
			await revokeMember(member.id);
			revokeTarget.value = null;
			await load();
		});
	const runtime = useRuntimeNetwork();
	watch(runtime, state => {
		store.networkRunning = state.client_running || state.server_running;
	});
	onMounted(() => {
		if (standalone) void refresh();
	});
	let timer: ReturnType<typeof setInterval> | undefined;
	watch(
		visible,
		open => {
			clearInterval(timer);
			if (open)
				timer = setInterval(() => {
					void refresh();
				}, 15000);
		},
		{ immediate: true }
	);
	onBeforeUnmount(() => {
		clearInterval(timer);
	});
</script>

<style scoped>
	.community-service {
		height: 50px;
		min-height: 50px;
		background: var(--surface);
		padding: 12px 20px;
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid var(--border);
		font-size: 11px;
	}
	.connection-label {
		display: flex;
		gap: 6px;
		align-items: center;
		white-space: nowrap;
		color: var(--text-3);
		font-size: 12px;
	}
	.connection-label.online {
		color: var(--success);
	}
	.service-url {
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 230px;
		flex: 1;
		min-width: 0;
	}
	.service-member {
		color: var(--text-3);
		white-space: nowrap;
	}
	.service-updated {
		margin-left: auto;
		font-size: 10px;
		color: var(--text-3);
		white-space: nowrap;
	}
	.service-settings {
		width: 26px;
		height: 26px;
		background: var(--surface-2);
	}
	.community-service > .icon-button:last-child {
		width: 20px;
	}
	.community-tabs {
		display: flex;
		gap: 20px;
		padding: 0 20px;
		border-bottom: 1px solid var(--border);
		min-height: 40px;
	}
	.community-tabs > button {
		height: 40px;
		background: none;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--text-2);
		font-size: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0;
	}
	.community-tabs > button.active {
		color: var(--text-1);
		border-color: var(--primary);
		font-weight: 600;
	}
	.tab-count {
		border-radius: 8px;
		background: var(--surface-3);
		padding: 0 4px;
		font-size: 10px;
		font-weight: 400;
	}
	.community-content {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.ip-reservation {
		padding: 14px;
		border-color: color-mix(in srgb, var(--primary) 25%, transparent);
		background: linear-gradient(100deg, var(--primary-soft), var(--surface) 70%);
	}
	.reservation-header {
		display: flex;
		justify-content: space-between;
		color: var(--text-3);
		font-size: 11px;
	}
	.reservation-header .mono {
		font-size: 10px;
	}
	.reservation-value {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 0 12px;
	}
	.reservation-value > strong {
		font-size: 26px;
		font-weight: 600;
		line-height: 34px;
	}
	.reservation-mode {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-2);
		font-size: 11px;
		white-space: nowrap;
	}
	.reservation-form {
		display: flex;
		gap: 8px;
	}
	.reservation-form > .ui-input {
		flex: 1;
		min-width: 0;
	}
	.community-table {
		overflow: auto;
		flex-shrink: 0;
	}
	.community-table :deep(.el-table) {
		background: transparent;
	}
	.community-table :deep(.el-table tr:has(.ui-tag.primary)) {
		background: var(--primary-soft);
	}
	.announcement-composer {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.composer-title,
	.composer-body {
		padding: 0;
		border: 0;
		background: transparent;
		font-family: var(--font);
		font-size: 12px;
		color: var(--text-1);
		outline: none;
		width: 100%;
	}
	.composer-title {
		height: 20px;
	}
	.composer-body {
		height: 44px;
		resize: none;
		line-height: 20px;
	}
	.composer-title::placeholder,
	.composer-body::placeholder {
		color: var(--text-3);
	}
	.composer-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
		color: var(--text-3);
	}
	.announcement-filter {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		color: var(--text-3);
	}
	.announcement-filter label {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.announcement-item {
		display: flex;
		gap: 10px;
		padding: 14px 0;
		border-bottom: 1px solid var(--border);
	}
	.announcement-item .avatar {
		width: 30px;
		height: 30px;
		background: #a855f71a;
		color: #a855f7;
	}
	.announcement-item:nth-of-type(3n) .avatar {
		background: #ec48991a;
		color: #ec4899;
	}
	.announcement-text {
		flex: 1;
		min-width: 0;
	}
	.announcement-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-2);
		font-size: 11px;
		line-height: 18px;
	}
	.announcement-meta > .mono {
		font-size: 10px;
		color: var(--text-3);
	}
	.announcement-meta > .text-button {
		margin-left: auto;
		font-size: 10px;
	}
	.announcement-text h3 {
		font-size: 13px;
		font-weight: 600;
		line-height: 22px;
		overflow-wrap: anywhere;
	}
	.announcement-text p {
		font-size: 12px;
		line-height: 20px;
		color: var(--text-2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.announcement-text small {
		font-size: 10px;
	}
	.create-member {
		display: flex;
		gap: 8px;
	}
	.create-member > input {
		flex: 1;
		min-width: 0;
	}
	.create-member > select {
		width: 100px;
	}
	.issued-key {
		background: var(--success-soft);
		border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
		padding: 12px 14px;
		border-radius: 10px;
	}
	.issued-key > div:first-child {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--success);
		font-size: 12px;
	}
	.issued-key strong {
		font-weight: 600;
		color: var(--text-1);
	}
	.issued-key .icon-button {
		margin-left: auto;
		width: 18px;
		height: 18px;
	}
	.key-value {
		background: var(--surface);
		border-radius: 6px;
		margin: 8px 0;
		padding: 7px 10px;
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.key-value code {
		font: 11px var(--mono);
		overflow-wrap: anywhere;
		flex: 1;
		min-width: 0;
		user-select: all;
	}
	.issued-key p {
		font-size: 11px;
		color: var(--text-2);
		line-height: 18px;
	}
	.members-table {
		overflow-x: auto;
		flex-shrink: 0;
	}
	.member-grid {
		display: grid;
		grid-template-columns: minmax(155px, 1.3fr) 75px 64px 160px;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
		font-size: 10px;
		min-width: 548px;
		min-height: 44px;
	}
	.member-grid:last-child {
		border-bottom: 0;
	}
	.table-head {
		color: var(--text-3);
		background: var(--surface);
		font-size: 10px;
		min-height: 34px;
		padding-top: 6px;
		padding-bottom: 6px;
	}
	.member-name-cell {
		display: flex;
		gap: 5px;
		align-items: center;
		min-width: 0;
	}
	.member-name-cell .avatar {
		width: 24px;
		height: 24px;
		font-size: 10px;
	}
	.member-name-cell strong {
		font-weight: 500;
		font-size: 12px;
		max-width: 72px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.member-name-cell .ui-tag {
		font-size: 9px;
		padding: 0 4px;
		line-height: 15px;
	}
	.member-last-seen {
		color: var(--text-3);
		font-size: 10px;
	}
	.member-actions {
		display: flex;
		gap: 7px;
	}
	.member-actions .text-button {
		font-size: 10px;
		white-space: nowrap;
	}
	.revoked {
		opacity: 0.45;
	}
	.revoke-details {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.revoke-details p {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		font-size: 12px;
		line-height: 20px;
	}
	.revoke-details p:last-child {
		font-size: 11px;
		margin-top: 4px;
	}
	@media (max-width: 550px) {
		.service-member,
		.service-updated {
			display: none;
		}
		.service-url {
			flex: 1;
		}
		.reservation-value > strong {
			font-size: 22px;
		}
		.reservation-mode {
			font-size: 10px;
		}
		.reservation-value > .ui-tag {
			display: none;
		}
	}
	.service-address-help {
		margin-top: -8px;
		margin-bottom: 16px;
	}
</style>

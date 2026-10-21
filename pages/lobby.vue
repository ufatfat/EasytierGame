<template>
	<section class="panel-page lobby-page">
		<PanelHeader
			icon="door-open"
			title="房间大厅"
			:subtitle="`${rooms.length} 个公开房间 · 来自协调服务 ${serviceHost}`"
		>
			<button
				class="ui-button primary"
				:disabled="busy || !connected"
				@click="openPublish()"
			>
				<AppIcon
					name="plus"
					:size="14"
				/>
				发布我的房间
			</button>
		</PanelHeader>
		<div class="lobby-toolbar">
			<div class="lobby-search-row">
				<div class="search-field">
					<AppIcon
						name="search"
						:size="14"
					/>
					<input
						v-model="search"
						placeholder="搜索房间标题、游戏或房主"
						aria-label="搜索房间"
					/>
				</div>
				<select
					v-model="sort"
					class="ui-input lobby-sort"
					aria-label="房间排序"
				>
					<option value="latency">延迟最低</option>
					<option value="newest">最新发布</option>
					<option value="members">人数最多</option>
				</select>
				<button
					class="icon-button"
					aria-label="刷新大厅"
					:disabled="busy"
					@click="refresh"
				>
					<AppIcon
						name="refresh"
						:size="14"
					/>
				</button>
			</div>
			<div class="lobby-filters">
				<button
					v-for="game in games"
					:key="game.value"
					class="game-filter"
					:class="{ active: gameFilter === game.value }"
					@click="gameFilter = game.value"
				>
					{{ game.label }}
				</button>
				<label>
					<UiSwitch
						v-model="hasSlot"
						label="只看有空位"
					/>
					只看有空位
				</label>
			</div>
		</div>
		<div class="panel-content lobby-list">
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
				<button
					v-if="!coordinatorUrls().length || !store.coordinator.serviceToken"
					class="text-button"
					@click="openCommunity"
				>
					设置社区服务
				</button>
			</div>
			<div
				v-if="network.connected"
				class="my-room-banner"
			>
				<AppIcon
					name="megaphone"
					:size="16"
				/>
				<span>
					你正在
					<span class="mono">{{ store.config.networkName || "默认房间" }}</span>
					中，发布后好友可在大厅一键加入
				</span>
				<button
					class="text-button"
					@click="openPublish()"
				>
					{{ mine ? "编辑" : "发布" }}
				</button>
			</div>
			<div
				v-if="mine"
				class="published-room-banner surface-card"
			>
				<span>
					<i class="dot text-success" />
					我的房间：{{ mine.title }}
				</span>
				<div>
					<button
						class="text-button"
						:disabled="busy"
						@click="openPublish(mine)"
					>
						编辑
					</button>
					<button
						class="text-button text-danger"
						:disabled="busy"
						@click="unpublish(mine)"
					>
						下架
					</button>
				</div>
			</div>
			<article
				v-for="room in filteredRooms"
				:key="room.id"
				class="lobby-room surface-card"
				:class="{ full: room.member_count >= room.capacity }"
			>
				<img
					v-if="gameArtwork(room.game)"
					:src="gameArtwork(room.game)!"
					alt=""
					width="56"
					height="56"
				/>
				<span
					v-else
					class="generic-cover"
				>
					<AppIcon
						name="gamepad-2"
						:size="25"
					/>
				</span>
				<div class="room-summary">
					<h2>
						{{ room.title }}
						<AppIcon
							v-if="room.password_mode === 'ask'"
							name="lock"
							:size="12"
						/>
						<span
							v-if="room.member_id === me?.id"
							class="ui-tag primary"
						>
							我的
						</span>
					</h2>
					<p>{{ room.game }} · 房主 {{ room.member_name }} · {{ relativeTime(room.created_at) }}</p>
					<div class="room-tags">
						<span
							v-for="tag in room.tags"
							:key="tag"
							class="ui-tag"
						>
							{{ tag }}
						</span>
						<span
							class="room-latency mono"
							:class="{ measured: latencies[room.id] != null }"
						>
							<AppIcon
								name="activity"
								:size="10"
							/>
							{{ latencies[room.id] != null ? `${latencies[room.id]}ms` : isTauri() ? "待测量" : "桌面端测量" }}
						</span>
					</div>
				</div>
				<div class="room-actions">
					<div class="room-capacity">
						<AppIcon
							name="users"
							:size="13"
						/>
						<span class="mono">{{ room.member_count }}/{{ room.capacity }}</span>
					</div>
					<button
						class="ui-button soft small"
						:disabled="room.member_count >= room.capacity || busy"
						@click="openJoin(room)"
					>
						<AppIcon
							v-if="room.member_count < room.capacity"
							name="door-open"
							:size="12"
						/>
						{{ room.member_count >= room.capacity ? "已满" : "加入" }}
					</button>
					<button
						v-if="me?.role === 'admin' && room.member_id !== me.id"
						class="text-button text-danger"
						:disabled="busy"
						@click="unpublish(room)"
					>
						下架
					</button>
				</div>
			</article>
			<div
				v-if="!busy && !filteredRooms.length"
				class="empty-state"
			>
				<AppIcon
					name="door-open"
					:size="32"
				/>
				<p>{{ search || gameFilter || hasSlot ? "没有符合条件的房间" : "暂无公开房间" }}</p>
				<p>联机成功后即可发布，邀请朋友加入</p>
			</div>
		</div>
		<ElDialog
			v-model="publishing"
			:title="editing ? '编辑我的公开房间' : '发布我的房间到大厅'"
			width="440px"
			top="50px"
			:close-on-click-modal="false"
		>
			<div class="publish-form">
				<label class="ui-field">
					<span class="field-label">房间标题</span>
					<input
						v-model="form.title"
						class="ui-input"
						maxlength="24"
						placeholder="例如：今晚 9 点 历战王开荒"
					/>
				</label>
				<div class="form-row">
					<label class="ui-field">
						<span class="field-label">游戏</span>
						<input
							v-model="form.game"
							class="ui-input"
							list="game-options"
							maxlength="40"
							placeholder="选择或输入游戏名"
						/>
						<datalist id="game-options">
							<option
								v-for="game in gameCatalog"
								:key="game.name"
								:value="game.name"
							/>
						</datalist>
					</label>
					<label class="ui-field capacity-field">
						<span class="field-label">人数上限</span>
						<input
							v-model.number="form.capacity"
							type="number"
							class="ui-input mono"
							min="1"
							max="256"
						/>
					</label>
				</div>
				<section class="connection-details surface-card">
					<div class="section-caption">联机信息（取自当前配置，加入者自动填入）</div>
					<dl>
						<dt>服务器</dt>
						<dd class="mono">{{ publishServers.join("\n") }}</dd>
						<dt>房间名</dt>
						<dd class="mono">{{ publishNetwork }}</dd>
						<dt>密码</dt>
						<dd>
							<div
								v-if="!editing"
								class="segmented"
							>
								<button
									:class="{ active: form.password_mode === 'ask' }"
									@click="form.password_mode = 'ask'"
								>
									加入时询问
								</button>
								<button
									:class="{ active: form.password_mode === 'public' }"
									@click="form.password_mode = 'public'"
								>
									直接公开
								</button>
							</div>
							<span v-else>{{ mine?.password_mode === "ask" ? "加入时询问" : "直接公开（保持不变）" }}</span>
						</dd>
					</dl>
				</section>
				<div class="ui-field">
					<span class="field-label">标签（最多 5 个）</span>
					<div class="publish-tags">
						<button
							v-for="tag in knownTags"
							:key="tag"
							class="game-filter"
							:class="{ active: form.tags.includes(tag) }"
							@click="toggleTag(tag)"
						>
							{{ tag }}
						</button>
						<input
							v-model="customTag"
							class="custom-tag-input"
							maxlength="12"
							placeholder="+ 自定义"
							aria-label="自定义房间标签"
							@keydown.enter.prevent="addCustomTag"
							@blur="addCustomTag"
						/>
					</div>
				</div>
				<label class="ui-field">
					<span class="field-label">说明（可选）</span>
					<textarea
						v-model="form.description"
						class="ui-input ui-textarea"
						maxlength="200"
						placeholder="游戏版本、外部联系方式，或你想告诉队友的话…"
					/>
				</label>
				<div class="publish-options">
					<label>
						<UiSwitch
							v-model="form.auto_remove"
							label="停止联机时自动下架"
						/>
						停止联机时自动从大厅下架
					</label>
					<label>
						<UiSwitch
							v-model="form.hide_when_full"
							label="满员自动隐藏"
						/>
						满员后自动隐藏
					</label>
				</div>
				<div
					v-if="formError"
					class="inline-notice error"
					role="alert"
				>
					{{ formError }}
				</div>
			</div>
			<template #footer>
				<span class="publish-visibility">所有连接此协调服务的客户端可见</span>
				<button
					class="ui-button"
					@click="publishing = false"
				>
					取消
				</button>
				<button
					class="ui-button primary ml-2"
					:disabled="busy"
					@click="savePublication"
				>
					{{ editing ? "保存修改" : "发布房间" }}
				</button>
			</template>
		</ElDialog>
		<ElDialog
			:model-value="!!joining"
			width="440px"
			top="95px"
			:show-close="true"
			:close-on-click-modal="false"
			@close="joining = null"
		>
			<template #header>
				<div class="join-room-title">
					<img
						v-if="joining && gameArtwork(joining.game)"
						:src="gameArtwork(joining.game)!"
						width="44"
						height="44"
						alt=""
					/>
					<div>
						<h2>{{ joining?.title }}</h2>
						<p>{{ joining?.game }} · 房主 {{ joining?.member_name }} · {{ joining && relativeTime(joining.created_at) }}发布</p>
					</div>
				</div>
			</template>
			<div
				v-if="joining"
				class="join-details"
			>
				<p class="join-description">{{ joining.description || "房主还没有填写说明" }}</p>
				<section class="connection-details surface-card">
					<dl>
						<dt>房间成员</dt>
						<dd class="mono">{{ joining.member_count }} / {{ joining.capacity }}</dd>
						<dt>服务器</dt>
						<dd class="mono">{{ joining.servers.join("\n") }}</dd>
						<dt>房间名</dt>
						<dd class="mono">{{ joining.network_name }}</dd>
						<dt>预计延迟</dt>
						<dd class="mono">{{ latencies[joining.id] != null ? `${latencies[joining.id]} ms` : "尚未测得" }}</dd>
					</dl>
				</section>
				<label
					v-if="joining.password_mode === 'ask'"
					class="ui-field"
				>
					<span class="field-label">房间密码</span>
					<ElInput
						v-model="joinPassword"
						type="password"
						show-password
						placeholder="向房主获取密码（无密码可留空）"
						maxlength="100"
					/>
				</label>
				<div class="inline-notice">
					<AppIcon
						name="warning"
						:size="14"
					/>
					<span>
						{{
							network.running ? `你正在 ${store.config.networkName || "当前网络"} 中。加入会先停止当前联机，并` : "加入将"
						}}用该房间的服务器、房间名和密码替换当前配置，成员名和 IP 模式保持不变。
					</span>
				</div>
				<label class="join-save">
					<UiSwitch
						v-model="saveConfig"
						label="同时保存为房间配置"
					/>
					同时保存为房间配置，方便下次直接使用
				</label>
				<div
					v-if="formError"
					class="inline-notice error"
					role="alert"
				>
					{{ formError }}
				</div>
			</div>
			<template #footer>
				<button
					class="ui-button"
					@click="joining = null"
				>
					取消
				</button>
				<button
					class="ui-button primary ml-2"
					:disabled="busy"
					@click="joinAndStart"
				>
					<AppIcon
						name="power"
						:size="14"
					/>
					{{ busy ? "正在加入…" : "加入并启动联机" }}
				</button>
			</template>
		</ElDialog>
	</section>
</template>
<script setup lang="ts">
	import { watch, computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
	import { isTauri } from "@tauri-apps/api/core";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import { ElMessage, ElMessageBox } from "element-plus";
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import UiSwitch from "@/components/UiSwitch.vue";
	import useMainStore from "@/stores/index";
	import openWindow, { dataSubscribe } from "@/composables/windows";
	import { useRuntimeNetwork } from "@/composables/runtime";
	import { listRooms, publishRoom, editRoom, removeRoom, networkSnapshot, probeServer, type Room, type NetworkSnapshot } from "@/composables/lobby";
	import { activeCoordinatorUrl, coordinatorUrls, sharedState, type Me } from "@/composables/coordinator";
	import { gameArtwork, gameCatalog } from "@/composables/gameCatalog";
	import { exactPeerUrls, publicationSnapshot } from "@/utils/lobby-domain";
	const store = useMainStore();
	dataSubscribe();
	const rooms = ref<Room[]>([]),
		mine = ref<Room | null>(null),
		me = ref<Me | null>(null),
		error = ref(""),
		busy = ref(false),
		search = ref(""),
		gameFilter = ref(""),
		sort = ref("latency"),
		hasSlot = ref(false);
	const network = ref<NetworkSnapshot>({ running: false, connected: false, members: [] });
	const runtime = useRuntimeNetwork();
	watch(runtime, state => {
		network.value = { running: state.client_running, connected: state.connected, members: state.members };
	});
	const latencies = reactive<Record<string, number | null>>({});
	const connected = computed(() => network.value.connected && !store.configStartEnable);
	const serviceHost = computed(() => {
		try {
			return new URL(activeCoordinatorUrl()).host;
		} catch {
			return "未连接";
		}
	});
	const games = computed(() => [
		{ value: "", label: "全部" },
		...gameCatalog.slice(0, 4).map(game => ({ value: game.name, label: game.short })),
		...Array.from(new Set(rooms.value.map(room => room.game)))
			.filter(name => !gameCatalog.slice(0, 4).some(g => g.name === name))
			.map(name => ({ value: name, label: name }))
	]);
	const filteredRooms = computed(() =>
		rooms.value
			.filter(
				room =>
					(!gameFilter.value || room.game === gameFilter.value) &&
					(!hasSlot.value || room.member_count < room.capacity) &&
					`${room.title} ${room.game} ${room.member_name}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())
			)
			.sort((a, b) =>
				sort.value === "members"
					? b.member_count - a.member_count
					: sort.value === "newest"
						? b.created_at.localeCompare(a.created_at)
						: (latencies[a.id] ?? Infinity) - (latencies[b.id] ?? Infinity) || b.created_at.localeCompare(a.created_at)
			)
	);
	const relativeTime = (time: string) => {
		const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(time)) / 60000));
		return minutes < 1
			? "刚刚"
			: minutes < 60
				? `${minutes} 分钟前`
				: minutes < 1440
					? `${Math.floor(minutes / 60)} 小时前`
					: `${Math.floor(minutes / 1440)} 天前`;
	};
	const openCommunity = () =>
		openWindow("community", { url: "#/community", title: "社区", width: 600, height: 720, minWidth: 520, minHeight: 480 });
	let probing = false,
		disposed = false;
	async function refresh() {
		if (busy.value) return;
		busy.value = true;
		try {
			const [result, state, snapshot] = await Promise.all([listRooms(), sharedState(), networkSnapshot()]);
			if (disposed) return;
			rooms.value = result.rooms;
			mine.value = result.mine;
			me.value = state.me;
			network.value = snapshot;
			error.value = "";
			if (!probing) {
				probing = true;
				void measure(result.rooms).finally(() => {
					probing = false;
				});
			}
		} catch (e) {
			error.value = String(e instanceof Error ? e.message : e);
		} finally {
			busy.value = false;
		}
	}
	async function measure(items: Room[]) {
		const unique = [...new Set(items.map(r => r.servers.find(url => /^(tcp|ws|wss):\/\//.test(url))))].filter(Boolean) as string[];
		const values: Record<string, number | null> = {};
		for (let i = 0; i < unique.length && !disposed; i += 4)
			await Promise.all(
				unique.slice(i, i + 4).map(async server => {
					try {
						values[server] = await probeServer(server);
					} catch {
						values[server] = null;
					}
				})
			);
		if (disposed) return;
		for (const room of items) {
			const server = room.servers.find(url => url in values);
			latencies[room.id] = server ? values[server] : null;
		}
	}
	const publishing = ref(false),
		editing = ref(false),
		formError = ref(""),
		customTag = ref("");
	const publishServers = ref<string[]>([]),
		publishNetwork = ref("");
	const knownTags = computed(() => [...new Set(["语音", "新手友好", "休闲", "硬核", "长期", ...form.tags])]);
	const form = reactive({
		title: "",
		game: "怪物猎人：世界",
		capacity: 4,
		tags: [] as string[],
		description: "",
		password_mode: "ask" as "ask" | "public",
		auto_remove: true,
		hide_when_full: false
	});
	function toggleTag(tag: string) {
		if (form.tags.includes(tag)) form.tags = form.tags.filter(t => t !== tag);
		else if (form.tags.length < 5) form.tags.push(tag);
		else formError.value = "最多选择 5 个标签";
	}
	function addCustomTag() {
		const tag = customTag.value.trim();
		if (tag && !form.tags.includes(tag)) toggleTag(tag);
		customTag.value = "";
	}
	async function openPublish(room?: Room) {
		formError.value = "";
		try {
			network.value = await networkSnapshot();
			if (!network.value.connected) throw new Error("请先在主窗口联机成功后再发布房间");
			if (store.configStartEnable) throw new Error("使用外部配置文件时无法确认联机信息，请先切换到界面配置");
			editing.value = !!room;
			Object.assign(
				form,
				room
					? {
							title: room.title,
							game: room.game,
							capacity: room.capacity,
							tags: [...room.tags],
							description: room.description,
							password_mode: room.password_mode,
							auto_remove: room.auto_remove,
							hide_when_full: room.hide_when_full
						}
					: {
							title: "",
							game: "怪物猎人：世界",
							capacity: 4,
							tags: [],
							description: "",
							password_mode: "ask",
							auto_remove: true,
							hide_when_full: false
						}
			);
			publishServers.value = room?.servers || exactPeerUrls(store.config);
			publishNetwork.value = room?.network_name || store.config.networkName;
			publishing.value = true;
		} catch (e) {
			ElMessage.warning(String(e instanceof Error ? e.message : e));
		}
	}
	async function savePublication() {
		if (busy.value) return;
		busy.value = true;
		formError.value = "";
		try {
			const snapshot = await networkSnapshot();
			if (!snapshot.connected) throw new Error("联机已断开，请重新联机后发布");
			if (
				!editing.value &&
				(publishNetwork.value !== store.config.networkName ||
					JSON.stringify(publishServers.value) !== JSON.stringify(exactPeerUrls(store.config)))
			)
				throw new Error("联机配置已变化，请关闭弹窗后重新发布");
			const connectionSnapshot = publicationSnapshot(store.config);
			const result =
				editing.value && mine.value
					? await editRoom(mine.value.id, {
							title: form.title,
							game: form.game,
							capacity: form.capacity,
							tags: form.tags,
							description: form.description,
							auto_remove: form.auto_remove,
							hide_when_full: form.hide_when_full
						})
					: await publishRoom({
							...form,
							servers: publishServers.value,
							network_name: publishNetwork.value,
							member_count: Math.max(1, snapshot.members.filter(p => p.ipv4 && p.ipv4 !== "-").length),
							...(form.password_mode === "public" ? { password: store.config.networkPassword } : {})
						});
			if (!editing.value || store.lobby.roomId === result.id) {
				store.lobby.roomId = result.id;
				store.lobby.autoRemove = result.auto_remove;
				store.lobby.hideWhenFull = result.hide_when_full;
				if (!editing.value) store.lobby.connectionSnapshot = connectionSnapshot;
			}
			mine.value = result;
			publishing.value = false;
			ElMessage.success(editing.value ? "房间已更新" : "房间已发布");
		} catch (e) {
			formError.value = String(e instanceof Error ? e.message : e);
		} finally {
			busy.value = false;
			if (!publishing.value) void refresh();
		}
	}
	async function unpublish(room: Room) {
		try {
			await ElMessageBox.confirm(`下架“${room.title}”？已建立的 EasyTier 联机不会被断开。`, "下架房间", { type: "warning" });
			await removeRoom(room.id);
			if (store.lobby.roomId === room.id) store.lobby.roomId = "";
			await refresh();
		} catch (e) {
			if (e !== "cancel" && e !== "close") error.value = String(e);
		}
	}
	const joining = ref<Room | null>(null),
		joinPassword = ref(""),
		saveConfig = ref(true);
	function openJoin(room: Room) {
		if (room.member_count >= room.capacity) return;
		joining.value = room;
		joinPassword.value = "";
		formError.value = "";
		saveConfig.value = true;
	}
	let joinUnlisten: UnlistenFn | undefined, joinTimeout: ReturnType<typeof setTimeout> | undefined;
	function cleanJoinListener() {
		clearTimeout(joinTimeout);
		joinUnlisten?.();
		joinUnlisten = undefined;
	}
	async function joinAndStart() {
		if (!joining.value || busy.value) return;
		if (!isTauri()) {
			formError.value = "请在桌面客户端中加入房间并启动联机";
			return;
		}
		busy.value = true;
		formError.value = "";
		try {
			const window = getCurrentWindow(),
				requestId = crypto.randomUUID(),
				roomId = joining.value.id;
			let resolveResult: () => void, rejectResult: (error: Error) => void;
			const result = new Promise<void>((resolve, reject) => {
				resolveResult = resolve;
				rejectResult = reject;
			});
			joinUnlisten = await listen<{ requestId: string; error?: string }>("lobby-join-result", event => {
				if (event.payload.requestId !== requestId) return;
				cleanJoinListener();
				event.payload.error ? rejectResult(new Error(event.payload.error)) : resolveResult();
			});
			joinTimeout = setTimeout(() => {
				cleanJoinListener();
				rejectResult(new Error("主窗口未响应，请检查主窗口或系统授权提示"));
			}, 120000);
			// Attach the rejection handler before dispatch so an immediate response cannot be unhandled.
			const completed = result.then(
				() => null,
				error => error as Error
			);
			try {
				await window.emitTo("main", "lobby-join", {
					requestId,
					replyTo: window.label,
					roomId,
					password: joinPassword.value,
					saveConfig: saveConfig.value
				});
			} catch (error) {
				cleanJoinListener();
				throw error;
			}
			const error = await completed;
			if (error) throw error;
			joining.value = null;
			joinPassword.value = "";
			ElMessage.success("已应用房间配置并开始联机");
		} catch (e) {
			formError.value = String(e instanceof Error ? e.message : e);
		} finally {
			cleanJoinListener();
			busy.value = false;
		}
	}
	let timer: ReturnType<typeof setInterval> | undefined;
	onMounted(() => {
		void refresh();
		timer = setInterval(refresh, 15000);
	});
	onBeforeUnmount(() => {
		disposed = true;
		clearInterval(timer);
		cleanJoinListener();
	});
</script>
<style scoped>
	.lobby-toolbar {
		padding: 12px 20px 8px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.lobby-search-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.search-field {
		height: 34px;
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0 10px;
		min-width: 0;
		color: var(--text-3);
	}
	.search-field input {
		border: 0;
		outline: none;
		background: transparent;
		width: 100%;
		font-size: 12px;
		color: var(--text-1);
	}
	.search-field input::placeholder {
		color: var(--text-3);
	}
	.lobby-sort {
		width: 106px;
		height: 32px;
		font-size: 11px;
		padding: 0 8px;
	}
	.lobby-filters {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.game-filter {
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface-2);
		padding: 4px 9px;
		font-size: 10px;
		color: var(--text-2);
		line-height: 16px;
	}
	.game-filter.active {
		background: var(--primary);
		border-color: var(--primary);
		color: #fff;
	}
	.lobby-filters label {
		margin-left: auto;
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 11px;
		color: var(--text-3);
		white-space: nowrap;
	}
	.lobby-list {
		padding-top: 4px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.my-room-banner {
		background: var(--primary-soft);
		border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
		border-radius: 10px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		font-size: 11px;
	}
	.my-room-banner > .app-icon {
		color: var(--primary);
	}
	.my-room-banner > span {
		flex: 1;
	}
	.published-room-banner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		font-size: 11px;
	}
	.published-room-banner > div {
		display: flex;
		gap: 12px;
	}
	.lobby-room {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		min-height: 85px;
		flex-shrink: 0;
	}
	.lobby-room.full {
		opacity: 0.6;
	}
	.lobby-room > img {
		width: 56px;
		height: 56px;
		border-radius: 8px;
		object-fit: cover;
	}
	.generic-cover {
		width: 56px;
		height: 56px;
		border-radius: 8px;
		background: var(--surface-3);
		color: var(--text-2);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.room-summary {
		flex: 1;
		min-width: 0;
	}
	.room-summary h2 {
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 5px;
		line-height: 20px;
		overflow-wrap: anywhere;
	}
	.room-summary h2 > .app-icon {
		color: var(--text-3);
	}
	.room-summary p {
		font-size: 10px;
		color: var(--text-3);
		line-height: 18px;
	}
	.room-tags {
		display: flex;
		gap: 4px;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 3px;
	}
	.room-tags .ui-tag {
		font-size: 9px;
		line-height: 14px;
		padding: 0 5px;
	}
	.room-latency {
		font-size: 9px;
		color: var(--text-3);
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.room-latency.measured {
		color: var(--success);
	}
	.room-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 7px;
	}
	.room-capacity {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text-2);
		font-size: 11px;
	}
	.room-capacity > .app-icon {
		color: var(--primary);
	}
	.room-actions .ui-button {
		font-size: 11px;
		height: 26px;
	}
	.room-actions > .text-button {
		font-size: 10px;
	}
	.publish-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.capacity-field {
		max-width: 105px;
	}
	.connection-details {
		padding: 12px;
		background: var(--surface-2);
	}
	.connection-details dl {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 9px 12px;
		margin: 10px 0 0;
		font-size: 11px;
	}
	.connection-details dt {
		color: var(--text-3);
	}
	.connection-details dd {
		margin: 0;
		color: var(--text-2);
		overflow-wrap: anywhere;
		white-space: pre-wrap;
		min-width: 0;
		font-size: 11px;
	}
	.publish-tags {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.custom-tag-input {
		width: 80px;
		background: transparent;
		border: 0;
		font-size: 11px;
		color: var(--text-2);
		outline: none;
	}
	.publish-options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.publish-options label,
	.join-save {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}
	.publish-visibility {
		font-size: 10px;
		color: var(--text-3);
		margin-right: auto;
		float: left;
		padding-top: 7px;
	}
	.join-room-title {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.join-room-title img {
		border-radius: 8px;
	}
	.join-room-title h2 {
		font-size: 16px;
		font-weight: 700;
		line-height: 25px;
	}
	.join-room-title p {
		font-size: 11px;
		color: var(--text-3);
		line-height: 18px;
	}
	.join-details {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.join-description {
		font-size: 12px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.join-details .connection-details dl {
		margin: 0;
	}
	.join-save {
		font-size: 11px;
	}
	@media (max-width: 550px) {
		.lobby-filters {
			gap: 4px;
		}
		.game-filter {
			padding: 3px 7px;
		}
		.lobby-room {
			gap: 8px;
		}
		.room-summary p {
			font-size: 9px;
		}
		.my-room-banner {
			font-size: 10px;
		}
		.publish-visibility {
			display: none;
		}
	}
</style>

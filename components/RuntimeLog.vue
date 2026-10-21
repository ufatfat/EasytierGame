<template>
	<section
		class="runtime-log"
		:class="{ embedded }"
	>
		<div class="section-toolbar log-toolbar">
			<div class="segmented">
				<button
					v-for="item in ['全部', 'INFO', 'WARN', 'ERROR']"
					:key="item"
					:class="{ active: level === item }"
					@click="level = item"
				>
					{{ item }}
				</button>
			</div>
			<label class="log-search">
				<AppIcon
					name="search"
					:size="13"
				/>
				<input
					v-model="keyword"
					placeholder="搜索日志…"
					aria-label="搜索日志"
				/>
			</label>
			<button
				class="icon-button"
				:class="{ active: following }"
				:aria-pressed="following"
				aria-label="自动跟随最新日志"
				@click="
					following = !following;
					scrollToBottom();
				"
			>
				<AppIcon
					name="download"
					:size="15"
				/>
			</button>
			<button
				class="icon-button"
				aria-label="复制日志"
				@click="copyText(filtered.map(line => line.text).join('\n'))"
			>
				<AppIcon
					name="copy"
					:size="15"
				/>
			</button>
			<button
				class="icon-button"
				aria-label="清空当前日志"
				@click="clearLog"
			>
				<AppIcon
					name="trash"
					:size="15"
				/>
			</button>
		</div>
		<div
			ref="viewport"
			class="log-console"
			@scroll="onScroll"
		>
			<p
				v-if="!filtered.length"
				class="empty-state"
			>
				{{ entries.length ? "没有符合条件的日志" : stream === "server" ? "等待日志，请先启动服务器…" : "等待日志，请先在主窗口启动联机…" }}
			</p>
			<div
				v-else
				class="log-spacer"
				:style="{ height: filtered.length * LOG_ROW_HEIGHT + 'px' }"
			>
				<div
					class="log-visible"
					:style="{ transform: `translateY(${range.start * LOG_ROW_HEIGHT}px)` }"
				>
					<div
						v-for="line in visibleLines"
						:key="`${buffer.generation}-${line.id}`"
						class="log-line"
						:class="line.level.toLowerCase()"
					>
						<span class="log-line-number mono">{{ line.id }}</span>
						<span class="log-level mono">{{ line.level }}</span>
						<span class="log-line-text mono">{{ line.text }}</span>
					</div>
				</div>
			</div>
		</div>
		<footer class="log-status">
			<span>
				共 {{ entries.length.toLocaleString() }} 行
				<span v-if="filtered.length !== entries.length">· 筛选后 {{ filtered.length }} 行</span>
			</span>
			<span
				v-if="stream === 'client'"
				class="ml-auto"
			>
				输出到本地：{{ store.config.saveErrorLog ? "已开启" : "未开启" }}
			</span>
			<span
				v-else
				class="ml-auto"
			>
				内存缓存 · 最多 5,000 行
			</span>
			<button
				v-if="stream === 'client'"
				class="text-button"
				@click="openLogs"
			>
				打开日志目录
			</button>
		</footer>
	</section>
</template>
<script setup lang="ts">
	import { computed, shallowRef, ref, nextTick, watch, onMounted, onBeforeUnmount, useTemplateRef } from "vue";
	import { invoke, isTauri } from "@tauri-apps/api/core";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import { join } from "@tauri-apps/api/path";
	import AppIcon from "./AppIcon.vue";
	import useMainStore from "@/stores";
	import { copyText } from "@/utils";
	import { getDataDir, openFolder } from "@/composables/platform";
	import { LogBuffer, LOG_ROW_HEIGHT, virtualLogRange, type LogPacket } from "@/utils/log-buffer";
	const { stream = "client", embedded = false } = defineProps<{ stream?: "client" | "server"; embedded?: boolean }>();
	const store = useMainStore(),
		buffer = new LogBuffer(),
		entries = shallowRef(buffer.lines),
		level = ref("全部"),
		keyword = ref(""),
		following = ref(true),
		top = ref(0),
		height = ref(400);
	const viewport = useTemplateRef<HTMLDivElement>("viewport");
	const filtered = computed(() => {
		const query = keyword.value.toLocaleLowerCase();
		return entries.value.filter(line => (level.value === "全部" || line.level === level.value) && (!query || line.search.includes(query)));
	});
	const range = computed(() => virtualLogRange(filtered.value.length, top.value, height.value));
	const visibleLines = computed(() => filtered.value.slice(range.value.start, range.value.end));
	async function scrollToBottom() {
		if (!following.value) return;
		await nextTick();
		if (viewport.value) {
			viewport.value.scrollTop = viewport.value.scrollHeight;
			top.value = viewport.value.scrollTop;
		}
	}
	function onScroll() {
		if (!viewport.value) return;
		top.value = viewport.value.scrollTop;
		following.value = top.value + viewport.value.clientHeight >= viewport.value.scrollHeight - 8;
	}
	function receive(packet: LogPacket) {
		if (packet.stream !== stream) return;
		const previousGeneration = buffer.generation,
			anchor = following.value ? undefined : filtered.value[Math.floor(top.value / LOG_ROW_HEIGHT)]?.id,
			offset = top.value % LOG_ROW_HEIGHT;
		if (buffer.merge(packet)) {
			entries.value = [...buffer.lines];
			if (!following.value) {
				const index = anchor === undefined ? -1 : filtered.value.findIndex(line => line.id === anchor);
				if (index >= 0 || buffer.generation !== previousGeneration) {
					top.value = index >= 0 ? index * LOG_ROW_HEIGHT + offset : 0;
					void nextTick(() => {
						if (viewport.value) viewport.value.scrollTop = top.value;
					});
				}
			}
			void scrollToBottom();
		}
	}
	function clearLog() {
		buffer.clear();
		entries.value = [];
		top.value = 0;
	}
	async function openLogs() {
		if (isTauri()) await openFolder(await join(await getDataDir(), import.meta.env.VITE_LOG_PATH));
	}
	let unlisten: UnlistenFn | undefined,
		observer: ResizeObserver | undefined,
		disposed = false;
	// Serialize subscription transitions so a late enable cannot outlive hide/unmount.
	let transitions = Promise.resolve();
	function subscribe() {
		transitions = transitions.catch(console.error).then(async () => {
			unlisten?.();
			unlisten = undefined;
			if (!isTauri()) return;
			const enabled = !disposed && document.visibilityState !== "hidden";
			if (enabled) {
				unlisten = await listen<LogPacket>("runtime-log-batch", event => {
					if (!disposed) receive(event.payload);
				});
			}
			await invoke("set_runtime_subscription", { topic: `log-${stream}`, enabled });
			if (enabled && !disposed) {
				const snapshot = await invoke<LogPacket>("get_log_snapshot", { stream });
				if (!disposed) receive(snapshot);
			}
		});
		return transitions;
	}
	onMounted(() => {
		observer = new ResizeObserver(([entry]) => {
			height.value = entry.contentRect.height;
		});
		if (viewport.value) observer.observe(viewport.value);
		document.addEventListener("visibilitychange", visibility);
		window.addEventListener("etg:window-visible", visibility);
		void subscribe().catch(console.error);
	});
	function visibility() {
		void subscribe().catch(console.error);
	}
	onBeforeUnmount(() => {
		disposed = true;
		observer?.disconnect();
		unlisten?.();
		document.removeEventListener("visibilitychange", visibility);
		window.removeEventListener("etg:window-visible", visibility);
		void subscribe().catch(console.error);
	});
	watch([level, keyword], () => {
		top.value = 0;
		void nextTick(() => {
			if (viewport.value) viewport.value.scrollTop = 0;
		});
		following.value = false;
	});
</script>
<style scoped>
	.runtime-log {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.runtime-log.embedded {
		height: 280px;
		flex: none;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.log-toolbar {
		gap: 8px;
		padding-top: 10px;
		padding-bottom: 10px;
		min-height: 48px;
	}
	.log-search {
		display: flex;
		gap: 6px;
		align-items: center;
		flex: 1;
		min-width: 60px;
		height: 28px;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0 8px;
		background: var(--surface-2);
		color: var(--text-3);
	}
	.log-search > input {
		width: 100%;
		min-width: 0;
		background: transparent;
		outline: 0;
		border: 0;
		color: var(--text-1);
		font-size: 11px;
	}
	.log-toolbar > .icon-button {
		background: var(--surface-2);
	}
	.log-toolbar > .icon-button.active {
		background: var(--primary-soft);
		color: var(--primary);
	}
	.log-console {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: var(--console-bg);
		border-top: 1px solid var(--border);
		padding: 12px 20px;
		position: relative;
	}
	.log-spacer {
		position: relative;
		min-width: 100%;
	}
	.log-visible {
		position: absolute;
		top: 0;
		left: 0;
		min-width: 100%;
	}
	.log-line {
		display: flex;
		gap: 10px;
		line-height: 22px;
		height: 22px;
		font-size: 11px;
		align-items: center;
		width: max-content;
		min-width: 100%;
		contain: layout style;
	}
	.log-line-number {
		width: 38px;
		flex-shrink: 0;
		font-size: 10px;
		color: var(--text-3);
		text-align: right;
	}
	.log-level {
		font-size: 10px;
		color: var(--text-3);
		width: 36px;
		flex-shrink: 0;
	}
	.log-line-text {
		white-space: pre;
		font-size: 11px;
		color: var(--text-2);
	}
	.log-line.error {
		background: var(--danger-soft);
		border-radius: 4px;
	}
	.error .log-line-text,
	.error .log-level {
		color: var(--danger);
	}
	.warn .log-level,
	.warn .log-line-text {
		color: var(--warning);
	}
	.info .log-level {
		color: var(--success);
	}
	.log-status {
		height: 30px;
		min-height: 30px;
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 0 20px;
		border-top: 1px solid var(--border);
		font-size: 10px;
		color: var(--text-3);
	}
	.log-status .text-button {
		font-size: 10px;
	}
	@media (max-width: 550px) {
		.log-toolbar {
			gap: 4px;
		}
		.segmented button {
			padding: 0 5px;
		}
		.log-status {
			gap: 8px;
		}
	}
</style>

import { shallowRef, onMounted, onBeforeUnmount } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export type RuntimeSnapshot = {
	revision: number;
	client_running: boolean;
	server_running: boolean;
	connected: boolean;
	members: Member[];
	connections: ConnectionsType[];
	proxies: Proxy[];
	routes: any[];
};
const state = shallowRef<RuntimeSnapshot>({
	revision: 0,
	client_running: false,
	server_running: false,
	connected: false,
	members: [],
	connections: [],
	proxies: [],
	routes: []
});
const topics = new Map<string, number>();
let initialized: Promise<void> | undefined;
const transitions = new Map<string, Promise<unknown>>();
function syncTopic(topic: string) {
	const next = (transitions.get(topic) || Promise.resolve()).catch(console.error).then(() => {
		if (isTauri()) return invoke("set_runtime_subscription", { topic, enabled: !!topics.get(topic) && document.visibilityState !== "hidden" });
	});
	transitions.set(topic, next);
	return next;
}
export async function refreshRuntimeNetwork() {
	if (isTauri()) await refresh(true);
}
async function refresh(force = false) {
	if (!isTauri()) return;
	const next = await invoke<RuntimeSnapshot>("get_runtime_snapshot", { refresh: force });
	if (next.revision >= state.value.revision) state.value = next;
}
async function initialize() {
	if (!initialized)
		initialized = (async () => {
			await listen<RuntimeSnapshot>("runtime-snapshot", event => {
				if (event.payload.revision >= state.value.revision) state.value = event.payload;
			});
			const visible = () => {
				for (const topic of topics.keys()) void syncTopic(topic).catch(console.error);
				if (document.visibilityState !== "hidden") void refresh(true).catch(console.error);
			};
			document.addEventListener("visibilitychange", visible);
			window.addEventListener("etg:window-visible", visible);
			await refresh().catch(console.error);
		})().catch(error => {
			initialized = undefined;
			throw error;
		});
	return initialized;
}
export function useRuntimeNetwork(topic: "network" | "members" | "routes" = "network") {
	let active = false;
	onMounted(async () => {
		if (!isTauri()) return;
		active = true;
		topics.set(topic, (topics.get(topic) || 0) + 1);
		try {
			await initialize();
			if (active) {
				await syncTopic(topic);
				await refresh();
			}
		} catch (error) {
			console.error(error);
		}
	});
	onBeforeUnmount(() => {
		if (!active) return;
		active = false;
		const count = (topics.get(topic) || 1) - 1;
		topics.set(topic, count);
		void syncTopic(topic).catch(console.error);
		if (!count) topics.delete(topic);
	});
	return state;
}

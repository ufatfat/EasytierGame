import { invoke, isTauri } from "@tauri-apps/api/core";
import { configuredCoordinatorUrls, requestWithCoordinatorFailover, type CoordinatorOperation } from "@/utils/coordinator-failover";
import useMainStore from "@/stores/index";

export type Role = "member" | "admin";
export type Me = { id: string; name: string; role: Role };
export type Claim = { client_id: string; ip: string; hostname: string; updated_at: string; member_id: string | null; member_name: string | null };
export type Announcement = {
	id: string;
	client_id: string;
	hostname: string;
	title: string;
	content: string;
	created_at: string;
	member_id: string | null;
	member_name: string | null;
};
export type SharedState = { clientId: string; pool: string; prefix: number; me: Me; claims: Claim[]; announcements: Announcement[] };
export type Member = Me & {
	created_at: string;
	last_seen_at: string | null;
	revoked_at: string | null;
	claim_count: number;
	announcement_count: number;
};
export type IssuedKey = { member: Me; key: string };
export type RegisteredIp = { ip: string; prefix: number; clientId: string };

function clientToken() {
	const store = useMainStore();
	if (!store.coordinator.clientToken) {
		store.coordinator.clientToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
		store.$persist();
	}
	return store.coordinator.clientToken;
}
export async function coordinatorRequest<T>(endpoint: string, method = "GET", body?: unknown): Promise<T> {
	const store = useMainStore(),
		urls = configuredCoordinatorUrls(store.coordinator);
	if (!urls.length || !store.coordinator.serviceToken.trim()) throw new Error("请先设置协调服务地址和个人访问密钥");
	const token = store.coordinator.serviceToken.trim(),
		device = clientToken();
	const configuration = JSON.stringify([urls, token]);
	const transport = async (base_url: string, operation: CoordinatorOperation) => {
		const request = { base_url, service_token: token, client_token: device, ...operation, body: operation.body ?? null };
		if (isTauri()) return invoke("coordinator_request", request);
		if (!import.meta.env.DEV) throw new Error("请在桌面客户端使用协调服务");
		let response: Response;
		try {
			response = await fetch("/__coordinator", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(request)
			});
		} catch {
			throw { message: "无法连接本地开发代理", retryable: false, replay_safe: false };
		}
		const result = await response.json();
		if (!response.ok) throw result.data?.failure || new Error(result.data?.error || result.statusMessage || "无法连接协调服务");
		return result;
	};
	return requestWithCoordinatorFailover<T>(urls, store.coordinator.activeUrl, { endpoint, method, body }, transport, url => {
		// An in-flight request must not overwrite a service or key edited in another window.
		let current: string;
		try {
			current = JSON.stringify([configuredCoordinatorUrls(store.coordinator), store.coordinator.serviceToken.trim()]);
		} catch {
			return;
		}
		if (current === configuration) store.coordinator.activeUrl = url;
	});
}
export const coordinatorUrls = () => {
	try {
		return configuredCoordinatorUrls(useMainStore().coordinator);
	} catch {
		return [];
	}
};
export const activeCoordinatorUrl = () => {
	const config = useMainStore().coordinator,
		urls = coordinatorUrls();
	return urls.includes(config.activeUrl) ? config.activeUrl : urls[0] || "";
};
export const sharedState = (mineOnly = false) => coordinatorRequest<SharedState>(mineOnly ? "/v1/state/mine" : "/v1/state");
export const listMembers = () => coordinatorRequest<{ members: Member[] }>("/v1/admin/members").then(r => r.members);
export const createMember = (name: string, role: Role) => coordinatorRequest<IssuedKey>("/v1/admin/members", "POST", { name, role });
export const resetMemberKey = (id: string) => coordinatorRequest<IssuedKey>(`/v1/admin/members/${id}/key`, "POST");
export const setMemberRole = (id: string, role: Role) => coordinatorRequest(`/v1/admin/members/${id}`, "PATCH", { role });
export const revokeMember = (id: string) => coordinatorRequest(`/v1/admin/members/${id}`, "DELETE");
export const adminReleaseIp = (ip: string) => coordinatorRequest(`/v1/admin/claims/${ip}`, "DELETE");
export async function registerIp(ip: string) {
	const store = useMainStore();
	if (!store.config.hostname.trim()) throw new Error("请先填写主机名");
	return coordinatorRequest<RegisteredIp>("/v1/claim", "PUT", { ip: ip.trim(), hostname: store.config.hostname.trim() });
}

// The reservation is checked again at every managed fixed-IP launch, including reconnects.
export async function registeredAddress(): Promise<string | null> {
	const store = useMainStore();
	if (!store.coordinator.useRegisteredIp) return null;
	if (store.configStartEnable) throw new Error("已启用登记的固定 IP，请关闭“使用外部配置文件”后联机");
	const state = await sharedState();
	const mine = state.claims.find(claim => claim.client_id === state.clientId);
	if (!mine) throw new Error("当前客户端没有登记的 IP，请先在“全局 IP / 公告”中登记");
	const result = await registerIp(mine.ip);
	store.config.dhcp = false;
	store.config.ipv4 = result.ip;
	return `${result.ip}/${result.prefix}`;
}

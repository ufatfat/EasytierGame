export type CoordinatorConfig = { url?: string; urls?: string[]; activeUrl?: string };
export type CoordinatorOperation = { endpoint: string; method: string; body?: unknown };
export type CoordinatorTransportFailure = { message: string; retryable: boolean; replay_safe: boolean };
export const MAX_COORDINATOR_URLS = 5;

export function normalizeCoordinatorUrls(input: string | string[]): string[] {
	const entries = (typeof input === "string" ? input.split(/\r?\n/) : input).map(value => value.trim()).filter(Boolean);
	const urls = [
		...new Set(
			entries.map(value => {
				let url: URL;
				try {
					url = new URL(value);
				} catch {
					throw new Error("协调服务地址无效，请每行填写一个完整的 HTTPS 地址");
				}
				const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
				if (!(url.protocol === "https:" || (url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash)
					throw new Error("协调服务须使用 HTTPS；本机调试可使用 HTTP。地址不能包含账号、密码、查询参数或片段");
				return url.toString().replace(/\/+$/, "");
			})
		)
	];
	if (urls.length > MAX_COORDINATOR_URLS) throw new Error(`最多配置 ${MAX_COORDINATOR_URLS} 个协调服务地址`);
	return urls;
}
export function configuredCoordinatorUrls(config: CoordinatorConfig): string[] {
	return normalizeCoordinatorUrls(config.urls?.some(url => url.trim()) ? config.urls : config.url || "");
}
export function coordinatorFailure(error: unknown): CoordinatorTransportFailure {
	if (error && typeof error === "object" && "retryable" in error && "replay_safe" in error) {
		const failure = error as CoordinatorTransportFailure;
		return {
			message: typeof failure.message === "string" ? failure.message : "协调服务请求失败",
			retryable: failure.retryable === true,
			replay_safe: failure.replay_safe === true
		};
	}
	return {
		message: error instanceof Error ? error.message : typeof error === "string" ? error : "协调服务请求失败",
		retryable: false,
		replay_safe: false
	};
}

// Each address is attempted once. Only reads or writes known not to have been sent may be replayed.
export async function requestWithCoordinatorFailover<T>(
	urls: string[],
	preferred: string | undefined,
	operation: CoordinatorOperation,
	transport: (url: string, operation: CoordinatorOperation) => Promise<unknown>,
	onConnected: (url: string) => void
): Promise<T> {
	const ordered = preferred && urls.includes(preferred) ? [preferred, ...urls.filter(url => url !== preferred)] : [...urls];
	if (!ordered.length) throw new Error("请先设置协调服务地址和个人访问密钥");
	for (let i = 0; i < ordered.length; i++) {
		try {
			const result = await transport(ordered[i], operation);
			onConnected(ordered[i]);
			return result as T;
		} catch (error) {
			const failure = coordinatorFailure(error);
			if (!failure.retryable) throw new Error(failure.message);
			if (operation.method !== "GET" && !failure.replay_safe) {
				// Restore the connection via a read; never repeat an ambiguous mutation (especially one-time keys).
				let switched = false;
				if (i + 1 < ordered.length) {
					try {
						await requestWithCoordinatorFailover(
							ordered.slice(i + 1),
							undefined,
							{ endpoint: "/v1/state", method: "GET" },
							transport,
							url => {
								switched = true;
								onConnected(url);
							}
						);
					} catch {}
				}
				throw new Error(`${failure.message}。操作结果未确认，未重复提交；${switched ? "已连接备用地址，" : "请稍后"}刷新确认后再操作`);
			}
			if (i === ordered.length - 1) throw new Error(`所有协调服务地址均连接失败（已尝试 ${ordered.length} 个），请检查网络或稍后重试`);
		}
	}
	throw new Error("无法连接协调服务");
}

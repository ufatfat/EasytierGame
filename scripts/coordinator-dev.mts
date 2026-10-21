// This middleware is only installed on Vite's development server, never in desktop bundles.
import type { IncomingMessage, ServerResponse } from "node:http";
class BridgeError extends Error {
	status: number;
	data?: unknown;
	constructor(status: number, message: string, data?: unknown) {
		super(message);
		this.status = status;
		this.data = data;
	}
}
const unavailable = (message: string, replay_safe = false) => new BridgeError(502, message, { failure: { message, retryable: true, replay_safe } });
export async function coordinatorDevMiddleware(req: IncomingMessage, res: ServerResponse) {
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	try {
		if (req.method !== "POST") throw new BridgeError(405, "Method not allowed");
		const chunks: Buffer[] = [];
		let size = 0;
		for await (const chunk of req) {
			size += chunk.length;
			if (size > 16384) throw new BridgeError(413, "Request too large");
			chunks.push(Buffer.from(chunk));
		}
		let input: any;
		try {
			input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		} catch {
			throw new BridgeError(400, "Invalid JSON");
		}
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new BridgeError(400, "Invalid request");
		const endpoint = String(input.endpoint || ""),
			method = String(input.method || "GET"),
			id = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
		const allowed =
			(method === "GET" && ["/v1/state", "/v1/state/mine", "/v1/admin/members", "/v1/rooms"].includes(endpoint)) ||
			(method === "POST" && ["/v1/announcements", "/v1/admin/members", "/v1/rooms"].includes(endpoint)) ||
			(["PUT", "DELETE"].includes(method) && endpoint === "/v1/claim") ||
			(method === "DELETE" && new RegExp(`^/v1/announcements/${id}$`).test(endpoint)) ||
			(["PATCH", "DELETE"].includes(method) && new RegExp(`^/v1/admin/members/${id}$`).test(endpoint)) ||
			(method === "POST" && new RegExp(`^/v1/admin/members/${id}/key$`).test(endpoint)) ||
			(method === "DELETE" && /^\/v1\/admin\/claims\/\d+\.\d+\.\d+\.\d+$/.test(endpoint)) ||
			(["PATCH", "DELETE"].includes(method) && new RegExp(`^/v1/rooms/${id}$`).test(endpoint)) ||
			(method === "PUT" && new RegExp(`^/v1/rooms/${id}/heartbeat$`).test(endpoint)) ||
			(method === "GET" && new RegExp(`^/v1/rooms/${id}/connection$`).test(endpoint));
		if (!allowed) throw new BridgeError(400, "Unsupported endpoint");
		let url: URL;
		try {
			url = new URL(input.base_url);
		} catch {
			throw new BridgeError(400, "Invalid URL");
		}
		if (
			!(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
			url.username ||
			url.password
		)
			throw new BridgeError(400, "HTTPS or loopback required");
		url.pathname = url.pathname.replace(/\/$/, "") + endpoint;
		url.search = "";
		url.hash = "";
		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers: { authorization: `Bearer ${input.service_token}`, "x-client-token": input.client_token, "content-type": "application/json" },
				body: input.body == null ? undefined : JSON.stringify(input.body),
				redirect: "manual",
				signal: AbortSignal.timeout(8000)
			});
		} catch (error) {
			const code = (error as { cause?: { code?: string } })?.cause?.code;
			throw unavailable(
				"无法连接协调服务，请检查地址和网络",
				!!code && ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(code)
			);
		}
		const parts: Uint8Array[] = [];
		let length = 0;
		const reader = response.body?.getReader();
		if (reader)
			while (true) {
				let part: ReadableStreamReadResult<Uint8Array>;
				try {
					part = await reader.read();
				} catch {
					throw unavailable("读取协调服务响应失败");
				}
				if (part.done) break;
				length += part.value.length;
				if (length > 2000000) {
					await reader.cancel();
					throw new BridgeError(502, "Response too large");
				}
				parts.push(part.value);
			}
		const bytes = Buffer.concat(parts);
		let result: any;
		try {
			result = JSON.parse(bytes.toString("utf8"));
		} catch {
			if (response.ok || response.status >= 500 || response.status === 408) throw unavailable("协调服务返回了无效数据");
			throw new BridgeError(response.status, "Coordinator request failed");
		}
		if (!response.ok) {
			if (response.status >= 500 || response.status === 408)
				throw unavailable(typeof result.error === "string" ? result.error : "协调服务暂时不可用");
			throw new BridgeError(response.status, "Coordinator request failed", { error: result.error });
		}
		res.end(JSON.stringify(result));
	} catch (error) {
		const failure = error instanceof BridgeError ? error : new BridgeError(500, "Development proxy failed");
		res.statusCode = failure.status;
		res.end(JSON.stringify({ statusMessage: failure.message, data: failure.data }));
	}
}

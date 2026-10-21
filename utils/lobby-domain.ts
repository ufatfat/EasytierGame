export type ConnectionData = { servers: string[]; network_name: string; password_mode: "ask" | "public"; password?: string };
export function connectionConfig(connection: ConnectionData, password: string) {
	if (!Array.isArray(connection.servers) || !connection.servers.length || !connection.network_name) throw new Error("房间联机信息无效");
	const parsed = connection.servers.map(server => {
		const url = new URL(server);
		if (
			!["tcp:", "udp:", "wg:", "ws:", "wss:", "quic:", "srv:", "txt:"].includes(url.protocol) ||
			!url.hostname ||
			url.username ||
			url.password ||
			url.hash ||
			url.search
		)
			throw new Error("房间服务器地址无效");
		return { protocol: url.protocol.slice(0, -1), address: server.slice(url.protocol.length + 2) };
	});
	return {
		protocol: [...new Set(parsed.map(p => p.protocol))],
		serverUrl: [...new Set(parsed.map(p => p.address))],
		peerUrls: [...connection.servers],
		networkName: connection.network_name,
		networkPassword: connection.password_mode === "public" ? connection.password || "" : password
	};
}
export function exactPeerUrls(config: { protocol: string[]; serverUrl: string[]; peerUrls?: string[] }) {
	const { protocol, serverUrl, peerUrls = [] } = config;
	const expanded = protocol.flatMap(p => serverUrl.map(address => `${p}://${address.replace(/\\/g, "/")}`));
	if (!peerUrls.length) return expanded;
	const parts = peerUrls.map(url => {
		const index = url.indexOf("://");
		return { protocol: url.slice(0, index), address: url.slice(index + 3) };
	});
	const same = (a: string[], b: string[]) => a.length === new Set(b).size && a.every(value => b.includes(value));
	if (
		same(
			protocol,
			parts.map(p => p.protocol)
		) &&
		same(
			serverUrl,
			parts.map(p => p.address)
		)
	)
		return [...peerUrls];
	return expanded;
}
export function roomJoinPatch(current: Record<string, any>, connection: ConnectionData, password: string) {
	return { ...current, ...connectionConfig(connection, password) };
}
export function logLevel(line: string): "ERROR" | "WARN" | "DEBUG" | "TRACE" | "INFO" {
	const explicit = line.match(/\b(ERROR|WARN(?:ING)?|DEBUG|TRACE|INFO)\b/i)?.[1].toUpperCase();
	if (explicit) return explicit === "WARNING" ? "WARN" : (explicit as any);
	return /\b(error|failed|exception)\b/i.test(line) ? "ERROR" : "INFO";
}

// Local publication state is excluded from all room/config exports, like coordinator identity.
export function publicationSnapshot(config: {
	protocol: string[];
	serverUrl: string[];
	peerUrls?: string[];
	networkName: string;
	networkPassword: string;
}) {
	return JSON.stringify([exactPeerUrls(config).sort(), config.networkName, config.networkPassword]);
}

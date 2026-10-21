import { randomUUID } from "node:crypto";
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max, label, optional = false) => {
	if (optional && (value === undefined || value === "")) return "";
	if (typeof value !== "string" || !value.trim() || [...value.trim()].length > max) throw fail(400, `${label}须为 1–${max} 字`);
	return value.trim();
};
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
export function installRoomSchema(db) {
	db.exec(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, member_id TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL,
    title TEXT NOT NULL, game TEXT NOT NULL, tags TEXT NOT NULL, description TEXT NOT NULL,
    capacity INTEGER NOT NULL, member_count INTEGER NOT NULL, servers TEXT NOT NULL, network_name TEXT NOT NULL,
    password_mode TEXT NOT NULL, password TEXT, hide_when_full INTEGER NOT NULL DEFAULT 0,
    auto_remove INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, heartbeat_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS room_heartbeat ON rooms(heartbeat_at);`);
}
const count = (value, max, label, min = 0) => {
	if (!Number.isInteger(value) || value < min || value > max) throw fail(400, `${label}须为 ${min}–${max} 的整数`);
	return value;
};
const flag = (value, fallback) => {
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") throw fail(400, "开关参数无效");
	return value;
};
function validate(input, publishing) {
	const result = {
		title: text(input.title, 24, "标题"),
		game: text(input.game, 40, "游戏名"),
		description: text(input.description, 200, "说明", true),
		capacity: count(input.capacity, 256, "人数上限", 1)
	};
	if (!Array.isArray(input.tags) || input.tags.length > 5) throw fail(400, "最多选择 5 个标签");
	result.tags = [...new Set(input.tags.map(tag => text(tag, 12, "标签")))];
	result.hide_when_full = flag(input.hide_when_full, false);
	result.auto_remove = flag(input.auto_remove, true);
	if (publishing) {
		result.network_name = text(input.network_name, 100, "房间名");
		if (!Array.isArray(input.servers) || !input.servers.length || input.servers.length > 10) throw fail(400, "需要 1–10 个服务器地址");
		result.servers = [
			...new Set(
				input.servers.map(server => {
					server = text(server, 500, "服务器");
					let url;
					try {
						url = new URL(server);
					} catch {
						throw fail(400, "服务器地址无效");
					}
					if (
						!["tcp:", "udp:", "wg:", "ws:", "wss:", "quic:", "srv:", "txt:"].includes(url.protocol) ||
						!url.hostname ||
						url.username ||
						url.password ||
						url.hash ||
						url.search
					)
						throw fail(400, "服务器协议或地址无效");
					return server;
				})
			)
		];
		if (!["ask", "public"].includes(input.password_mode ?? "ask")) throw fail(400, "密码模式无效");
		result.password_mode = input.password_mode ?? "ask";
		// Never read, persist, hash, or return an ask-mode password supplied by a client.
		result.password = result.password_mode === "public" ? text(input.password, 100, "密码", true) : null;
		result.member_count = count(input.member_count, 1000, "在线人数", 1);
	}
	return result;
}
const publicRoom = row => {
	const { password, client_id, ...room } = row;
	return {
		...room,
		tags: JSON.parse(room.tags),
		servers: JSON.parse(room.servers),
		hide_when_full: !!room.hide_when_full,
		auto_remove: !!room.auto_remove
	};
};
export async function handleRoomRequest({ db, me, clientId, method, url, body, now }) {
	if (!url.pathname.startsWith("/v1/rooms")) return undefined;
	// Expiry uses server time and is applied to every read/write, not a background timer.
	db.prepare("DELETE FROM rooms WHERE heartbeat_at <= ? OR member_id IN (SELECT id FROM members WHERE revoked_at IS NOT NULL)").run(
		new Date(Date.parse(now) - 90000).toISOString()
	);
	const select = "SELECT r.*, m.name AS member_name FROM rooms r JOIN members m ON m.id=r.member_id";
	if (url.pathname === "/v1/rooms" && method === "GET") {
		let rooms = db.prepare(`${select} ORDER BY r.created_at DESC, r.id DESC`).all().map(publicRoom);
		const mine = rooms.find(room => room.member_id === me.id) || null;
		rooms = rooms.filter(room => !room.hide_when_full || room.member_count < room.capacity || room.member_id === me.id || me.role === "admin");
		if (url.searchParams.has("game")) rooms = rooms.filter(room => room.game === url.searchParams.get("game"));
		if (url.searchParams.get("has_slot") === "true" || url.searchParams.get("has_slot") === "1")
			rooms = rooms.filter(room => room.member_count < room.capacity);
		return { status: 200, value: { rooms, mine } };
	}
	if (url.pathname === "/v1/rooms" && method === "POST") {
		const input = validate(await body(), true);
		if (db.prepare("SELECT 1 FROM rooms WHERE member_id=?").get(me.id)) throw fail(409, "每位成员同时最多发布 1 个房间");
		if (db.prepare("SELECT COUNT(*) AS n FROM rooms").get().n >= 500) throw fail(409, "当前大厅房间数量已达上限，请稍后再试");
		const id = randomUUID();
		db.prepare("INSERT INTO rooms VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
			id,
			me.id,
			clientId,
			input.title,
			input.game,
			JSON.stringify(input.tags),
			input.description,
			input.capacity,
			input.member_count,
			JSON.stringify(input.servers),
			input.network_name,
			input.password_mode,
			input.password,
			Number(input.hide_when_full),
			Number(input.auto_remove),
			now,
			now
		);
		return { status: 201, value: publicRoom(db.prepare(`${select} WHERE r.id=?`).get(id)) };
	}
	const match = url.pathname.match(new RegExp(`^/v1/rooms/(${uuid})(/(heartbeat|connection))?$`));
	if (!match) throw fail(404, "房间接口不存在");
	const room = db.prepare(`${select} WHERE r.id=?`).get(match[1]);
	if (!room) throw fail(404, "房间已下架或心跳超时，请刷新大厅");
	const owner = room.member_id === me.id;
	if (method === "GET" && match[3] === "connection") {
		if (room.member_count >= room.capacity && !owner) throw fail(409, "房间已满，请选择其他房间");
		return {
			status: 200,
			value: {
				id: room.id,
				servers: JSON.parse(room.servers),
				network_name: room.network_name,
				password_mode: room.password_mode,
				...(room.password_mode === "public" ? { password: room.password } : {})
			}
		};
	}
	if (method === "DELETE" && !match[2]) {
		if (!owner && me.role !== "admin") throw fail(403, "只有房主或管理员可下架房间");
		db.prepare("DELETE FROM rooms WHERE id=?").run(room.id);
		return { status: 200, value: { ok: true } };
	}
	if (!owner) throw fail(403, "只有房主可编辑或续期房间");
	if (method === "PATCH" && !match[2]) {
		const input = await body();
		// Connection settings are immutable while a publication exists; republish after changing networks.
		if (["password", "password_mode", "servers", "network_name", "member_count"].some(key => key in input))
			throw fail(400, "服务器、房间名和密码不可编辑，请下架后重新发布");
		const fields = validate({ ...publicRoom(room), ...input }, false);
		db.prepare("UPDATE rooms SET title=?, game=?, tags=?, description=?, capacity=?, hide_when_full=?, auto_remove=? WHERE id=?").run(
			fields.title,
			fields.game,
			JSON.stringify(fields.tags),
			fields.description,
			fields.capacity,
			Number(fields.hide_when_full),
			Number(fields.auto_remove),
			room.id
		);
		return { status: 200, value: publicRoom(db.prepare(`${select} WHERE r.id=?`).get(room.id)) };
	}
	if (method === "PUT" && match[3] === "heartbeat") {
		if (room.client_id !== clientId) throw fail(403, "仅发布房间的设备可发送心跳");
		const input = await body();
		db.prepare("UPDATE rooms SET member_count=?, heartbeat_at=? WHERE id=?").run(count(input.member_count, 1000, "在线人数", 1), now, room.id);
		return { status: 200, value: { ok: true, heartbeat_at: now } };
	}
	throw fail(404, "房间接口不存在");
}

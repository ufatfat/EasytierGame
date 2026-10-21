import { installRoomSchema, handleRoomRequest } from "./rooms.mjs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max, label) => {
	if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw fail(400, `${label}不能为空且不能超过 ${max} 字符`);
	return value.trim();
};
const ROLES = ["member", "admin"];
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const KEY_PATTERN = /^etk_[a-f0-9]{64}$/;
const newKey = () => `etk_${randomBytes(32).toString("hex")}`;
export function ipv4Number(ip) {
	if (typeof ip !== "string" || !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(ip) || ip.split(".").some(n => Number(n) > 255))
		throw fail(400, "请输入有效的 IPv4 地址");
	return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}
export function parsePool(cidr) {
	const [ip, prefixText, extra] = cidr.split("/");
	const prefix = Number(prefixText);
	if (extra !== undefined || !/^\d+$/.test(prefixText || "") || prefix < 8 || prefix > 30)
		throw new Error("IP_POOL 必须为 /8 到 /30 的私有 IPv4 网段");
	const number = ipv4Number(ip);
	const size = 2 ** (32 - prefix);
	const start = Math.floor(number / size) * size;
	const end = start + size - 1;
	const privateRanges = [
		[0x0a000000, 0x0affffff],
		[0xac100000, 0xac1fffff],
		[0xc0a80000, 0xc0a8ffff]
	];
	if (number !== start || !privateRanges.some(([a, b]) => start >= a && end <= b)) throw new Error("IP_POOL 必须是规范的私有 IPv4 网段");
	return { cidr, prefix, start, end };
}

// The registry owns the database; both the HTTP service and the member CLI operate on it.
export function openRegistry({ database = "service/data/registry.sqlite", cidr = "10.126.126.0/24", claimsPerMember = 3 } = {}) {
	const pool = parsePool(cidr);
	if (!Number.isInteger(claimsPerMember) || claimsPerMember < 1) throw new Error("CLAIMS_PER_MEMBER 必须为正整数");
	if (database !== ":memory:") mkdirSync(dirname(resolve(database)), { recursive: true });
	const db = new DatabaseSync(database);
	db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, key_hash TEXT UNIQUE, created_at TEXT NOT NULL, last_seen_at TEXT, revoked_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS member_active_name ON members(name) WHERE revoked_at IS NULL;
    CREATE TABLE IF NOT EXISTS claims (client_id TEXT PRIMARY KEY, ip TEXT NOT NULL UNIQUE, hostname TEXT NOT NULL, updated_at TEXT NOT NULL, member_id TEXT);
    CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, hostname TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, member_id TEXT);
    CREATE INDEX IF NOT EXISTS announcement_time ON announcements(created_at DESC, id DESC);`);
	installRoomSchema(db);
	// Databases created before per-member keys keep their rows; those rows have no owner until reclaimed.
	for (const table of ["claims", "announcements"])
		if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === "member_id"))
			db.exec(`ALTER TABLE ${table} ADD COLUMN member_id TEXT`);
	for (const claim of db.prepare("SELECT ip FROM claims").all()) {
		const ip = ipv4Number(claim.ip);
		if (ip <= pool.start || ip >= pool.end) {
			db.close();
			throw new Error("现有 IP 登记不在 IP_POOL 内，请先迁移登记数据");
		}
	}
	const transaction = fn => {
		db.exec("BEGIN IMMEDIATE");
		try {
			const result = fn();
			db.exec("COMMIT");
			return result;
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	};
	const activeMember = id => {
		const member = db.prepare("SELECT id, name, role FROM members WHERE id=? AND revoked_at IS NULL").get(id);
		if (!member) throw fail(404, "成员不存在或已被吊销");
		return member;
	};
	const registry = {
		db,
		pool,
		claimsPerMember,
		createMember(name, role = "member") {
			name = text(name, 32, "成员名");
			if (!ROLES.includes(role)) throw fail(400, "角色无效");
			const id = randomUUID(),
				key = newKey();
			try {
				db.prepare("INSERT INTO members (id, name, role, key_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
					id,
					name,
					role,
					hash(key),
					new Date().toISOString()
				);
			} catch (error) {
				if (String(error.message).includes("UNIQUE")) throw fail(409, "已存在同名成员");
				throw error;
			}
			return { member: { id, name, role }, key };
		},
		resetKey(id) {
			const member = activeMember(id);
			const key = newKey();
			db.prepare("UPDATE members SET key_hash=? WHERE id=?").run(hash(key), id);
			return { member, key };
		},
		setRole(id, role) {
			if (!ROLES.includes(role)) throw fail(400, "角色无效");
			activeMember(id);
			db.prepare("UPDATE members SET role=? WHERE id=?").run(role, id);
		},
		// Revoking frees the member's IPs so the pool cannot be held by someone who can no longer renew them.
		revoke(id) {
			activeMember(id);
			transaction(() => {
				db.prepare("UPDATE members SET key_hash=NULL, revoked_at=? WHERE id=?").run(new Date().toISOString(), id);
				db.prepare("DELETE FROM claims WHERE member_id=?").run(id);
                db.prepare("DELETE FROM rooms WHERE member_id=?").run(id);
			});
		},
		findByName(name) {
			const member = db.prepare("SELECT id, name, role FROM members WHERE name=? AND revoked_at IS NULL").get(name);
			if (!member) throw fail(404, `成员“${name}”不存在或已被吊销`);
			return member;
		},
		listMembers() {
			return db
				.prepare(
					`SELECT m.id, m.name, m.role, m.created_at, m.last_seen_at, m.revoked_at,
            (SELECT COUNT(*) FROM claims c WHERE c.member_id=m.id) AS claim_count,
            (SELECT COUNT(*) FROM announcements a WHERE a.member_id=m.id) AS announcement_count
          FROM members m ORDER BY m.revoked_at IS NOT NULL, m.created_at`
				)
				.all();
		},
		hasAdmin() {
			return !!db.prepare("SELECT 1 FROM members WHERE role='admin' AND revoked_at IS NULL").get();
		},
		authenticate(key) {
			if (typeof key !== "string" || !KEY_PATTERN.test(key)) return null;
			return db.prepare("SELECT id, name, role, last_seen_at FROM members WHERE key_hash=? AND revoked_at IS NULL").get(hash(key)) || null;
		},
		close: () => db.close()
	};
	return registry;
}

export function createCoordinator(registry) {
	const { db, pool, claimsPerMember } = registry;
	const handler = async (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.setHeader("Cache-Control", "no-store");
		res.setHeader("X-Content-Type-Options", "nosniff");
		const send = (status, value) => {
			res.writeHead(status);
			res.end(JSON.stringify(value));
		};
		try {
			if (req.url === "/health" && req.method === "GET") return send(200, { ok: true });
			const bearer = req.headers.authorization || "";
			const me = bearer.startsWith("Bearer ") ? registry.authenticate(bearer.slice(7)) : null;
			if (!me) throw fail(401, "访问密钥无效或已被吊销，请向管理员索取");
			const clientToken = req.headers["x-client-token"];
			if (typeof clientToken !== "string" || !/^[a-f0-9]{64}$/.test(clientToken)) throw fail(401, "客户端身份无效");
			const clientId = hash(clientToken);
			const now = new Date().toISOString();
			if (!me.last_seen_at || Date.parse(me.last_seen_at) < Date.now() - 60000)
				db.prepare("UPDATE members SET last_seen_at=? WHERE id=?").run(now, me.id);
			const isAdmin = me.role === "admin";
			const requireAdmin = () => {
				if (!isAdmin) throw fail(403, "需要管理员权限");
			};
			const url = new URL(req.url, "http://localhost");
			const path = url.pathname;
			const body = async () => {
				const chunks = [];
				let length = 0;
				for await (const chunk of req) {
					length += chunk.length;
					if (length > 16384) throw fail(413, "请求内容过大");
					chunks.push(chunk);
				}
				let input;
				try {
					input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				} catch {
					throw fail(400, "无效的 JSON 请求");
				}
				if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(400, "请求必须是 JSON 对象");
				return input;
			};
			if (req.method === "GET" && ["/v1/state", "/v1/state/mine"].includes(path)) {
				const claims = db
					.prepare("SELECT c.*, m.name AS member_name FROM claims c LEFT JOIN members m ON m.id=c.member_id ORDER BY c.ip")
					.all();
				const select = "SELECT a.*, m.name AS member_name FROM announcements a LEFT JOIN members m ON m.id=a.member_id";
				const announcements = path.endsWith("/mine")
					? db.prepare(`${select} WHERE a.member_id=? ORDER BY a.created_at DESC, a.id DESC LIMIT 100`).all(me.id)
					: db.prepare(`${select} ORDER BY a.created_at DESC, a.id DESC LIMIT 100`).all();
				return send(200, {
					pool: pool.cidr,
					prefix: pool.prefix,
					clientId,
					me: { id: me.id, name: me.name, role: me.role },
					claims,
					announcements
				});
			}
			if (req.method === "PUT" && path === "/v1/claim") {
				const input = await body();
				const hostname = text(input.hostname, 100, "主机名");
				const ip = text(input.ip, 15, "IP");
				const number = ipv4Number(ip);
				if (number <= pool.start || number >= pool.end) throw fail(400, `IP 必须位于 ${pool.cidr} 内，且不能是网络或广播地址`);
				const devices = db.prepare("SELECT COUNT(*) AS n FROM claims WHERE member_id=? AND client_id<>?").get(me.id, clientId).n;
				if (devices >= claimsPerMember) throw fail(409, `每位成员最多为 ${claimsPerMember} 台设备登记 IP，请先释放其他设备的登记`);
				let result;
				try {
					// One atomic statement: a conflicting change leaves the old reservation intact.
					result = db
						.prepare(
							`INSERT INTO claims (client_id, ip, hostname, updated_at, member_id) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(client_id) DO UPDATE SET ip=excluded.ip, hostname=excluded.hostname, updated_at=excluded.updated_at, member_id=excluded.member_id
              WHERE claims.member_id IS NULL OR claims.member_id=excluded.member_id`
						)
						.run(clientId, ip, hostname, now, me.id);
				} catch (error) {
					if (String(error.message).includes("UNIQUE")) throw fail(409, "该 IP 已被其他客户端登记");
					throw error;
				}
				if (!result.changes) throw fail(409, "本设备的登记属于其他成员，请联系管理员释放");
				return send(200, { ip, prefix: pool.prefix, clientId });
			}
			if (req.method === "DELETE" && path === "/v1/claim") {
				db.prepare("DELETE FROM claims WHERE client_id=? AND (member_id IS NULL OR member_id=?)").run(clientId, me.id);
				return send(200, { ok: true });
			}
			if (req.method === "POST" && path === "/v1/announcements") {
				const input = await body();
				const hostname = text(input.hostname, 100, "主机名");
				const title = text(input.title, 100, "公告标题");
				const content = text(input.content, 2000, "公告内容");
				const count = db.prepare("SELECT COUNT(*) AS n FROM announcements WHERE member_id=?").get(me.id).n;
				if (count >= 100) throw fail(409, "每位成员最多保留 100 条公告，请先撤回旧公告");
				const id = randomUUID();
				db.prepare(
					"INSERT INTO announcements (id, client_id, hostname, title, content, created_at, member_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
				).run(id, clientId, hostname, title, content, now, me.id);
				return send(201, { id });
			}
			if (req.method === "DELETE" && new RegExp(`^/v1/announcements/${UUID}$`).test(path)) {
				const id = path.split("/").pop();
				const result = isAdmin
					? db.prepare("DELETE FROM announcements WHERE id=?").run(id)
					: db.prepare("DELETE FROM announcements WHERE id=? AND member_id=?").run(id, me.id);
				if (!result.changes) throw fail(404, "公告不存在或不属于当前成员");
				return send(200, { ok: true });
			}
			if (path === "/v1/admin/members" && req.method === "GET") {
				requireAdmin();
				return send(200, { members: registry.listMembers() });
			}
			if (path === "/v1/admin/members" && req.method === "POST") {
				requireAdmin();
				const input = await body();
				return send(201, registry.createMember(input.name, input.role ?? "member"));
			}
			const memberPath = path.match(new RegExp(`^/v1/admin/members/(${UUID})(/key)?$`));
			if (memberPath) {
				requireAdmin();
				const [, id, keyPath] = memberPath;
				if (keyPath && req.method === "POST") return send(200, registry.resetKey(id));
				if (!keyPath && req.method === "PATCH") {
					const input = await body();
					if (id === me.id) throw fail(409, "不能修改自己的角色");
					registry.setRole(id, input.role);
					return send(200, { ok: true });
				}
				if (!keyPath && req.method === "DELETE") {
					if (id === me.id) throw fail(409, "不能吊销自己");
					registry.revoke(id);
					return send(200, { ok: true });
				}
			}
			const claimPath = path.match(/^\/v1\/admin\/claims\/([0-9.]{7,15})$/);
			if (claimPath && req.method === "DELETE") {
				requireAdmin();
				ipv4Number(claimPath[1]);
				if (!db.prepare("DELETE FROM claims WHERE ip=?").run(claimPath[1]).changes) throw fail(404, "该 IP 没有登记");
				return send(200, { ok: true });
			}
            const roomResult = await handleRoomRequest({ db, me, clientId, method: req.method, url, body, now });
            if (roomResult) return send(roomResult.status, roomResult.value);
			throw fail(404, "接口不存在");
		} catch (error) {
			send(error.status || 500, { error: error.status ? error.message : "服务内部错误" });
		}
	};
	return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 4096 }, handler);
}

const USAGE = `用法:
  node service/server.mjs                         启动协调服务
  node service/server.mjs member add <名字> [--admin]  新建成员并打印其访问密钥
  node service/server.mjs member list             列出成员
  node service/server.mjs member reset-key <名字>  重新生成访问密钥（旧密钥立即失效）
  node service/server.mjs member revoke <名字>     吊销成员并释放其登记的 IP`;

export function runMemberCommand(registry, [action, name, ...flags], print = console.log) {
	if (action === "add") {
		const { key } = registry.createMember(name, flags.includes("--admin") ? "admin" : "member");
		print(`已创建成员“${name}”。访问密钥只显示这一次，请通过私密渠道发给本人：\n${key}`);
	} else if (action === "list") {
		for (const m of registry.listMembers())
			print(`${m.revoked_at ? "[已吊销] " : ""}${m.name}\t${m.role === "admin" ? "管理员" : "成员"}\t最近使用 ${m.last_seen_at || "-"}`);
	} else if (action === "reset-key") {
		const { key } = registry.resetKey(registry.findByName(name).id);
		print(`已为“${name}”生成新的访问密钥，旧密钥已失效：\n${key}`);
	} else if (action === "revoke") {
		registry.revoke(registry.findByName(name).id);
		print(`已吊销“${name}”，其登记的 IP 已释放`);
	} else throw new Error(USAGE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const registry = openRegistry({
		database: process.env.DATABASE_PATH,
		cidr: process.env.IP_POOL,
		claimsPerMember: process.env.CLAIMS_PER_MEMBER ? Number(process.env.CLAIMS_PER_MEMBER) : undefined
	});
	const [command, ...args] = process.argv.slice(2);
	if (command === "member") {
		try {
			runMemberCommand(registry, args);
		} catch (error) {
			console.error(error.message);
			process.exitCode = 1;
		} finally {
			registry.close();
		}
	} else if (command) {
		console.error(USAGE);
		registry.close();
		process.exitCode = 1;
	} else {
		const server = createCoordinator(registry);
		server.on("close", () => registry.close());
		server.listen(Number(process.env.PORT || 8787), process.env.HOST || "127.0.0.1", () => {
			console.log("EasyTierGame 协调服务已启动");
			if (!registry.hasAdmin()) console.log("尚无管理员，请运行：node service/server.mjs member add <名字> --admin");
		});
		for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close());
	}
}

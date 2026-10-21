import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoordinator, openRegistry } from "./server.mjs";
const device = "a".repeat(64),
	otherDevice = "b".repeat(64);
async function boot() {
	const registry = openRegistry({ database: ":memory:" });
	const server = createCoordinator(registry);
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const alice = registry.createMember("阿杰"),
		bob = registry.createMember("Momo"),
		admin = registry.createMember("站长", "admin");
	const call = async (path, method = "GET", body, key = alice.key, client = device) => {
		const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: { authorization: `Bearer ${key}`, "x-client-token": client, "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		return { status: r.status, body: await r.json() };
	};
	return {
		registry,
		alice,
		bob,
		admin,
		call,
		close: async () => {
			await new Promise(resolve => server.close(resolve));
			registry.close();
		}
	};
}
const room = (changes = {}) => ({
	title: "今晚一起开荒",
	game: "怪物猎人：世界",
	tags: ["语音", "新手友好"],
	description: "游戏版本 15.11",
	capacity: 4,
	member_count: 2,
	servers: ["tcp://public.easytier.top:11010"],
	network_name: "mhw-night",
	password_mode: "ask",
	...changes
});
test("lobby publishes, filters, enforces member quota and keeps ask passwords out of storage and responses", async () => {
	const app = await boot();
	try {
		const created = await app.call("/v1/rooms", "POST", room({ password: "never-store-this-secret" }));
		assert.equal(created.status, 201);
		assert.equal(app.registry.db.prepare("SELECT password FROM rooms").get().password, null);
		assert.equal(JSON.stringify(created.body).includes("never-store"), false);
		assert.equal((await app.call("/v1/rooms", "POST", room())).status, 409);
		const listed = (await app.call("/v1/rooms?game=" + encodeURIComponent("怪物猎人：世界"))).body.rooms;
		assert.equal(listed.length, 1);
		assert.equal(listed[0].member_name, "阿杰");
		assert.equal("password" in listed[0], false);
		assert.equal("client_id" in listed[0], false);
		assert.equal((await app.call("/v1/rooms?game=other")).body.rooms.length, 0);
		const connection = await app.call(`/v1/rooms/${created.body.id}/connection`, "GET", undefined, app.bob.key);
		assert.equal("password" in connection.body, false);
	} finally {
		await app.close();
	}
});
test("public password is only available via connection, full rooms cannot be joined and hidden rooms respect filters", async () => {
	const app = await boot();
	try {
		const r = await app.call(
			"/v1/rooms",
			"POST",
			room({ password_mode: "public", password: "public-123", member_count: 4, hide_when_full: true })
		);
		assert.equal("password" in r.body, false);
		assert.equal((await app.call("/v1/rooms", "GET", undefined, app.bob.key)).body.rooms.length, 0);
		assert.equal((await app.call("/v1/rooms?has_slot=true")).body.rooms.length, 0);
		assert.equal((await app.call(`/v1/rooms/${r.body.id}/connection`, "GET", undefined, app.bob.key)).status, 409);
		await app.call(`/v1/rooms/${r.body.id}/heartbeat`, "PUT", { member_count: 2 });
		assert.equal((await app.call(`/v1/rooms/${r.body.id}/connection`, "GET", undefined, app.bob.key)).body.password, "public-123");
		assert.equal(JSON.stringify((await app.call("/v1/rooms")).body).includes("public-123"), false);
	} finally {
		await app.close();
	}
});
test("only owner edits/heartbeats, admin can remove, expired and revoked rooms immediately disappear", async () => {
	const app = await boot();
	try {
		let r = (await app.call("/v1/rooms", "POST", room())).body;
		assert.equal((await app.call(`/v1/rooms/${r.id}`, "PATCH", { title: "Changed" }, app.bob.key)).status, 403);
		assert.equal((await app.call(`/v1/rooms/${r.id}/heartbeat`, "PUT", { member_count: 3 }, app.alice.key, otherDevice)).status, 403);
		assert.equal((await app.call(`/v1/rooms/${r.id}`, "PATCH", { servers: ["tcp://evil.example:123"] })).status, 400);
		assert.equal((await app.call(`/v1/rooms/${r.id}`, "PATCH", { title: "新标题" })).body.title, "新标题");
		assert.equal((await app.call(`/v1/rooms/${r.id}`, "DELETE", undefined, app.bob.key)).status, 403);
		assert.equal((await app.call(`/v1/rooms/${r.id}`, "DELETE", undefined, app.admin.key)).status, 200);
		r = (await app.call("/v1/rooms", "POST", room())).body;
		app.registry.db.prepare("UPDATE rooms SET heartbeat_at=?").run(new Date(Date.now() - 91000).toISOString());
		assert.equal((await app.call("/v1/rooms")).body.rooms.length, 0);
		assert.equal((await app.call(`/v1/rooms/${r.id}/heartbeat`, "PUT", { member_count: 1 })).status, 404);
		await app.call("/v1/rooms", "POST", room());
		app.registry.revoke(app.alice.member.id);
		assert.equal((await app.call("/v1/rooms", "GET", undefined, app.bob.key)).body.rooms.length, 0);
	} finally {
		await app.close();
	}
});
test("room payload bounds and protocols are validated before persistence", async () => {
	const app = await boot();
	try {
		for (const change of [
			{ title: "x".repeat(25) },
			{ description: "x".repeat(201) },
			{ tags: Array(6).fill("tag") },
			{ capacity: 0 },
			{ member_count: 0 },
			{ servers: ["file:///etc/passwd"] },
			{ servers: ["tcp://u:p@host:11010"] },
			{ password_mode: "invalid" }
		])
			assert.equal((await app.call("/v1/rooms", "POST", room(change))).status, 400);
	} finally {
		await app.close();
	}
});

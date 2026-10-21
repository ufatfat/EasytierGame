import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCoordinator, openRegistry, parsePool, runMemberCommand } from "./server.mjs";
const clientA = "a".repeat(64),
	clientB = "b".repeat(64),
	clientC = "c".repeat(64);
async function boot(database = ":memory:", options = {}) {
	const registry = openRegistry({ database, ...options });
	const server = createCoordinator(registry);
	server.on("close", () => registry.close());
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const call = async (path, method = "GET", body, client = clientA, key) => {
		const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method,
			headers: { authorization: `Bearer ${key}`, "x-client-token": client, "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		return { status: response.status, body: await response.json() };
	};
	const close = () => new Promise(resolve => server.close(resolve));
	return { registry, call, close };
}
test("global reservation concurrency, ownership, validation and atomic change", async () => {
	const { registry, call, close } = await boot();
	const alice = registry.createMember("alice").key,
		bob = registry.createMember("bob").key;
	try {
		assert.equal((await call("/v1/state", "GET", undefined, clientA, "wrong")).status, 401);
		assert.equal((await call("/v1/state", "GET", undefined, clientA, `etk_${"0".repeat(64)}`)).status, 401);
		for (const ip of ["127.0.0.1", "10.126.126.0", "10.126.126.255", "10.126.126.01", "300.1.1.1"])
			assert.equal((await call("/v1/claim", "PUT", { ip, hostname: "A" }, clientA, alice)).status, 400);
		const results = await Promise.all(
			[
				[clientA, alice],
				[clientB, bob]
			].map(([client, key]) => call("/v1/claim", "PUT", { ip: "10.126.126.8", hostname: client }, client, key))
		);
		assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
		const [loser, loserKey] = results[0].status === 200 ? [clientB, bob] : [clientA, alice];
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.9", hostname: "other" }, loser, loserKey)).status, 200);
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.8", hostname: "other" }, loser, loserKey)).status, 409);
		const state = (await call("/v1/state", "GET", undefined, clientA, alice)).body;
		assert.equal(state.claims.length, 2);
		assert.deepEqual(state.me, { id: state.me.id, name: "alice", role: "member" });
		assert.deepEqual(state.claims.map(c => c.member_name).sort(), ["alice", "bob"]);
		await call("/v1/claim", "DELETE", undefined, loser, loserKey);
		assert.equal((await call("/v1/state", "GET", undefined, clientA, alice)).body.claims[0].ip, "10.126.126.8");
	} finally {
		await close();
	}
});
test("a device's claim cannot be taken over by another member and devices per member are capped", async () => {
	const { registry, call, close } = await boot(":memory:", { claimsPerMember: 2 });
	const alice = registry.createMember("alice").key,
		bob = registry.createMember("bob").key;
	try {
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.10", hostname: "A" }, clientA, alice)).status, 200);
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.11", hostname: "A" }, clientA, bob)).status, 409);
		await call("/v1/claim", "DELETE", undefined, clientA, bob);
		assert.equal((await call("/v1/state", "GET", undefined, clientA, alice)).body.claims.length, 1);
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.12", hostname: "B" }, clientB, alice)).status, 200);
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.13", hostname: "C" }, clientC, alice)).status, 409);
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.14", hostname: "A" }, clientA, alice)).status, 200);
	} finally {
		await close();
	}
});
test("announcements are global, persistent, plain text and only removable by their author or an admin", async () => {
	const dir = mkdtempSync(join(tmpdir(), "etg-test-"));
	const database = join(dir, "state.sqlite");
	let app = await boot(database);
	const alice = app.registry.createMember("alice").key,
		bob = app.registry.createMember("bob").key,
		admin = app.registry.createMember("root", "admin").key;
	try {
		const result = await app.call("/v1/announcements", "POST", { hostname: "A", title: "<script>alert(1)</script>", content: "今晚联机\n欢迎加入" }, clientA, alice);
		assert.equal(result.status, 201);
		assert.equal((await app.call(`/v1/announcements/${result.body.id}`, "DELETE", undefined, clientB, bob)).status, 404);
		assert.equal((await app.call("/v1/announcements", "POST", { hostname: "A", title: " ", content: "x" }, clientA, alice)).status, 400);
		assert.equal((await app.call("/v1/state/mine", "GET", undefined, clientB, bob)).body.announcements.length, 0);
		assert.equal((await app.call("/v1/state/mine", "GET", undefined, clientB, alice)).body.announcements.length, 1);
		assert.equal((await app.call("/v1/claim", "PUT", null, clientA, alice)).status, 400);
		await app.close();
		app = await boot(database);
		const state = (await app.call("/v1/state", "GET", undefined, clientB, bob)).body;
		assert.equal(state.announcements[0].title, "<script>alert(1)</script>");
		assert.equal(state.announcements[0].member_name, "alice");
		assert.equal((await app.call(`/v1/announcements/${result.body.id}`, "DELETE", undefined, clientC, admin)).status, 200);
	} finally {
		await app.close();
		rmSync(dir, { recursive: true });
	}
});
test("admins manage members; revoked or reset keys stop working and revocation frees IPs", async () => {
	const { registry, call, close } = await boot();
	const root = registry.createMember("root", "admin");
	const admin = root.key;
	try {
		assert.equal((await call("/v1/admin/members", "GET", undefined, clientA, registry.createMember("eve").key)).status, 403);
		const created = await call("/v1/admin/members", "POST", { name: "alice" }, clientA, admin);
		assert.equal(created.status, 201);
		assert.match(created.body.key, /^etk_[a-f0-9]{64}$/);
		assert.equal((await call("/v1/admin/members", "POST", { name: "alice" }, clientA, admin)).status, 409);
		assert.equal((await call("/v1/admin/members", "POST", { name: "x", role: "owner" }, clientA, admin)).status, 400);
		const alice = created.body.member.id;
		let aliceKey = created.body.key;
		assert.equal((await call("/v1/claim", "PUT", { ip: "10.126.126.20", hostname: "A" }, clientB, aliceKey)).status, 200);
		const reset = await call(`/v1/admin/members/${alice}/key`, "POST", undefined, clientA, admin);
		assert.equal((await call("/v1/state", "GET", undefined, clientB, aliceKey)).status, 401);
		aliceKey = reset.body.key;
		assert.equal((await call("/v1/state", "GET", undefined, clientB, aliceKey)).status, 200);
		assert.equal((await call(`/v1/admin/members/${alice}`, "PATCH", { role: "admin" }, clientA, admin)).status, 200);
		assert.equal((await call("/v1/admin/members", "GET", undefined, clientB, aliceKey)).status, 200);
		assert.equal((await call(`/v1/admin/members/${alice}`, "PATCH", { role: "member" }, clientB, aliceKey)).status, 409);
		assert.equal((await call(`/v1/admin/members/${root.member.id}`, "DELETE", undefined, clientA, admin)).status, 409);
		assert.equal((await call(`/v1/admin/members/${alice}`, "DELETE", undefined, clientA, admin)).status, 200);
		assert.equal((await call("/v1/state", "GET", undefined, clientB, aliceKey)).status, 401);
		const state = (await call("/v1/state", "GET", undefined, clientA, admin)).body;
		assert.equal(state.claims.length, 0);
		const members = (await call("/v1/admin/members", "GET", undefined, clientA, admin)).body.members;
		assert.ok(members.find(m => m.name === "alice").revoked_at);
		assert.ok(members.every(m => !("key_hash" in m)));
		assert.equal((await call("/v1/admin/members", "POST", { name: "alice" }, clientA, admin)).status, 201);
	} finally {
		await close();
	}
});
test("admins can release any IP", async () => {
	const { registry, call, close } = await boot();
	const admin = registry.createMember("root", "admin").key,
		alice = registry.createMember("alice").key;
	try {
		await call("/v1/claim", "PUT", { ip: "10.126.126.30", hostname: "A" }, clientB, alice);
		assert.equal((await call("/v1/admin/claims/10.126.126.30", "DELETE", undefined, clientA, alice)).status, 403);
		assert.equal((await call("/v1/admin/claims/10.126.126.30", "DELETE", undefined, clientA, admin)).status, 200);
		assert.equal((await call("/v1/admin/claims/10.126.126.30", "DELETE", undefined, clientA, admin)).status, 404);
	} finally {
		await close();
	}
});
test("member CLI creates, lists, resets and revokes", () => {
	const registry = openRegistry({ database: ":memory:" });
	const out = [];
	try {
		runMemberCommand(registry, ["add", "root", "--admin"], line => out.push(line));
		const key = out[0].match(/etk_[a-f0-9]{64}/)[0];
		assert.equal(registry.authenticate(key).role, "admin");
		runMemberCommand(registry, ["reset-key", "root"], line => out.push(line));
		assert.equal(registry.authenticate(key), null);
		runMemberCommand(registry, ["revoke", "root"], line => out.push(line));
		assert.equal(registry.hasAdmin(), false);
		runMemberCommand(registry, ["list"], line => out.push(line));
		assert.match(out.at(-1), /已吊销/);
		assert.throws(() => runMemberCommand(registry, ["revoke", "nobody"]));
		assert.throws(() => runMemberCommand(registry, ["bogus"]));
	} finally {
		registry.close();
	}
});
test("databases created before member keys gain ownership columns", () => {
	const dir = mkdtempSync(join(tmpdir(), "etg-test-"));
	const database = join(dir, "old.sqlite");
	const old = new DatabaseSync(database);
	old.exec(`CREATE TABLE claims (client_id TEXT PRIMARY KEY, ip TEXT NOT NULL UNIQUE, hostname TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE announcements (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, hostname TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO claims VALUES ('x', '10.126.126.5', 'old', '2026-01-01');`);
	old.close();
	try {
		const registry = openRegistry({ database });
		assert.equal(registry.db.prepare("SELECT member_id FROM claims").get().member_id, null);
		registry.close();
	} finally {
		rmSync(dir, { recursive: true });
	}
});
test("pool config rejects public or noncanonical networks", () => {
	for (const pool of ["8.8.8.0/24", "10.0.0.1/24", "10.0.0.0/31", "172.0.0.0/8"]) assert.throws(() => parsePool(pool));
	assert.equal(parsePool("172.16.0.0/12").prefix, 12);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { configuredCoordinatorUrls, normalizeCoordinatorUrls, requestWithCoordinatorFailover } from "../utils/coordinator-failover.ts";
const unavailable = (replay_safe = false) => ({ message: "连接失败", retryable: true, replay_safe });
const read = { endpoint: "/v1/state", method: "GET" };
test("coordinator addresses normalize, deduplicate and retain legacy single-address settings", () => {
	assert.deepEqual(normalizeCoordinatorUrls(" https://PRIMARY.example/hub/\nhttps://primary.example/hub\nhttp://127.0.0.1:8787/\n"), [
		"https://primary.example/hub",
		"http://127.0.0.1:8787"
	]);
	assert.deepEqual(configuredCoordinatorUrls({ url: "https://legacy.example/" }), ["https://legacy.example"]);
	assert.deepEqual(configuredCoordinatorUrls({ url: "https://legacy.example", urls: ["https://new.example"] }), ["https://new.example"]);
	for (const bad of [
		"http://remote.example",
		"https://u:p@example.com",
		"https://example.com?token=secret",
		"https://example.com#fragment",
		"file:///tmp/a"
	])
		assert.throws(() => normalizeCoordinatorUrls(bad));
	assert.throws(() => normalizeCoordinatorUrls(Array.from({ length: 6 }, (_, i) => `https://${i}.example`)), /最多/);
});
test("read requests fail over in order, reuse the successful address and keep device identity and request payload", async () => {
	const calls = [],
		active = [];
	const urls = ["https://one.example", "https://two.example", "https://three.example"];
	const transport = async (url, operation) => {
		calls.push([url, operation]);
		if (url === urls[0]) throw unavailable();
		return { ok: true };
	};
	const result = await requestWithCoordinatorFailover(urls, undefined, read, transport, url => active.push(url));
	assert.equal(result.ok, true);
	assert.deepEqual(
		calls.map(c => c[0]),
		urls.slice(0, 2)
	);
	assert.strictEqual(calls[0][1], read);
	assert.strictEqual(calls[1][1], read);
	calls.length = 0;
	await requestWithCoordinatorFailover(urls, active.at(-1), read, transport, () => {});
	assert.deepEqual(
		calls.map(c => c[0]),
		[urls[1]]
	);
});
test("authentication, permission, conflicts and unknown failures never fall through to another authority", async () => {
	for (const failure of [
		{ message: "密钥已吊销", retryable: false, replay_safe: false },
		{ message: "IP 已占用", retryable: false, replay_safe: false },
		new Error("配置无效")
	]) {
		let calls = 0;
		await assert.rejects(
			requestWithCoordinatorFailover(
				["https://a.example", "https://b.example"],
				undefined,
				read,
				async () => {
					calls++;
					throw failure;
				},
				() => {}
			)
		);
		assert.equal(calls, 1);
	}
});
test("mutation can fail over when connection refusal proves no request was dispatched", async () => {
	const calls = [];
	const operation = { endpoint: "/v1/announcements", method: "POST", body: { title: "Hello" } };
	await requestWithCoordinatorFailover(
		["https://a.example", "https://b.example"],
		undefined,
		operation,
		async (url, request) => {
			calls.push([url, request]);
			if (calls.length === 1) throw unavailable(true);
			return { id: "created" };
		},
		() => {}
	);
	assert.equal(calls.length, 2);
	assert.strictEqual(calls[1][1], operation);
});
test("an ambiguous write is never replayed; backup connection is restored with a read only", async () => {
	const calls = [],
		active = [];
	let writes = 0;
	await assert.rejects(
		requestWithCoordinatorFailover(
			["https://a.example", "https://b.example"],
			undefined,
			{ endpoint: "/v1/admin/members/id/key", method: "POST" },
			async (url, operation) => {
				calls.push([url, operation]);
				if (operation.method === "POST") {
					writes++;
					throw unavailable(false);
				}
				return { me: { id: "owner" } };
			},
			url => active.push(url)
		),
		/结果未确认.*未重复提交.*已连接备用/
	);
	assert.equal(writes, 1);
	assert.equal(calls[1][1].endpoint, "/v1/state");
	assert.deepEqual(active, ["https://b.example"]);
});
test("all unreachable addresses are attempted once, and invalid old preferred addresses are ignored", async () => {
	const tried = [];
	await assert.rejects(
		requestWithCoordinatorFailover(
			["a", "b", "c"],
			"removed",
			read,
			async url => {
				tried.push(url);
				throw unavailable();
			},
			() => {}
		),
		/已尝试 3 个/
	);
	assert.deepEqual(tried, ["a", "b", "c"]);
});
test("failover recovers from a real HTTP 503 without changing the operation or duplicating a successful write", async () => {
	const records = [];
	const servers = [];
	try {
		const urls = [];
		for (const status of [503, 200]) {
			const server = createServer((req, res) => {
				records.push({ status, url: req.url, method: req.method });
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify(status === 200 ? { pool: "10.126.126.0/24" } : { error: "Unavailable" }));
			});
			servers.push(server);
			await new Promise(r => server.listen(0, "127.0.0.1", r));
			urls.push(`http://127.0.0.1:${server.address().port}`);
		}
		const result = await requestWithCoordinatorFailover(
			urls,
			undefined,
			read,
			async (url, operation) => {
				const response = await fetch(url + operation.endpoint, { method: operation.method });
				const result = await response.json();
				if (!response.ok) throw { message: result.error, retryable: response.status >= 500, replay_safe: false };
				return result;
			},
			() => {}
		);
		assert.equal(result.pool, "10.126.126.0/24");
		assert.deepEqual(
			records.map(r => r.method),
			["GET", "GET"]
		);
		assert.deepEqual(
			records.map(r => r.url),
			["/v1/state", "/v1/state"]
		);
	} finally {
		await Promise.all(servers.map(server => new Promise(r => server.close(r))));
	}
});

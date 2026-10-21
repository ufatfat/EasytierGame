import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { coordinatorDevMiddleware } from "../scripts/coordinator-dev.mts";
const serve = async handler => {
	const server = http.createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return { server, url: `http://127.0.0.1:${server.address().port}` };
};
const close = server =>
	new Promise(resolve => {
		server.close(resolve);
		server.closeAllConnections();
	});
test("Vite dev bridge preserves identity, methods, JSON errors and pre-dispatch failover safety", async () => {
	const backend = await serve((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.url === "/v1/state") {
			assert.equal(req.headers.authorization, "Bearer fixture-key");
			assert.equal(req.headers["x-client-token"], "fixture-client");
			res.end('{"ok":true}');
		} else {
			res.statusCode = 409;
			res.end('{"error":"地址已登记"}');
		}
	});
	const bridge = await serve(coordinatorDevMiddleware);
	const call = async input => {
		const response = await fetch(bridge.url, {
			method: "POST",
			body: JSON.stringify({ base_url: backend.url, service_token: "fixture-key", client_token: "fixture-client", ...input })
		});
		return { status: response.status, body: await response.json() };
	};
	try {
		assert.deepEqual(await call({ endpoint: "/v1/state" }), { status: 200, body: { ok: true } });
		const conflict = await call({ endpoint: "/v1/claim", method: "PUT", body: { ip: "10.1.1.2" } });
		assert.equal(conflict.status, 409);
		assert.equal(conflict.body.data.error, "地址已登记");
		assert.equal((await call({ endpoint: "/v1/state", base_url: "http://remote.example" })).status, 400);
		assert.equal((await call({ endpoint: "/v1/state", base_url: "https://user:secret@example.com" })).status, 400);
		assert.equal((await call({ endpoint: "/v1/unsupported" })).status, 400);
		await close(backend.server);
		const failure = await call({ endpoint: "/v1/state" });
		assert.equal(failure.status, 502);
		assert.equal(failure.body.data.failure.retryable, true);
		assert.equal(failure.body.data.failure.replay_safe, true);
	} finally {
		await close(backend.server);
		await close(bridge.server);
	}
});
test("Vite dev bridge does not follow redirects or replay ambiguous upstream errors", async () => {
	let redirected = false;
	const backend = await serve((req, res) => {
		if (req.url === "/redirected") redirected = true;
		res.writeHead(307, { location: "/redirected" });
		res.end();
	});
	const bridge = await serve(coordinatorDevMiddleware);
	try {
		const response = await fetch(bridge.url, { method: "POST", body: JSON.stringify({ base_url: backend.url, endpoint: "/v1/state" }) });
		assert.equal(response.status, 307);
		assert.equal(redirected, false);
	} finally {
		await close(bridge.server);
		await close(backend.server);
	}
});

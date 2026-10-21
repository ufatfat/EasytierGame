import { test } from "node:test";
import assert from "node:assert/strict";
import { roomJoinPatch, exactPeerUrls, logLevel, publicationSnapshot } from "../utils/lobby-domain.ts";
test("joining only replaces connection settings and preserves hostname and every IP mode", () => {
	for (const dhcp of [true, false]) {
		const current = {
			hostname: "Player1",
			dhcp,
			ipv4: "10.126.126.20",
			enableKcpProxy: true,
			protocol: ["udp"],
			serverUrl: ["old.example:11010"]
		};
		const next = roomJoinPatch(
			current,
			{ servers: ["tcp://a.example:11010", "udp://b.example:11010"], network_name: "new-room", password_mode: "ask" },
			"once"
		);
		assert.equal(next.hostname, current.hostname);
		assert.equal(next.dhcp, dhcp);
		assert.equal(next.ipv4, current.ipv4);
		assert.equal(next.enableKcpProxy, true);
		assert.equal(next.networkPassword, "once");
		assert.deepEqual(exactPeerUrls(next), ["tcp://a.example:11010", "udp://b.example:11010"]);
	}
});
test("editing servers after joining does not leave stale exact peer pairs or expand lobby URLs", () => {
	assert.deepEqual(exactPeerUrls({ protocol: ["tcp"], serverUrl: ["new.example:11010"], peerUrls: ["tcp://old.example:11010"] }), [
		"tcp://new.example:11010"
	]);
	assert.throws(() => roomJoinPatch({}, { servers: ["file:///etc/passwd"], network_name: "room", password_mode: "public" }, ""));
});
test("log filtering uses explicit levels and cannot mistake a URL containing err for an error", () => {
	assert.equal(logLevel("2026-10-21 ERROR failed to connect"), "ERROR");
	assert.equal(logLevel("INFO connect http://server.example"), "INFO");
	assert.equal(logLevel("warning peer lost"), "WARN");
});

test("a publication may only renew while its original network connection remains active", () => {
	const original = { protocol: ["tcp"], serverUrl: ["relay.example:11010"], networkName: "room", networkPassword: "one" };
	const snapshot = publicationSnapshot(original);
	assert.equal(publicationSnapshot({ ...original, hostname: "Changed", ipv4: "10.126.126.99" }), snapshot);
	for (const patch of [{ networkName: "other" }, { networkPassword: "two" }, { serverUrl: ["other.example:11010"] }])
		assert.notEqual(publicationSnapshot({ ...original, ...patch }), snapshot);
});

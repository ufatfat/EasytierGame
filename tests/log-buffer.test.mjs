import { test } from "node:test";
import assert from "node:assert/strict";
import { LogBuffer, LOG_LIMIT, LOG_BYTES, virtualLogRange } from "../utils/log-buffer.ts";
const packet = (generation, ids) => ({ stream: "client", generation, lines: ids.map(id => ({ id, text: `2026 INFO peer ${id}` })) });
test("a live batch racing the initial history merges all lines once and in order", () => {
	const log = new LogBuffer();
	log.merge(packet(1, [4, 5]));
	log.merge(packet(1, [1, 2, 3, 4]));
	assert.deepEqual(
		log.lines.map(line => line.id),
		[1, 2, 3, 4, 5]
	);
	assert.equal(log.merge(packet(1, [3, 4, 5])), false);
	assert.equal(log.lastId, 5);
	assert.equal(log.lines[0].level, "INFO");
	assert.match(log.lines[0].search, /info peer/);
});
test("clear survives late snapshots and the next session starts with a fresh cursor", () => {
	const log = new LogBuffer();
	log.merge(packet(1, [1, 2, 3]));
	log.clear();
	log.merge(packet(1, [1, 2, 3, 4]));
	assert.deepEqual(
		log.lines.map(line => line.id),
		[4]
	);
	log.merge(packet(2, [1, 2]));
	assert.deepEqual(
		log.lines.map(line => line.id),
		[1, 2]
	);
	assert.equal(log.merge(packet(1, [100])), false);
});
test("bursts and resumed history stay bounded by both line and memory limits", () => {
	const log = new LogBuffer();
	log.merge(
		packet(
			1,
			Array.from({ length: 7000 }, (_, i) => i + 1)
		)
	);
	assert.equal(log.lines.length, LOG_LIMIT);
	assert.equal(log.lines[0].id, 2001);
	assert.equal(log.merge(packet(1, [1, 2, 3])), false);
	log.merge({ stream: "client", generation: 2, lines: Array.from({ length: 400 }, (_, i) => ({ id: i + 1, text: "测试🙂".repeat(4096) })) });
	assert.ok(log.bytes <= LOG_BYTES);
	assert.ok(log.lines.length < 100);
	assert.equal(log.lastId, 400);
});
test("empty generation resets clear the previous session even before its first line", () => {
	const log = new LogBuffer();
	log.merge(packet(1, [1, 2]));
	assert.equal(log.merge(packet(2, [])), true);
	assert.deepEqual(log.lines, []);
});
test("virtualization keeps at most viewport rows plus overscan at the top, middle and bottom", () => {
	for (const top of [0, 22 * 2500, 22 * 5000 - 600]) {
		const range = virtualLogRange(5000, top, 600);
		assert.ok(range.end - range.start <= Math.ceil(600 / 22) + 17);
		assert.ok(range.start >= 0);
		assert.ok(range.end <= 5000);
	}
	assert.deepEqual(virtualLogRange(0, 10000, 600), { start: 0, end: 0 });
	assert.deepEqual(virtualLogRange(5, 10000, 600), { start: 5, end: 5 });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
const suffix = process.platform === "win32" ? ".exe" : "";
const core = `${process.cwd()}/src-tauri/easytier/easytier-core${suffix}`;
const cli = `${process.cwd()}/src-tauri/easytier/easytier-cli${suffix}`;
async function port() {
	const server = createServer();
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const value = server.address().port;
	await new Promise(resolve => server.close(resolve));
	return value;
}
test(
	"native core accepts a fixed IPv4/prefix and CLI reads it without administrator privileges",
	{ skip: !existsSync(core), timeout: 20000 },
	async () => {
		const rpc = `127.0.0.1:${await port()}`;
		const child = spawn(
			core,
			[
				"--no-tun",
				"true",
				"--ipv4",
				"10.126.126.42/24",
				"--hostname",
				"cross-platform-test",
				"--network-name",
				randomUUID(),
				"--listeners",
				"tcp://127.0.0.1:0",
				"--rpc-portal",
				rpc,
				"--disable-ipv6",
				"true"
			],
			{ stdio: ["ignore", "pipe", "pipe"] }
		);
		let output = "";
		for (const stream of [child.stdout, child.stderr])
			stream.on("data", bytes => {
				output = (output + bytes).slice(-10000);
			});
		try {
			let members;
			for (let attempt = 0; attempt < 40; attempt++) {
				if (child.exitCode !== null) assert.fail(`Core exited: ${output}`);
				try {
					members = JSON.parse((await exec(cli, ["-p", rpc, "-o", "json", "peer", "list"], { timeout: 1000 })).stdout);
					if (members.length) break;
				} catch {
					/* RPC starts asynchronously. */
				}
				await new Promise(resolve => setTimeout(resolve, 200));
			}
			assert.ok(
				members?.some(member => member.ipv4 === "10.126.126.42" && member.hostname === "cross-platform-test"),
				output
			);
		} finally {
			const exited = once(child, "exit");
			if (child.exitCode === null) {
				child.kill();
				await exited;
			}
		}
	}
);

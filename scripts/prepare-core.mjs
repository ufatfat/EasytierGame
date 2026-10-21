// Fetch the pinned upstream core for this build host. GitHub's SHA-256 digest is required.
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const version = process.env.EASYTIER_VERSION || "v2.6.4";
const platform = { darwin: "macos", win32: "windows" }[process.platform];
const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch];
if (!platform || !arch) throw new Error("Only Windows/macOS x64/arm64 builds are supported");
const name = `easytier-${platform}-${arch}-${version}.zip`;
const headers = { "User-Agent": "EasyTierGame-build", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const releaseResponse = await fetch(`https://api.github.com/repos/EasyTier/EasyTier/releases/tags/${version}`, { headers });
if (!releaseResponse.ok) throw new Error(`Release metadata: HTTP ${releaseResponse.status}`);
const release = await releaseResponse.json();
const asset = release.assets.find(a => a.name === name);
if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")) throw new Error(`Missing asset or SHA-256 digest: ${name}`);
const response = await fetch(asset.browser_download_url);
if (!response.ok) throw new Error(`Core download: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== asset.digest) throw new Error("Core checksum mismatch");
const temporary = mkdtempSync(join(tmpdir(), "etg-core-"));
try {
	const archive = join(temporary, "core.zip");
	writeFileSync(archive, bytes);
	if (process.platform === "win32") execFileSync("tar", ["-xf", archive, "-C", temporary]);
	else execFileSync("/usr/bin/unzip", ["-q", archive, "-d", temporary]);
	const find = (folder, filename) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isFile() && entry.name === filename) return path;
			if (entry.isDirectory()) {
				const result = find(path, filename);
				if (result) return result;
			}
		}
	};
	mkdirSync("src-tauri/easytier", { recursive: true });
	const files = platform === "windows" ? ["easytier-core.exe", "easytier-cli.exe", "wintun.dll", "Packet.dll"] : ["easytier-core", "easytier-cli"];
	for (const name of files) {
		const file = find(temporary, name);
		if (!file) throw new Error(`Missing ${name} in upstream archive`);
		copyFileSync(file, `src-tauri/easytier/${name}`);
		if (platform === "macos") chmodSync(`src-tauri/easytier/${name}`, 0o755);
	}
	console.log(`Prepared ${name} (SHA-256 verified)`);
} finally {
	rmSync(temporary, { force: true, recursive: true });
}

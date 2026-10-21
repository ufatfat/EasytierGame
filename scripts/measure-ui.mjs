// Compare the complete frontend JS/CSS artifacts. No FPS or native-memory claims.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
async function measure(directory) {
	const files = [];
	async function walk(path) {
		for (const entry of await readdir(path, { withFileTypes: true })) {
			const file = join(path, entry.name);
			if (entry.isDirectory()) await walk(file);
			else files.push(file);
		}
	}
	await walk(directory);
	const scripts = await Promise.all(files.filter(file => file.endsWith(".js")).map(file => readFile(file)));
	const styles = await Promise.all(files.filter(file => file.endsWith(".css")).map(file => stat(file)));
	return {
		js_bytes: scripts.reduce((sum, buffer) => sum + buffer.length, 0),
		js_gzip: scripts.reduce((sum, buffer) => sum + gzipSync(buffer).length, 0),
		css_bytes: styles.reduce((sum, file) => sum + file.size, 0),
		js_chunks: scripts.length
	};
}
const after = await measure("dist");
const before = process.argv[2] ? await measure(process.argv[2]) : undefined;
console.log(
	JSON.stringify(
		{
			...(before ? { before } : {}),
			after,
			...(before
				? {
						js_reduction_percent: +((1 - after.js_bytes / before.js_bytes) * 100).toFixed(2),
						gzip_reduction_percent: +((1 - after.js_gzip / before.js_gzip) * 100).toFixed(2)
					}
				: {})
		},
		null,
		2
	)
);

import { logLevel } from "./lobby-domain.ts";
export type LogEntry = { id: number; text: string };
export type LogPacket = { stream: string; generation: number; lines: LogEntry[] };
export type DisplayLog = LogEntry & { level: ReturnType<typeof logLevel>; search: string };
export const LOG_LIMIT = 5000,
	LOG_BYTES = 2_000_000,
	LOG_ROW_HEIGHT = 22;
export class LogBuffer {
	generation = -1;
	lastId = 0;
	bytes = 0;
	lines: DisplayLog[] = [];
	private ids = new Set<number>();
	private droppedThrough = 0;
	merge(packet: LogPacket): boolean {
		if (packet.generation < this.generation) return false;
		let changed = false;
		if (packet.generation > this.generation) {
			this.generation = packet.generation;
			this.lastId = this.droppedThrough = this.bytes = 0;
			this.lines = [];
			this.ids.clear();
			changed = true;
		}
		const incoming: DisplayLog[] = [];
		for (const line of packet.lines) {
			if (line.id <= this.droppedThrough || this.ids.has(line.id)) continue;
			this.ids.add(line.id);
			incoming.push({ ...line, level: logLevel(line.text), search: line.text.toLocaleLowerCase() });
			this.bytes += line.text.length * 2;
		}
		if (incoming.length) {
			const outOfOrder = incoming.some((line, i) => line.id < (i ? incoming[i - 1].id : this.lastId));
			this.lines.push(...incoming);
			if (outOfOrder) this.lines.sort((a, b) => a.id - b.id);
			this.lastId = this.lines[this.lines.length - 1].id;
			changed = true;
		}
		let trim = 0;
		while (this.lines.length - trim > LOG_LIMIT || this.bytes > LOG_BYTES) {
			const line = this.lines[trim++];
			this.ids.delete(line.id);
			this.bytes -= line.text.length * 2;
			this.droppedThrough = Math.max(this.droppedThrough, line.id);
		}
		if (trim) this.lines = this.lines.slice(trim);
		return changed;
	}
	clear() {
		this.droppedThrough = this.lastId;
		this.lines = [];
		this.ids.clear();
		this.bytes = 0;
	}
}
export function virtualLogRange(length: number, scrollTop: number, height: number, overscan = 8) {
	const start = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - overscan);
	const end = Math.min(length, Math.ceil((scrollTop + height) / LOG_ROW_HEIGHT) + overscan);
	return { start: Math.min(start, length), end: Math.max(Math.min(start, length), end) };
}

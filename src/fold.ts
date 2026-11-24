// Rebuilds a file from its log rows.
// append adds a line, write resets the file, revert cancels the row it names.
import { localDate } from "./time";

export interface LogRow {
	id: number;
	ts: string;
	project: string;
	path: string;
	op: "append" | "write" | "revert";
	content: string;
	reason: string;
	reverts: number | null;
}

export function fold(rows: LogRow[]): string[] {
	const sorted = [...rows].sort((a, b) => a.id - b.id);
	const reverted = new Set(sorted.filter((r) => r.op === "revert" && r.reverts != null).map((r) => r.reverts));
	let lines: string[] = [];
	for (const r of sorted) {
		if (r.op === "revert" || reverted.has(r.id)) continue;
		const source = `(${r.project}, ${localDate(r.ts)})`;
		if (r.op === "append") {
			lines.push(`- ${r.content} ${source}`);
		} else {
			// write (V1): the row's content replaces the whole file.
			lines = r.content.split(/\r?\n/).filter((l) => l.trim()).map((l) => `${l} ${source}`);
		}
	}
	return lines;
}

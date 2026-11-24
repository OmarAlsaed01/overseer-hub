import { isProject, readableNamespaces } from "../rules";
import type { LogRow } from "../fold";
import { localDateTime } from "../time";

export const CHANGES_LIMIT = 200;

// Duet's own cursor saves stay in the log but aren't news, so changes() skips them.
export const HIDDEN_FROM_CHANGES = ["/duet/cursor.md"];

/**
 * changes(since): rows after a row id ("42") or an ISO time, oldest first,
 * limited to the namespaces the caller may read. Always ends with the newest id
 * so the caller can keep its own cursor.
 */
export async function listChanges(db: D1Database, project: string, since: string): Promise<{ text: string; isError: boolean }> {
	if (!isProject(project)) return { text: `Rejected (project): unknown project ${JSON.stringify(project)}`, isError: true };

	const s = since.trim();
	let where: string;
	let arg: number | string;
	if (/^\d+$/.test(s)) {
		where = "id > ?";
		arg = Number(s);
	} else {
		const t = new Date(s);
		if (!s || Number.isNaN(t.getTime()))
			return { text: "Rejected (since): use a row id like 42 or an ISO time like 2026-11-23T00:00:00Z", isError: true };
		where = "ts > ?";
		arg = t.toISOString();
	}

	const ns = readableNamespaces(project);
	const nsClause = ns.map(() => "substr(path, 1, ?) = ?").join(" OR ");
	const nsArgs = ns.flatMap((n) => [n.length + 2, `/${n}/`]);

	const hidden = HIDDEN_FROM_CHANGES.map(() => "?").join(", ");
	const { results } = await db
		.prepare(
			`SELECT id, ts, project, path, op, content, reason, reverts FROM log
			 WHERE ${where} AND (${nsClause}) AND path NOT IN (${hidden}) ORDER BY id LIMIT ?`,
		)
		.bind(arg, ...nsArgs, ...HIDDEN_FROM_CHANGES, CHANGES_LIMIT + 1)
		.all<LogRow>();

	const truncated = results.length > CHANGES_LIMIT;
	const rows = results.slice(0, CHANGES_LIMIT);

	const newest = await db
		.prepare(`SELECT MAX(id) AS id FROM log WHERE ${nsClause}`)
		.bind(...nsArgs)
		.first<{ id: number | null }>();

	const out = rows.map((r) => {
		const target = r.op === "revert" ? ` reverts #${r.reverts}` : "";
		return `#${r.id} ${localDateTime(r.ts)} ${r.project} ${r.op} ${r.path}${target} | reason: ${r.reason} | ${r.content}`;
	});
	if (out.length === 0) out.push("No changes.");
	// When truncated, the cursor is the last row shown, so the next call picks up the rest.
	const cursor = truncated ? rows[rows.length - 1].id : (newest?.id ?? 0);
	if (truncated) out.push(`More rows remain. Call again with since=${cursor}.`);
	out.push(`Cursor: ${cursor}`);
	return { text: out.join("\n"), isError: false };
}

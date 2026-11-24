import { checkAppend } from "../rules";

/** append(path, line, reason): one new row. The server sets ts; the caller never does. */
export async function appendLine(
	db: D1Database,
	project: string,
	path: string,
	line: string,
	reason: string,
	now: Date = new Date(),
): Promise<{ text: string; isError: boolean }> {
	const check = checkAppend(project, path, line, reason);
	if (!check.ok) return { text: check.error, isError: true };

	const row = await db
		.prepare("INSERT INTO log (ts, project, path, op, content, reason) VALUES (?, ?, ?, 'append', ?, ?) RETURNING id")
		.bind(now.toISOString(), project, path, line, reason.trim())
		.first<{ id: number }>();
	return { text: `Appended to ${path} as row ${row?.id}.`, isError: false };
}

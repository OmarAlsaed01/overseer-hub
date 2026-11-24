// Generic starter text for each namespace's index.md. Committed to the repo,
// so it must stay generic: no real facts, names or numbers, ever.
export const SEED_INDEX: Record<string, string> = {
	shared: "Facts more than one project needs, such as household, people, dates and bills. One subject per file.",
	finance: "Finance's own notes: budgets, accounts and money plans. Only Finance writes here; Duet can read it.",
	duet: "Duet's own notes, including the cursor for its changes digest.",
};

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * One INSERT per namespace, each skipped if that index.md already has rows.
 * The log is append-only, so this must be safe to run twice.
 */
export function seedSql(now: Date = new Date()): string[] {
	const ts = q(now.toISOString());
	return Object.entries(SEED_INDEX).map(([ns, text]) => {
		const path = q(`/${ns}/index.md`);
		return (
			`INSERT INTO log (ts, project, path, op, content, reason) ` +
			`SELECT ${ts}, 'seed', ${path}, 'append', ${q(text)}, 'seed index' ` +
			`WHERE NOT EXISTS (SELECT 1 FROM log WHERE path = ${path});`
		);
	});
}

// Tool behaviour against a local D1. All facts here are made up.
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { seedSql } from "../src/seed-data";
import { appendLine } from "../src/tools/append";
import { CHANGES_LIMIT, listChanges } from "../src/tools/changes";
import { readFile, READ_NOTE } from "../src/tools/read";

const db = () => env.DB;
const cursorOf = (text: string) => Number(/Cursor: (\d+)/.exec(text)![1]);

describe("append-only", () => {
	it("refuses UPDATE and DELETE at the database", async () => {
		await appendLine(db(), "duet", "/duet/notes.md", "made-up note", "testing");
		await expect(db().prepare("UPDATE log SET content = 'x'").run()).rejects.toThrow(/append-only/);
		await expect(db().prepare("DELETE FROM log").run()).rejects.toThrow(/append-only/);
	});

	it("sets ts on the server", async () => {
		const fixed = new Date("2030-05-06T07:08:09.000Z");
		await appendLine(db(), "finance", "/finance/ts.md", "made-up", "testing", fixed);
		const row = await db().prepare("SELECT ts FROM log WHERE path = '/finance/ts.md'").first<{ ts: string }>();
		expect(row?.ts).toBe(fixed.toISOString());
	});
});

describe("seed", () => {
	it("is safe to run twice", async () => {
		for (let i = 0; i < 2; i++) for (const s of seedSql()) await db().prepare(s).run();
		const { results } = await db().prepare("SELECT path, COUNT(*) AS n FROM log GROUP BY path").all<{ path: string; n: number }>();
		expect(results.filter((r) => r.path.endsWith("/index.md")).map((r) => r.n)).toEqual([1, 1, 1]);
	});
});

describe("read", () => {
	it("frames stored lines as data and lists files on index reads", async () => {
		for (const s of seedSql()) await db().prepare(s).run();
		await appendLine(db(), "duet", "/shared/test-bills.md", "Made-up gas bill is due on the 3rd", "testing");
		const r = await readFile(db(), "finance", "/shared/index.md");
		expect(r.isError).toBe(false);
		expect(r.text).toContain(READ_NOTE);
		expect(r.text).toContain("Files in /shared/: /shared/index.md, /shared/test-bills.md");
	});

	it("refuses reads outside the caller's map", async () => {
		const r = await readFile(db(), "finance", "/duet/index.md");
		expect(r.isError).toBe(true);
		expect(r.text).toContain("Rejected (access)");
	});

	it("says when a file doesn't exist", async () => {
		const r = await readFile(db(), "duet", "/shared/nothing-here.md");
		expect(r).toEqual({ text: "No such file: /shared/nothing-here.md", isError: true });
	});
});

describe("changes", () => {
	it("only shows namespaces the caller may read", async () => {
		await appendLine(db(), "duet", "/duet/private.md", "made-up duet note", "testing");
		await appendLine(db(), "duet", "/shared/visible.md", "made-up shared note", "testing");
		const fin = await listChanges(db(), "finance", "0");
		expect(fin.text).toContain("/shared/visible.md");
		expect(fin.text).not.toContain("/duet/private.md");
		const duet = await listChanges(db(), "duet", "0");
		expect(duet.text).toContain("/duet/private.md");
	});

	it("skips Duet's cursor saves but still moves the cursor past them", async () => {
		await appendLine(db(), "duet", "/shared/news.md", "made-up news", "testing");
		await appendLine(db(), "duet", "/duet/cursor.md", "42", "digest cursor");
		const r = await listChanges(db(), "duet", "0");
		expect(r.text).toContain("/shared/news.md");
		expect(r.text).not.toContain("/duet/cursor.md");
		const max = await db().prepare("SELECT MAX(id) AS id FROM log").first<{ id: number }>();
		expect(cursorOf(r.text)).toBe(max!.id);
	});

	it("shows Detroit time, so a late-evening write keeps its local date", async () => {
		// 9:30 PM EST on Nov 23 is 02:30 UTC on Nov 24.
		await appendLine(db(), "duet", "/shared/late.md", "made-up late note", "testing", new Date("2026-11-24T02:30:00Z"));
		expect((await listChanges(db(), "duet", "0")).text).toContain("2026-11-23 21:30 EST");
		expect((await readFile(db(), "duet", "/shared/late.md")).text).toContain("(duet, 2026-11-23)");
	});

	it("caps rows and hands back a cursor that picks up the rest", async () => {
		for (let i = 0; i < CHANGES_LIMIT + 5; i++) await appendLine(db(), "duet", "/duet/bulk.md", `made-up ${i}`, "bulk");
		const first = await listChanges(db(), "duet", "0");
		expect(first.text).toContain("More rows remain");
		const second = await listChanges(db(), "duet", String(cursorOf(first.text)));
		expect(second.text).not.toContain("More rows remain");
		expect(second.text).toContain("made-up " + (CHANGES_LIMIT + 4));
	});

	it("accepts an ISO time and rejects junk", async () => {
		expect((await listChanges(db(), "duet", "2000-01-01T00:00:00Z")).isError).toBe(false);
		expect((await listChanges(db(), "duet", "yesterday")).text).toContain("Rejected (since)");
	});
});

describe("bills case (fake data)", () => {
	it("a fact from Duet reaches Finance, and Finance's write reaches Duet", async () => {
		for (const s of seedSql()) await db().prepare(s).run();
		const start = cursorOf((await listChanges(db(), "duet", "0")).text);

		// 1. Duet records a bills fact in /shared.
		const a = await appendLine(db(), "duet", "/shared/bills.md", "Made-up water bill is due on the 9th", "told in main chat");
		expect(a.isError).toBe(false);

		// 2. Finance reads its indexes at chat start and finds bills.md in the list.
		expect((await readFile(db(), "finance", "/finance/index.md")).isError).toBe(false);
		const idx = await readFile(db(), "finance", "/shared/index.md");
		expect(idx.text).toContain("/shared/bills.md");

		// 3. Finance follows it and gets the fact, with source and date.
		const bills = await readFile(db(), "finance", "/shared/bills.md");
		expect(bills.text).toMatch(/- Made-up water bill is due on the 9th \(duet, \d{4}-\d{2}-\d{2}\)/);

		// 4. Finance writes back.
		await appendLine(db(), "finance", "/shared/bills.md", "Made-up water bill paid early", "user said so in Finance");

		// 5. Duet's changes(since) returns it with project, path and reason.
		const ch = await listChanges(db(), "duet", String(start));
		expect(ch.text).toMatch(/finance append \/shared\/bills\.md \| reason: user said so in Finance/);
	});
});

describe("auth gate", () => {
	it("refuses /mcp without a token", async () => {
		const res = await exports.default.fetch("https://hub.test/mcp", { method: "POST", body: "{}" });
		expect(res.status).toBe(401);
	});
	it("refuses client registration from anything but claude.ai", async () => {
		const res = await exports.default.fetch("https://hub.test/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"], token_endpoint_auth_method: "none" }),
		});
		expect(res.status).toBe(403);
	});
});

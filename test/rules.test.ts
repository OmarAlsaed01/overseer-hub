import { describe, expect, it } from "vitest";
import { checkAppend, checkRead, MAX_LINE } from "../src/rules";
import { fold, type LogRow } from "../src/fold";

const ok = (c: { ok: boolean }) => expect(c.ok).toBe(true);
const rejected = (c: { ok: boolean; error?: string }, rule: string) => {
	expect(c.ok).toBe(false);
	expect((c as { error: string }).error).toContain(`Rejected (${rule})`);
};

describe("write rules", () => {
	it("accepts a valid append", () => ok(checkAppend("finance", "/shared/test-bills.md", "A made-up line", "testing")));
	it("1. rejects an unknown project", () => rejected(checkAppend("career", "/shared/x.md", "l", "r"), "project"));
	it("2. rejects a blank reason", () => rejected(checkAppend("finance", "/shared/x.md", "l", "   "), "reason"));
	it("3. rejects a bad path shape", () => {
		rejected(checkAppend("finance", "/shared/Bills.md", "l", "r"), "path");
		rejected(checkAppend("finance", "shared/x.md", "l", "r"), "path");
		rejected(checkAppend("finance", "/shared/x.txt", "l", "r"), "path");
		rejected(checkAppend("finance", "/shared/a/b.md", "l", "r"), "path");
	});
	it("3. rejects an unknown namespace", () => rejected(checkAppend("finance", "/health/x.md", "l", "r"), "path"));
	it("4. rejects writes outside own namespace and /shared", () => {
		rejected(checkAppend("duet", "/finance/x.md", "l", "r"), "namespace");
		rejected(checkAppend("finance", "/duet/x.md", "l", "r"), "namespace");
		ok(checkAppend("duet", "/duet/x.md", "l", "r"));
	});
	it("5. rejects blank, multi-line or too-long lines", () => {
		rejected(checkAppend("finance", "/finance/x.md", "  ", "r"), "line");
		rejected(checkAppend("finance", "/finance/x.md", "one\ntwo", "r"), "line");
		rejected(checkAppend("finance", "/finance/x.md", "x".repeat(MAX_LINE + 1), "r"), "line");
		ok(checkAppend("finance", "/finance/x.md", "x".repeat(MAX_LINE), "r"));
	});
	it("never echoes the line in an error", () => {
		const c = checkAppend("duet", "/finance/x.md", "SECRET-LOOKING-LINE", "r");
		expect(JSON.stringify(c)).not.toContain("SECRET-LOOKING-LINE");
	});
});

describe("read map", () => {
	it("finance reads finance and shared only", () => {
		ok(checkRead("finance", "/finance/index.md"));
		ok(checkRead("finance", "/shared/index.md"));
		rejected(checkRead("finance", "/duet/index.md"), "access");
	});
	it("duet reads all three", () => {
		for (const ns of ["duet", "finance", "shared"]) ok(checkRead("duet", `/${ns}/index.md`));
	});
});

describe("fold", () => {
	const row = (id: number, op: LogRow["op"], content: string, reverts: number | null = null): LogRow => ({
		id, ts: "2026-01-02T15:04:05.000Z", project: "duet", path: "/shared/x.md", op, content, reason: "r", reverts,
	});
	it("renders appends with source and date", () => {
		expect(fold([row(1, "append", "First")])).toEqual(["- First (duet, 2026-01-02)"]);
	});
	it("drops a reverted row", () => {
		expect(fold([row(1, "append", "A"), row(2, "append", "B"), row(3, "revert", "", 1)])).toEqual(["- B (duet, 2026-01-02)"]);
	});
	it("write resets the file", () => {
		expect(fold([row(1, "append", "A"), row(2, "write", "X\nY")])).toEqual(["X (duet, 2026-01-02)", "Y (duet, 2026-01-02)"]);
	});
});

// Seeds each namespace's index.md into D1. Safe to run twice: it skips any
// namespace that already has an index. Usage: node scripts/seed.ts --local | --remote
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedSql } from "../src/seed-data.ts";

const target = process.argv.includes("--remote") ? "--remote" : process.argv.includes("--local") ? "--local" : null;
if (!target) {
	console.error("Pass --local or --remote.");
	process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "hub-seed-"));
const file = join(dir, "seed.sql");
try {
	writeFileSync(file, seedSql().join("\n"));
	execFileSync("npx", ["wrangler", "d1", "execute", "overseer-hub", target, "--file", file, "--yes"], {
		stdio: "inherit",
		shell: process.platform === "win32",
	});
} finally {
	rmSync(dir, { recursive: true, force: true });
}

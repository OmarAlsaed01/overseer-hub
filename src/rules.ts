// Namespaces, the access map and write validation, in one place.
// Shaped like the future /_meta/access.yml so V1 can load it from there.

export const NAMESPACES = ["shared", "finance", "duet"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const ACCESS: Record<string, { read: Namespace[]; write: Namespace[] }> = {
	finance: { read: ["finance", "shared"], write: ["finance", "shared"] },
	duet: { read: ["duet", "finance", "shared"], write: ["duet", "shared"] },
};

export const MAX_LINE = 2000;
const PATH_RE = /^\/([a-z0-9-]+)\/([a-z0-9-]+)\.md$/;

export type Check = { ok: true; namespace: Namespace } | { ok: false; error: string };

function fail(rule: string, detail: string): Check {
	return { ok: false, error: `Rejected (${rule}): ${detail}` };
}

export function isProject(project: string): boolean {
	return Object.hasOwn(ACCESS, project);
}

/** Path shape and namespace existence. Shared by reads and writes. */
export function checkPath(path: string): Check {
	const m = PATH_RE.exec(path);
	if (!m) return fail("path", `${JSON.stringify(path)} must look like /<namespace>/<name>.md, lowercase letters, digits and hyphens`);
	if (!(NAMESPACES as readonly string[]).includes(m[1])) return fail("path", `unknown namespace /${m[1]}`);
	return { ok: true, namespace: m[1] as Namespace };
}

export function checkRead(project: string, path: string): Check {
	if (!isProject(project)) return fail("project", `unknown project ${JSON.stringify(project)}`);
	const p = checkPath(path);
	if (!p.ok) return p;
	if (!ACCESS[project].read.includes(p.namespace)) return fail("access", `${project} may not read /${p.namespace}`);
	return p;
}

/** The five write rules from the kickoff, checked in order. Errors name the rule, never echo the line. */
export function checkAppend(project: string, path: string, line: string, reason: string): Check {
	if (!isProject(project)) return fail("project", `unknown project ${JSON.stringify(project)}`);
	if (!reason || !reason.trim()) return fail("reason", "reason is required and must not be blank");
	const p = checkPath(path);
	if (!p.ok) return p;
	if (!ACCESS[project].write.includes(p.namespace)) return fail("namespace", `${project} may not write to /${p.namespace}`);
	if (!line || !line.trim()) return fail("line", "line must not be blank");
	if (/[\r\n]/.test(line)) return fail("line", "line must be a single line");
	if (line.length > MAX_LINE) return fail("line", `line is ${line.length} characters; the limit is ${MAX_LINE}`);
	return p;
}

export function readableNamespaces(project: string): Namespace[] {
	return isProject(project) ? ACCESS[project].read : [];
}

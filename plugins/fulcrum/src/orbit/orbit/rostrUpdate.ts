/** Frontmatter keys a Rostr scrape replaces, including when the new value is empty. */
export const ROSTR_REPLACE_STRING_KEYS = [
	"name",
	"pronouns",
	"title",
	"position",
	"department",
	"email",
	"workPhone",
	"cellPhone",
	"cover",
	"location",
	"city",
	"state",
	"org_up",
	"expertise",
	"updated",
	"rostr",
] as const;

export type RostrUpdateFields = {
	name?: unknown;
	pronouns?: unknown;
	title?: unknown;
	position?: unknown;
	department?: unknown;
	email?: unknown;
	workPhone?: unknown;
	cellPhone?: unknown;
	cover?: unknown;
	location?: unknown;
	city?: unknown;
	state?: unknown;
	org_up?: unknown;
	org_down?: unknown;
	expertise?: unknown;
	projects?: unknown;
	summary?: unknown;
	updated?: unknown;
	rostr?: unknown;
};

/** Origin plus path. Query and hash are dropped. Host case is ignored; path case is kept. */
export function normalizeRostrUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	try {
		const u = new URL(trimmed);
		if (u.protocol !== "https:" && u.protocol !== "http:") return "";
		const path = u.pathname.replace(/\/+$/, "") || "/";
		return `${u.protocol}//${u.host.toLowerCase()}${path}`;
	} catch {
		return "";
	}
}

export function rostrUrlsMatch(a: string, b: string): boolean {
	const left = normalizeRostrUrl(a);
	const right = normalizeRostrUrl(b);
	return left.length > 0 && left === right;
}

/** Profile URL the extension watches for. The hash stays off the request Rostr's server sees. */
export function rostrUpdateHashUrl(rostrUrl: string, token: string, port: number): string {
	const base = normalizeRostrUrl(rostrUrl);
	const q = new URLSearchParams({token, port: String(port)});
	return `${base}#orbit-update&${q.toString()}`;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asStringList(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	return value.filter((item): item is string => typeof item === "string");
}

/**
 * Merge a Rostr scrape into frontmatter.
 * Banner, color, company, tags, aliases, and the rest of the note stay as they are.
 * A blank summary does not wipe a summary already on the note.
 */
export function applyRostrFields(fm: Record<string, unknown>, fields: RostrUpdateFields): void {
	for (const key of ROSTR_REPLACE_STRING_KEYS) {
		const value = asString(fields[key]);
		if (value !== null) fm[key] = value;
	}
	const orgDown = asStringList(fields.org_down);
	if (orgDown) fm.org_down = orgDown;
	const projects = asStringList(fields.projects);
	if (projects) fm.projects = projects;
	const summary = asString(fields.summary);
	if (summary !== null && summary.trim()) fm.summary = summary;
}

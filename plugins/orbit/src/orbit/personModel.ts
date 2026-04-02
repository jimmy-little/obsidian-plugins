import type {CachedMetadata} from "obsidian";

export type PersonFrontmatter = {
	name?: string;
	aliases?: string[];
	company?: string;
	/** Office name, site, or e.g. Remote (may be wikilink). */
	location?: string;
	city?: string;
	state?: string;
	org_up?: string;
	/** Wikilink lines or list entries from frontmatter. */
	org_down?: string | string[];
	avatar?: string;
	color?: string;
	tags?: string[];
};

export function readPersonFrontmatter(cache: CachedMetadata | null | undefined): PersonFrontmatter {
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const orgDown = fm.org_down;
	return {
		name: typeof fm.name === "string" ? fm.name : undefined,
		aliases: Array.isArray(fm.aliases) ? (fm.aliases as string[]) : undefined,
		company: typeof fm.company === "string" ? fm.company : undefined,
		location: typeof fm.location === "string" ? fm.location : undefined,
		city: typeof fm.city === "string" ? fm.city : undefined,
		state: typeof fm.state === "string" ? fm.state : undefined,
		org_up: typeof fm.org_up === "string" ? fm.org_up : undefined,
		org_down:
			typeof orgDown === "string"
				? orgDown
				: Array.isArray(orgDown)
					? (orgDown as string[])
					: undefined,
		avatar: typeof fm.avatar === "string" ? fm.avatar : undefined,
		color: typeof fm.color === "string" ? fm.color : undefined,
		tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : undefined,
	};
}

export function displayNameForPerson(fm: PersonFrontmatter, basename: string): string {
	const n = fm.name?.trim();
	if (n) return n;
	return basename.replace(/\.md$/i, "");
}

/** Show `[[note|Alias]]` or `[[note]]` as display text only. */
export function stripWikiLinkDisplay(raw: string): string {
	return raw.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)]]/g, "$1").trim();
}

/**
 * Banner line: up to company | location | city, state — omitting blanks (no extra pipes).
 */
export function formatPersonWorkLocationLine(fm: PersonFrontmatter): string {
	const parts: string[] = [];
	const company = stripWikiLinkDisplay(fm.company?.trim() ?? "");
	if (company) parts.push(company);
	const location = stripWikiLinkDisplay(fm.location?.trim() ?? "");
	if (location) parts.push(location);
	const city = fm.city?.trim() ?? "";
	const state = fm.state?.trim() ?? "";
	let locality = "";
	if (city && state) locality = `${city}, ${state}`;
	else if (city) locality = city;
	else if (state) locality = state;
	if (locality) parts.push(locality);
	return parts.join(" | ");
}

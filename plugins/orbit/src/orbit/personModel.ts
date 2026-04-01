import type {CachedMetadata} from "obsidian";

export type PersonFrontmatter = {
	name?: string;
	aliases?: string[];
	company?: string;
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

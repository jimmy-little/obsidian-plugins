/** Extract link path from `[[Note]]` or `[[Note|alias]]`, or return trimmed plain string. */
export function parseWikiLink(raw: unknown): string | null {
	if (raw == null) return null;
	if (typeof raw !== "string") return null;
	const s = raw.trim();
	const m = s.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$/);
	if (m?.[1]) return m[1].trim();
	if (s.includes("[[")) return null;
	return s.length ? s : null;
}

/**
 * Project (or task) area field: single wikilink / path, or YAML list of links.
 * Returns Obsidian link paths (no extension), deduped in order.
 */
export function parseAreaLinkPaths(raw: unknown): string[] {
	if (raw == null) return [];
	const paths: string[] = [];
	const add = (p: string | null): void => {
		if (!p?.trim()) return;
		paths.push(p.trim());
	};
	if (Array.isArray(raw)) {
		for (const item of raw) {
			if (item == null) continue;
			add(parseWikiLink(item) ?? (typeof item === "string" ? item.trim() || null : null));
		}
	} else {
		add(parseWikiLink(raw));
	}
	const seen = new Set<string>();
	const out: string[] = [];
	for (const p of paths) {
		const key = p.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(p);
	}
	return out;
}

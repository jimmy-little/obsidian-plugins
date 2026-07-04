/** Strip `[[…]]` wikilink syntax to display text (matches Fulcrum timeline). */
export function stripWikiLinks(s: string): string {
	return s.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1");
}

/**
 * If `type` frontmatter (after wikilink strip) starts with an emoji grapheme, return it
 * for the activity timeline node (Fulcrum timeline behavior).
 */
export function leadingTimelineEmojiFromType(typeRaw: string | undefined): string | undefined {
	if (!typeRaw?.trim()) return undefined;
	const display = stripWikiLinks(typeRaw).trimStart();
	if (!display) return undefined;
	try {
		const seg = new Intl.Segmenter(undefined, {granularity: "grapheme"});
		const first = [...seg.segment(display)][0];
		if (!first) return undefined;
		const g = first.segment;
		if (/\p{Extended_Pictographic}/u.test(g)) return g;
		return undefined;
	} catch {
		return undefined;
	}
}

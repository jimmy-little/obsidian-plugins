import type {App, TFile} from "obsidian";

export type WikiLinkRef = {
	/** Obsidian link path (no alias). */
	linkText: string;
	/** Alias when present, else link path. */
	displayName: string;
};

/** Parse one `[[path]]` or `[[path|alias]]` fragment. */
export function parseWikiLinkRef(raw: string): WikiLinkRef | null {
	const m = raw.trim().match(/\[\[([^\]]+)]]/);
	if (!m) return null;
	const inner = m[1]!.trim();
	const pipe = inner.indexOf("|");
	const linkText = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
	if (!linkText) return null;
	const displayName = (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim() || linkText;
	return {linkText, displayName};
}

/** Extract `[[link]]` refs (path + display alias) from a frontmatter string. */
export function wikiLinkRefsFromText(raw: string | undefined): WikiLinkRef[] {
	if (!raw || typeof raw !== "string") return [];
	const re = /\[\[([^\]]+)]]/g;
	const out: WikiLinkRef[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(raw)) !== null) {
		const inner = m[1]!.trim();
		const pipe = inner.indexOf("|");
		const linkText = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
		if (!linkText) continue;
		const displayName = (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim() || linkText;
		out.push({linkText, displayName});
	}
	return out;
}

/** Extract `[[link text]]` targets from a single frontmatter string. */
export function wikiLinkPathsFromText(raw: string | undefined): string[] {
	return wikiLinkRefsFromText(raw).map((r) => r.linkText);
}

export function resolveWikiPath(app: App, linktext: string, source: TFile): string | null {
	const dest = app.metadataCache.getFirstLinkpathDest(linktext, source.path);
	return dest?.path ?? null;
}

import type {App, TFile} from "obsidian";

/** Extract `[[link text]]` targets from a single frontmatter string. */
export function wikiLinkPathsFromText(raw: string | undefined): string[] {
	if (!raw || typeof raw !== "string") return [];
	const re = /\[\[([^\]]+)]]/g;
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(raw)) !== null) {
		out.push(m[1].split("|")[0].trim());
	}
	return out;
}

export function resolveWikiPath(app: App, linktext: string, source: TFile): string | null {
	const dest = app.metadataCache.getFirstLinkpathDest(linktext, source.path);
	return dest?.path ?? null;
}

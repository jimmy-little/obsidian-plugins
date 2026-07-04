import type {App} from "obsidian";
import {TFile} from "obsidian";
import {displayNameForPerson, readPersonFrontmatter} from "./personModel";
import {resolveWikiPath, wikiLinkPathsFromText} from "./orgLinks";

export type OrgChartRow = {
	path: string;
	displayName: string;
	depth: number;
	isAnchor: boolean;
};

function firstOrgUpPath(app: App, file: TFile): string | null {
	const fm = readPersonFrontmatter(app.metadataCache.getFileCache(file));
	const raw = fm.org_up;
	if (!raw?.trim()) return null;
	const links = wikiLinkPathsFromText(raw);
	if (links.length === 0) return null;
	return resolveWikiPath(app, links[0]!, file);
}

function displayNameForPath(app: App, path: string, fallback: string): string {
	const f = app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile)) return fallback;
	const fm = readPersonFrontmatter(app.metadataCache.getFileCache(f));
	return displayNameForPerson(fm, f.basename);
}

/** Walk `org_up` from anchor to root (no cycles). Returns top → … → immediate manager. */
function collectManagersAbove(app: App, anchorFile: TFile): string[] {
	const chain: string[] = [];
	let cur: string | null = anchorFile.path;
	const seen = new Set<string>([anchorFile.path]);
	while (cur) {
		const f = app.vault.getAbstractFileByPath(cur);
		if (!(f instanceof TFile)) break;
		const mgr = firstOrgUpPath(app, f);
		if (!mgr || seen.has(mgr)) break;
		seen.add(mgr);
		chain.unshift(mgr);
		cur = mgr;
	}
	return chain;
}

function collectOrgDownSubtree(
	app: App,
	rootPath: string,
	depth: number,
	out: OrgChartRow[],
	globalSeen: Set<string>,
): void {
	const f = app.vault.getAbstractFileByPath(rootPath);
	if (!(f instanceof TFile)) return;
	const fm = readPersonFrontmatter(app.metadataCache.getFileCache(f));
	const downRaw = fm.org_down;
	let downList: string[] = [];
	if (typeof downRaw === "string") downList = wikiLinkPathsFromText(downRaw);
	else if (Array.isArray(downRaw))
		for (const x of downRaw) downList.push(...wikiLinkPathsFromText(String(x)));

	for (const lt of downList) {
		const p = resolveWikiPath(app, lt, f);
		if (!p || globalSeen.has(p)) continue;
		globalSeen.add(p);
		out.push({
			path: p,
			displayName: displayNameForPath(app, p, lt),
			depth,
			isAnchor: false,
		});
		collectOrgDownSubtree(app, p, depth + 1, out, globalSeen);
	}
}

/**
 * Flat list: managers (shallow → deep), anchor, then DFS direct/indirect reports with increasing depth.
 */
export function buildOrgChartRows(app: App, anchorFile: TFile): OrgChartRow[] {
	const anchorPath = anchorFile.path;
	const up = collectManagersAbove(app, anchorFile);
	const rows: OrgChartRow[] = [];

	let depth = 0;
	for (const p of up) {
		rows.push({
			path: p,
			displayName: displayNameForPath(app, p, p),
			depth,
			isAnchor: false,
		});
		depth++;
	}

	const anchorFm = readPersonFrontmatter(app.metadataCache.getFileCache(anchorFile));
	rows.push({
		path: anchorPath,
		displayName: displayNameForPerson(anchorFm, anchorFile.basename),
		depth,
		isAnchor: true,
	});

	const seen = new Set<string>([...up, anchorPath]);
	collectOrgDownSubtree(app, anchorPath, depth + 1, rows, seen);
	return rows;
}

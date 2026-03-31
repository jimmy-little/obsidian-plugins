import {TFile, type App} from "obsidian";
import {parseWikiLink} from "./wikilinks";

function destForRawLink(app: App, raw: unknown, sourcePath: string): TFile | null {
	if (raw == null) return null;
	if (typeof raw === "string") {
		const pl = parseWikiLink(raw);
		if (!pl) return null;
		return app.metadataCache.getFirstLinkpathDest(pl, sourcePath);
	}
	if (Array.isArray(raw)) {
		for (const item of raw) {
			const d = destForRawLink(app, item, sourcePath);
			if (d) return d;
		}
	}
	return null;
}

/** Resolve project TFile from task frontmatter. Handles project (single) and projects (TaskNotes array). */
export function resolveProjectFileFromFm(
	app: App,
	fm: Record<string, unknown> | undefined,
	sourcePath: string,
	linkField: string,
): TFile | null {
	if (!fm) return null;
	const dest = destForRawLink(app, fm[linkField], sourcePath);
	if (dest) return dest;
	if (linkField !== "projects") return destForRawLink(app, fm["projects"], sourcePath);
	return null;
}

/** Whether this file's `project` (or configured) field resolves to the project file. */
export function fileLinksToProject(
	app: App,
	file: TFile,
	projectPath: string,
	linkField: string,
): boolean {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	if (!fm) return false;
	const raw = fm[linkField];
	const dest = destForRawLink(app, raw, file.path);
	return dest?.path === projectPath;
}

/** First wikilink in `line` that resolves to a file whose path is in `projectPaths`. */
export function firstLinkedProjectFileInLine(
	app: App,
	line: string,
	sourcePath: string,
	projectPaths: Set<string>,
): TFile | null {
	const re = /\[\[([^\]]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		const inner = m[1];
		if (!inner) continue;
		const pathPart = inner.split("#")[0] ?? inner;
		const display = pathPart.split("|")[0]?.trim();
		if (!display) continue;
		const dest = app.metadataCache.getFirstLinkpathDest(display, sourcePath);
		if (dest instanceof TFile && projectPaths.has(dest.path)) return dest;
	}
	return null;
}

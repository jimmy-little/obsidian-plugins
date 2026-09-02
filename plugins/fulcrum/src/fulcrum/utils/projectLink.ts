import {TFile, type App} from "obsidian";
import type {IndexedProject} from "../types";
import {parseWikiLink} from "./wikilinks";

/** Inline task project marker: `+[[Project name]]` (distinct from page wikilinks). */
export const INLINE_PROJECT_LINK_RE = /\+\[\[([^\]]+)\]\]/gu;

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

function displayFromWikiInner(inner: string): string {
	const pathPart = inner.split("#")[0] ?? inner;
	return pathPart.split("|")[0]?.trim() ?? "";
}

function normalizeProjectKey(value: string): string {
	return value.trim().toLowerCase();
}

/** Display target from `+[[note|alias]]` / `+[[note#heading]]`. */
export function displayFromPlusProjectLinkInner(inner: string): string {
	return displayFromWikiInner(inner);
}

/** Format an inline task project link token. */
export function formatInlineProjectLink(projectBasename: string): string {
	const safe = projectBasename.replace(/\]\]/g, "");
	return `+[[${safe}]]`;
}

/** Remove `+[[project]]` tokens from checkbox body text. */
export function stripInlineProjectLinks(text: string): string {
	return text.replace(INLINE_PROJECT_LINK_RE, " ").replace(/\s+/g, " ").trim();
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

function resolveProjectDest(
	app: App,
	display: string,
	sourcePath: string,
	projectPaths: Set<string>,
): TFile | null {
	if (!display) return null;
	const dest = app.metadataCache.getFirstLinkpathDest(display, sourcePath);
	if (dest instanceof TFile && projectPaths.has(dest.path)) return dest;
	return null;
}

/**
 * Resolve an indexed Fulcrum project from link display text.
 * Matches indexed project name/basename first, then Obsidian link resolution.
 */
export function resolveIndexedProjectByDisplay(
	app: App,
	display: string,
	sourcePath: string,
	indexedProjects: IndexedProject[],
	projectPaths: Set<string>,
): TFile | null {
	const key = normalizeProjectKey(displayFromPlusProjectLinkInner(display) || display);
	if (!key) return null;

	for (const project of indexedProjects) {
		if (normalizeProjectKey(project.name) === key) return project.file;
		const basename = project.file.basename.replace(/\.md$/i, "");
		if (normalizeProjectKey(basename) === key) return project.file;
		const linktext = app.metadataCache.fileToLinktext(project.file, sourcePath, false);
		if (linktext && normalizeProjectKey(linktext) === key) return project.file;
	}

	const dest = app.metadataCache.getFirstLinkpathDest(display, sourcePath);
	if (!(dest instanceof TFile)) return null;

	const direct = indexedProjects.find((p) => p.file.path === dest.path);
	if (direct) return direct.file;

	for (const project of indexedProjects) {
		const folder = project.file.parent?.path;
		if (folder && dest.path.startsWith(`${folder}/`)) return project.file;
	}

	if (projectPaths.has(dest.path)) return dest;
	return null;
}

/** First `+[[project]]` in `line` that resolves to an indexed project. */
export function firstPlusLinkedProjectFileInLine(
	app: App,
	line: string,
	sourcePath: string,
	projectPaths: Set<string>,
	indexedProjects: IndexedProject[] = [],
): TFile | null {
	const re = /\+\[\[([^\]]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		const inner = m[1];
		if (!inner) continue;
		const display = displayFromPlusProjectLinkInner(inner);
		const dest =
			indexedProjects.length > 0
				? resolveIndexedProjectByDisplay(
						app,
						display,
						sourcePath,
						indexedProjects,
						projectPaths,
					)
				: resolveProjectDest(app, display, sourcePath, projectPaths);
		if (dest) return dest;
	}
	return null;
}

/** First wikilink in `line` that resolves to a file whose path is in `projectPaths`. */
export function firstLegacyLinkedProjectFileInLine(
	app: App,
	line: string,
	sourcePath: string,
	projectPaths: Set<string>,
	indexedProjects: IndexedProject[] = [],
): TFile | null {
	const re = /\[\[([^\]]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		const matchIndex = m.index ?? 0;
		if (matchIndex > 0 && line[matchIndex - 1] === "+") continue;
		const inner = m[1];
		if (!inner) continue;
		const display = displayFromWikiInner(inner);
		const dest =
			indexedProjects.length > 0
				? resolveIndexedProjectByDisplay(
						app,
						display,
						sourcePath,
						indexedProjects,
						projectPaths,
					)
				: resolveProjectDest(app, display, sourcePath, projectPaths);
		if (dest) return dest;
	}
	return null;
}

/**
 * Resolve the project for an inline task line.
 * Prefers `+[[project]]`; falls back to a legacy bare `[[project]]` when no plus link exists.
 */
export function firstLinkedProjectFileInLine(
	app: App,
	line: string,
	sourcePath: string,
	projectPaths: Set<string>,
	indexedProjects: IndexedProject[] = [],
): TFile | null {
	return (
		firstPlusLinkedProjectFileInLine(
			app,
			line,
			sourcePath,
			projectPaths,
			indexedProjects,
		) ??
		firstLegacyLinkedProjectFileInLine(
			app,
			line,
			sourcePath,
			projectPaths,
			indexedProjects,
		)
	);
}

/** Host-note `project:` (single wikilink) when it resolves to an indexed project. */
export function inheritProjectFromNoteFrontmatter(
	app: App,
	sourceFile: TFile,
	fm: Record<string, unknown> | undefined,
	projectPaths: Set<string>,
	indexedProjects: IndexedProject[],
	projectLinkField: string,
): TFile | null {
	const dest = resolveProjectFileFromFm(app, fm, sourceFile.path, projectLinkField);
	if (!dest) return null;
	if (projectPaths.has(dest.path)) return dest;
	return resolveIndexedProjectByDisplay(
		app,
		dest.basename.replace(/\.md$/i, ""),
		sourceFile.path,
		indexedProjects,
		projectPaths,
	);
}

/**
 * Project for an inline checkbox: line marker, else the file if it is a project note,
 * else the host note's `project:` frontmatter.
 */
export function resolveInlineTaskProjectFile(
	app: App,
	line: string,
	sourceFile: TFile,
	fm: Record<string, unknown> | undefined,
	projectPaths: Set<string>,
	indexedProjects: IndexedProject[],
	projectLinkField: string,
): TFile | null {
	const fromLine = firstLinkedProjectFileInLine(
		app,
		line,
		sourceFile.path,
		projectPaths,
		indexedProjects,
	);
	if (fromLine) return fromLine;
	if (projectPaths.has(sourceFile.path)) return sourceFile;
	return inheritProjectFromNoteFrontmatter(
		app,
		sourceFile,
		fm,
		projectPaths,
		indexedProjects,
		projectLinkField,
	);
}

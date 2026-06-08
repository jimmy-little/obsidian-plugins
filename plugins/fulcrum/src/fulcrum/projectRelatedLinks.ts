import {TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {IndexedProject, IndexedRelatedNote} from "./types";
import {parseAreaLinkPaths} from "./utils/wikilinks";

function parseFrontmatterLinkFiles(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown> | undefined,
	field: string,
): TFile[] {
	if (!fm || !field.trim()) return [];
	const paths = parseAreaLinkPaths(fm[field.trim()]);
	const files: TFile[] = [];
	const seen = new Set<string>();
	for (const link of paths) {
		const dest = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
		if (!(dest instanceof TFile) || seen.has(dest.path)) continue;
		seen.add(dest.path);
		files.push(dest);
	}
	return files;
}

function noteDisplayName(app: App, file: TFile): string {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	if (typeof fm?.name === "string" && fm.name.trim()) return fm.name.trim();
	return file.basename.replace(/\.md$/i, "");
}

/** Related projects from project frontmatter wikilinks (indexed projects only). */
export function collectRelatedProjectsFromFrontmatter(
	app: App,
	projectPath: string,
	projectFile: TFile,
	resolveProject: (path: string) => IndexedProject | undefined,
	s: FulcrumSettings,
): IndexedProject[] {
	const field = s.projectRelatedProjectsField.trim() || "relatedProjects";
	const projectCache = app.metadataCache.getFileCache(projectFile);
	const fm = projectCache?.frontmatter as Record<string, unknown> | undefined;
	const files = parseFrontmatterLinkFiles(app, projectPath, fm, field);
	const projects: IndexedProject[] = [];
	const seen = new Set<string>();
	for (const f of files) {
		if (f.path === projectPath) continue;
		const p = resolveProject(f.path);
		if (!p || seen.has(p.file.path)) continue;
		seen.add(p.file.path);
		projects.push(p);
	}
	projects.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));
	return projects;
}

/** Related products (or any linked notes) from project frontmatter wikilinks. */
export function collectRelatedProductsFromFrontmatter(
	app: App,
	projectPath: string,
	projectFile: TFile,
	s: FulcrumSettings,
): IndexedRelatedNote[] {
	const field = s.projectRelatedProductsField.trim() || "relatedProducts";
	const projectCache = app.metadataCache.getFileCache(projectFile);
	const fm = projectCache?.frontmatter as Record<string, unknown> | undefined;
	const files = parseFrontmatterLinkFiles(app, projectPath, fm, field);
	const notes: IndexedRelatedNote[] = [];
	const seen = new Set<string>();
	for (const f of files) {
		if (seen.has(f.path)) continue;
		seen.add(f.path);
		notes.push({file: f, name: noteDisplayName(app, f)});
	}
	notes.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));
	return notes;
}

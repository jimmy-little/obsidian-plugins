import {
	normalizePath,
	Notice,
	TFile,
	TFolder,
	type App,
	type WorkspaceLeaf,
} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import {openMarkdownBesideFulcrum, type FulcrumCompanionLeaf} from "./openBesideFulcrum";

const MONTHS_LONG = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;
const MONTHS_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** Moment-style tokens inside `{{date:…}}` (subset). */
export function formatMomentLikeDate(format: string, d: Date): string {
	const mi = d.getMonth();
	const longM = MONTHS_LONG[mi] ?? "";
	const shortM = MONTHS_SHORT[mi] ?? "";
	let r = format;
	r = r.replace(/YYYY/g, String(d.getFullYear()));
	r = r.replace(/MMMM/g, longM);
	r = r.replace(/MMM/g, shortM);
	const M = d.getMonth() + 1;
	const D = d.getDate();
	const h = d.getHours();
	const m = d.getMinutes();
	const s = d.getSeconds();
	r = r.replace(/MM/g, pad2(M));
	r = r.replace(/DD/g, pad2(D));
	r = r.replace(/dd/g, pad2(D));
	r = r.replace(/HH/g, pad2(h));
	r = r.replace(/mm/g, pad2(m));
	r = r.replace(/ss/g, pad2(s));
	r = r.replace(/YY/g, String(d.getFullYear()).slice(-2));
	return r;
}

export function expandDateTokensInString(input: string, now: Date = new Date()): string {
	return input.replace(/\{\{date:([^}]+)\}\}/g, (_, fmt: string) => formatMomentLikeDate(fmt, now));
}

export interface FulcrumNewNoteTokenContext {
	fulcrum_project: string;
	fulcrum_project_link: string;
	fulcrum_project_path: string;
	fulcrum_project_slug: string;
}

export function slugifyForFilename(name: string): string {
	const s = name
		.trim()
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return s.slice(0, 120) || "project";
}

function expandFulcrumTokens(input: string, ctx: FulcrumNewNoteTokenContext): string {
	return input
		.replace(/\{\{fulcrum_project\}\}/g, ctx.fulcrum_project)
		.replace(/\{\{fulcrum_project_link\}\}/g, ctx.fulcrum_project_link)
		.replace(/\{\{fulcrum_project_path\}\}/g, ctx.fulcrum_project_path)
		.replace(/\{\{fulcrum_project_slug\}\}/g, ctx.fulcrum_project_slug);
}

export function expandProjectNewNotePlaceholders(
	input: string,
	ctx: FulcrumNewNoteTokenContext,
	now: Date = new Date(),
): string {
	return expandFulcrumTokens(expandDateTokensInString(input, now), ctx);
}

function parentVaultDir(filePath: string): string {
	const n = filePath.replace(/\\/g, "/");
	const i = n.lastIndexOf("/");
	return i < 0 ? "" : normalizePath(n.slice(0, i));
}

async function ensureFolderRecursive(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath.trim());
	if (!normalized) return;
	const existing = app.vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFolder) return;
	if (existing instanceof TFile) {
		throw new Error(`Path "${normalized}" is a file, not a folder.`);
	}
	const parent = parentVaultDir(normalized);
	if (parent) await ensureFolderRecursive(app, parent);
	await app.vault.createFolder(normalized);
}

function sanitizeFileNameSegment(name: string): string {
	const t = name.replace(/[/\\]/g, "-").replace(/^\.+/, "").trim();
	return t || "note.md";
}

function uniqueMarkdownPath(app: App, folder: string, fileName: string): string {
	const normFolder = normalizePath(folder);
	let name = sanitizeFileNameSegment(fileName);
	if (!name.toLowerCase().endsWith(".md")) name = `${name}.md`;
	let full = normalizePath(`${normFolder}/${name}`);
	if (!app.vault.getAbstractFileByPath(full)) return full;
	const base = name.endsWith(".md") ? name.slice(0, -3) : name;
	let i = 2;
	for (;;) {
		const candidate = normalizePath(`${normFolder}/${base}-${i}.md`);
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
		i++;
	}
}

/**
 * Reads the configured template, expands Fulcrum/date placeholders in body and paths,
 * creates the note, opens it beside the Fulcrum leaf when possible.
 */
export async function createNewNoteFromTemplateForProject(
	app: App,
	settings: FulcrumSettings,
	vaultIndex: VaultIndex,
	projectPath: string,
	companion: FulcrumCompanionLeaf,
	anchorLeaf: WorkspaceLeaf | undefined,
): Promise<void> {
	const templatePath = settings.projectNewNoteTemplatePath.trim();
	if (!templatePath) {
		new Notice("Set a template note path in Fulcrum settings (Project page → New note from template).");
		return;
	}

	const normalizedTemplate = normalizePath(templatePath);
	const templateFile = app.vault.getAbstractFileByPath(normalizedTemplate);
	if (!(templateFile instanceof TFile) || templateFile.extension !== "md") {
		new Notice(`Template not found or not markdown: ${normalizedTemplate}`);
		return;
	}

	const project = vaultIndex.resolveProjectByPath(projectPath);
	if (!project) {
		new Notice("Project not found in index.");
		return;
	}

	const linktext =
		app.metadataCache.fileToLinktext(project.file, project.file.path, false) ??
		project.file.basename.replace(/\.md$/i, "");

	const now = new Date();
	const ctx: FulcrumNewNoteTokenContext = {
		fulcrum_project: project.name,
		fulcrum_project_link: `[[${linktext}]]`,
		fulcrum_project_path: project.file.path,
		fulcrum_project_slug: slugifyForFilename(project.name),
	};

	let destFolder: string;
	if (settings.projectNewNoteDestinationMode === "customPath") {
		const raw = settings.projectNewNoteDestinationCustomPath.trim();
		if (!raw) {
			new Notice("Set a custom destination folder, or choose “Project note folder”.");
			return;
		}
		destFolder = normalizePath(expandProjectNewNotePlaceholders(raw, ctx, now));
	} else {
		destFolder = parentVaultDir(project.file.path);
	}

	try {
		await ensureFolderRecursive(app, destFolder);
	} catch (e) {
		console.error(e);
		new Notice(`Could not create folder: ${destFolder}`);
		return;
	}

	const pattern =
		settings.projectNewNoteFileNamePattern.trim() ||
		"{{date:YYYY-MM-DD}}-{{fulcrum_project_slug}}.md";
	const expandedName = expandProjectNewNotePlaceholders(pattern, ctx, now);
	const newPath = uniqueMarkdownPath(app, destFolder, expandedName);

	let body: string;
	try {
		body = await app.vault.read(templateFile);
	} catch (e) {
		console.error(e);
		new Notice("Could not read the template file.");
		return;
	}

	body = expandProjectNewNotePlaceholders(body, ctx, now);

	let created: TFile;
	try {
		created = await app.vault.create(newPath, body);
	} catch (e) {
		console.error(e);
		new Notice(`Could not create note: ${newPath}`);
		return;
	}

	await openMarkdownBesideFulcrum(app, anchorLeaf, created, companion);
}

import { Notice, normalizePath, type App } from "obsidian";
import type { MediaKind } from "./media";
import { normalizeVaultPath, parseFrontmatterKeyValue } from "./match";
import type { ReposeSettings, TypeMatchRule } from "./settings";
import {
	buildMediaFolderPath,
	buildMediaNotePath,
	slugMediaFolderName,
} from "./reposeLayout";
import { downloadTmdbImagesForEntry } from "./downloadReposeImages";

function yamlEscape(s: string): string {
	if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
	return JSON.stringify(s);
}

function buildFrontmatterLines(
	rule: TypeMatchRule,
	title: string,
	opts: { tmdbId?: number; kind: MediaKind },
): string[] {
	const lines: string[] = [`title: ${yamlEscape(title)}`];
	const needle = rule.text.trim();

	if (rule.mode === "tag" && needle) {
		lines.push(`tags:`);
		lines.push(`  - ${yamlEscape(needle)}`);
	} else if (rule.mode === "frontmatter") {
		const p = parseFrontmatterKeyValue(needle);
		if (p) {
			lines.push(`${p.key}: ${yamlEscape(p.value)}`);
		}
	}

	if (
		(opts.kind === "show" || opts.kind === "movie") &&
		opts.tmdbId != null &&
		Number.isFinite(opts.tmdbId)
	) {
		lines.push(`tmdb: ${Math.trunc(opts.tmdbId)}`);
	}

	return lines;
}

function parentFolderForNewNote(settings: ReposeSettings, rule: TypeMatchRule): string {
	if (rule.mode === "folder") {
		const f = normalizeVaultPath(rule.text);
		return f;
	}
	return normalizeVaultPath(settings.defaultNewNoteFolder);
}

export interface CreateMediaNoteOptions {
	tmdbId?: number;
}

export async function createMediaNote(
	app: App,
	settings: ReposeSettings,
	kind: MediaKind,
	title: string,
	options?: CreateMediaNoteOptions,
): Promise<void> {
	const rule = settings.typeRules[kind];
	const parent = parentFolderForNewNote(settings, rule);
	const slug = slugMediaFolderName(title);
	const path = buildMediaNotePath(parent, slug);

	if (app.vault.getAbstractFileByPath(path)) {
		new Notice("A note with that path already exists.");
		return;
	}

	if (parent && !app.vault.getAbstractFileByPath(parent)) {
		await app.vault.createFolder(parent);
	}

	const mediaFolder = buildMediaFolderPath(parent, slug);
	if (!app.vault.getAbstractFileByPath(mediaFolder)) {
		await app.vault.createFolder(mediaFolder);
	}

	const imagesPath = normalizePath(`${mediaFolder}/images`);
	if (!app.vault.getAbstractFileByPath(imagesPath)) {
		await app.vault.createFolder(imagesPath);
	}

	const fm = buildFrontmatterLines(rule, title.trim() || "Untitled", {
		tmdbId: options?.tmdbId,
		kind,
	});
	const body = `# ${title.trim() || "Untitled"}\n\n`;
	const content = `---\n${fm.join("\n")}\n---\n\n${body}`;

	await app.vault.create(path, content);
	new Notice(`Created ${path}`);

	const tmdbId = options?.tmdbId;
	if (
		(kind === "show" || kind === "movie") &&
		tmdbId != null &&
		Number.isFinite(tmdbId) &&
		settings.tmdbApiKey.trim()
	) {
		try {
			await downloadTmdbImagesForEntry(
				app,
				settings,
				mediaFolder,
				kind === "movie" ? "movie" : "show",
				Math.trunc(tmdbId),
			);
		} catch (e) {
			console.error("Repose: image download failed", e);
			new Notice("Repose: note created, but image download failed. Use the command to retry.");
		}
	}

	await app.workspace.openLinkText(path, "", false);
}

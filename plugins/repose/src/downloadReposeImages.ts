import { Notice, normalizePath, requestUrl, type App, type TFile } from "obsidian";
import type { ImageSlot } from "./reposeLayout";
import { IMAGE_SLOTS, getImagesDirForEntry } from "./reposeLayout";
import { fetchTmdbImageDownloadUrls } from "./tmdbImageUrls";
import type { MediaKind } from "./media";
import type { ReposeSettings } from "./settings";

function extFromUrlOrType(url: string, contentType: string | null): string {
	const lower = url.split("?")[0]?.toLowerCase() ?? "";
	if (lower.endsWith(".png")) return "png";
	if (lower.endsWith(".webp")) return "webp";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
	if (contentType?.includes("png")) return "png";
	if (contentType?.includes("webp")) return "webp";
	return "jpg";
}

export async function downloadUrlToVaultPath(
	app: App,
	sourceUrl: string,
	vaultRelativePath: string,
): Promise<void> {
	const res = await requestUrl({ url: sourceUrl, method: "GET" });
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`HTTP ${res.status}`);
	}
	const rawCt = res.headers["content-type"] ?? res.headers["Content-Type"];
	const ct = Array.isArray(rawCt) ? rawCt[0] : rawCt;
	const ext = extFromUrlOrType(sourceUrl, typeof ct === "string" ? ct : null);
	const pathWithExt = vaultRelativePath.includes(".")
		? vaultRelativePath
		: `${vaultRelativePath}.${ext}`;
	const buf = res.arrayBuffer;
	const norm = normalizePath(pathWithExt);
	await app.vault.adapter.writeBinary(norm, buf);
}

export async function downloadTmdbImagesForEntry(
	app: App,
	settings: ReposeSettings,
	entryFolderPath: string,
	kind: "show" | "movie",
	tmdbId: number,
): Promise<void> {
	const key = settings.tmdbApiKey.trim();
	if (!key) {
		new Notice("Repose: add a TMDB API key in settings to download images.");
		return;
	}

	const urls = await fetchTmdbImageDownloadUrls(kind === "movie" ? "movie" : "tv", tmdbId, key);
	const imagesDir = getImagesDirForEntry(entryFolderPath);
	if (!app.vault.getAbstractFileByPath(imagesDir)) {
		await app.vault.createFolder(imagesDir);
	}

	const missing: ImageSlot[] = [];
	for (const slot of IMAGE_SLOTS) {
		const u = urls[slot];
		if (!u) {
			missing.push(slot);
			continue;
		}
		const basePath = normalizePath(`${imagesDir}/${slot}`);
		try {
			await downloadUrlToVaultPath(app, u, basePath);
		} catch (e) {
			console.error(`Repose: failed to download ${slot}`, e);
			missing.push(slot);
		}
	}

	if (missing.length === IMAGE_SLOTS.length) {
		new Notice("Repose: no TMDB images were saved. Check TMDB ID and API key.");
	} else if (missing.length) {
		new Notice(`Repose: saved images; missing: ${missing.join(", ")}.`);
	} else {
		new Notice("Repose: poster, banner, logo, and thumb saved.");
	}
}

export function readTmdbIdFromFrontmatter(fm: Record<string, unknown> | undefined): number | null {
	if (!fm) return null;
	const raw = fm.tmdb ?? fm.tmdb_id;
	if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
	if (typeof raw === "string" && raw.trim()) {
		const n = Number.parseInt(raw.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return null;
}

export function isShowOrMovie(kinds: MediaKind[]): "show" | "movie" | null {
	if (kinds.includes("movie")) return "movie";
	if (kinds.includes("show")) return "show";
	return null;
}

export async function syncImagesForNoteFile(
	app: App,
	settings: ReposeSettings,
	file: TFile,
	kinds: MediaKind[],
): Promise<void> {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	const tmdb = readTmdbIdFromFrontmatter(fm);
	if (tmdb == null) {
		new Notice("Repose: add a numeric `tmdb` (or `tmdb_id`) field to the note frontmatter.");
		return;
	}
	const kind = isShowOrMovie(kinds);
	if (!kind) {
		new Notice("Repose: TMDB sync applies to show and movie notes only.");
		return;
	}
	const entry = file.parent?.path;
	if (!entry) {
		new Notice("Repose: note has no parent folder.");
		return;
	}
	await downloadTmdbImagesForEntry(app, settings, entry, kind, tmdb);
}

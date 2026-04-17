import { Notice, Plugin, TFile, type ObsidianProtocolData } from "obsidian";
import { resolveMediaTypeForFile } from "./media/mediaDetect";
import {
	ensureTraktAccessToken,
	pushEpisodeWatchedToTrakt,
	pushMovieWatchedToTrakt,
	readTraktIdFromFrontmatter,
	removeEpisodeWatchedFromTrakt,
	removeMovieWatchedFromTrakt,
} from "./trakt/watchedSync";
import { refreshMediaNote as runRefreshMediaNote } from "./vault/refreshMedia";
import { refreshShowFromTrakt as runRefreshShowFromTrakt } from "./vault/showRefresh";
import { ReposeSettingTab } from "./ReposeSettingTab";
import { ReposeShellView, VIEW_TYPE_REPOSE } from "./ReposeShellView";
import { DEFAULT_SETTINGS, normalizeSettings, type ReposeSettings } from "./settings";

export default class ReposePlugin extends Plugin {
	settings!: ReposeSettings;
	/** Device OAuth poll interval when connecting Trakt from settings */
	traktDevicePollTimer: number | undefined;

	clearTraktDevicePoll(): void {
		if (this.traktDevicePollTimer) {
			window.clearInterval(this.traktDevicePollTimer);
			this.traktDevicePollTimer = undefined;
		}
	}

	async refreshShowFromTrakt(file: TFile): Promise<{ ok: boolean; error?: string }> {
		return runRefreshShowFromTrakt(this.app, this.settings, file, this);
	}

	/**
	 * Refresh metadata/images from Trakt/TMDB/IGDB when ids exist; otherwise search by title and open a match picker.
	 */
	async refreshMediaNote(
		file: TFile,
		callbacks?: { onComplete?: () => void },
	): Promise<{ ok: boolean; error?: string; deferred?: boolean }> {
		return runRefreshMediaNote(this.app, this.settings, this, file, callbacks);
	}

	async toggleWatchedFrontmatter(filePath: string): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(filePath);
		if (!(f instanceof TFile)) return;

		const cacheBefore = this.app.metadataCache.getFileCache(f);
		const fmBefore = (cacheBefore?.frontmatter ?? {}) as Record<string, unknown>;
		const wasWatched = typeof fmBefore.watchedDate === "string" && fmBefore.watchedDate.trim().length > 0;
		const mediaType = resolveMediaTypeForFile(this.app, f, this.settings);
		const traktId = readTraktIdFromFrontmatter(fmBefore);

		await this.app.fileManager.processFrontMatter(f, (fm) => {
			const now = new Date();
			const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
				now.getDate(),
			).padStart(2, "0")}`;
			const watched = typeof fm.watchedDate === "string" && fm.watchedDate.trim().length > 0;
			if (watched) {
				delete fm.watchedDate;
				if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
			} else {
				fm.watchedDate = today;
				fm.reposeStatus = "watched";
			}
		});

		if (mediaType !== "movie" && mediaType !== "episode") return;
		if (traktId == null) return;
		const token = await ensureTraktAccessToken(this);
		if (!token) return;

		const cacheAfter = this.app.metadataCache.getFileCache(f);
		const fmAfter = (cacheAfter?.frontmatter ?? {}) as Record<string, unknown>;
		const nowWatched = typeof fmAfter.watchedDate === "string" && fmAfter.watchedDate.trim().length > 0;
		const dateStr =
			typeof fmAfter.watchedDate === "string" ? fmAfter.watchedDate.trim().split("T")[0] : "";

		try {
			if (!wasWatched && nowWatched && dateStr) {
				if (mediaType === "movie") await pushMovieWatchedToTrakt(this, traktId, dateStr);
				else await pushEpisodeWatchedToTrakt(this, traktId, dateStr);
			} else if (wasWatched && !nowWatched) {
				if (mediaType === "movie") await removeMovieWatchedFromTrakt(this, traktId);
				else await removeEpisodeWatchedFromTrakt(this, traktId);
			}
		} catch (e) {
			new Notice(e instanceof Error ? e.message : "Could not update Trakt watch state.");
		}
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_REPOSE, (leaf) => new ReposeShellView(leaf, this));

		this.addRibbonIcon("clapperboard", "Repose", () => {
			void this.openRepose();
		});

		this.addCommand({
			id: "open-repose",
			name: "Open Repose",
			callback: () => void this.openRepose(),
		});

		this.addSettingTab(new ReposeSettingTab(this.app, this));

		this.registerObsidianProtocolHandler("repose", (data) => {
			void this.handleProtocol(data);
		});
	}

	private async handleProtocol(data: ObsidianProtocolData): Promise<void> {
		if (data.action === "open" || data.screen === "main" || !data.action) {
			await this.openRepose();
			return;
		}
		new Notice(`Unknown Repose URI: ${data.action ?? ""}`);
	}

	/** Avoid duplicate Repose leaves from repeated opens / workspace glitches. */
	private dedupeReposeLeaves(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPOSE);
		for (let i = 1; i < leaves.length; i++) {
			leaves[i].detach();
		}
	}

	private async openRepose(state?: Record<string, unknown>): Promise<void> {
		this.dedupeReposeLeaves();
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPOSE)[0];
		if (existing) {
			await existing.setViewState({ type: VIEW_TYPE_REPOSE, active: true, state });
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_REPOSE, active: true, state });
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onunload(): void {
		this.clearTraktDevicePoll();
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPOSE);
	}
}

import { Notice, Plugin, TFile, type ObsidianProtocolData, type WorkspaceLeaf } from "obsidian";
import {
	ensureReposeCompanionMarkdownPane,
	openBookCompanionSinglePane,
	registerReposeCompanionMarkdown,
} from "./reposeCompanionMarkdown";
import { resolveMediaTypeForFile } from "./media/mediaDetect";
import { isEffectivelyWatchedFromFrontmatter, watchedDatesIsoFromFrontmatter } from "./media/mediaModel";
import { resolveEpisodeTraktIdForFile } from "./trakt/resolveEpisodeTraktId";
import {
	ensureTraktAccessToken,
	pushEpisodeWatchedToTrakt,
	pushMovieWatchedToTrakt,
	readTraktIdFromFrontmatter,
	removeEpisodeWatchedFromTrakt,
	removeMovieWatchedFromTrakt,
} from "./trakt/watchedSync";
import { refreshMediaNote as runRefreshMediaNote } from "./vault/refreshMedia";
import {
	refreshShowFromTrakt as runRefreshShowFromTrakt,
	refreshTvSeasonFromTrakt as runRefreshTvSeasonFromTrakt,
} from "./vault/showRefresh";
import { ReposeSettingTab } from "./ReposeSettingTab";
import { ReposeShellView, VIEW_TYPE_REPOSE } from "./ReposeShellView";
import { DEFAULT_SETTINGS, normalizeSettings, type ReposeSettings } from "./settings";

export default class ReposePlugin extends Plugin {
	settings!: ReposeSettings;
	/** Device OAuth poll interval when connecting Trakt from settings */
	traktDevicePollTimer: number | undefined;
	/** Markdown leaf beside Repose for book / episode notes (hero chrome prepended). */
	reposeCompanionMarkdownLeaf: WorkspaceLeaf | null = null;
	reposeCompanionMarkdownPath: string | null = null;
	/** True when {@link reposeCompanionMarkdownLeaf} was created as a split; clear may detach it. */
	reposeCompanionMarkdownOwnedSplit = false;
	/** Chrome prev/next — opens book notes or syncs Repose + episode split. */
	reposeRequestSelectPath: ((path: string) => void) | null = null;

	clearTraktDevicePoll(): void {
		if (this.traktDevicePollTimer) {
			window.clearInterval(this.traktDevicePollTimer);
			this.traktDevicePollTimer = undefined;
		}
	}

	async refreshShowFromTrakt(file: TFile): Promise<{ ok: boolean; error?: string }> {
		return runRefreshShowFromTrakt(this.app, this.settings, file, this);
	}

	/** Trakt/TMDB + watch state for every episode note in a TV season (vault files for that season). */
	async refreshTvSeasonFromTrakt(
		showFile: TFile,
		seasonNumber: number,
	): Promise<{ ok: boolean; error?: string }> {
		return runRefreshTvSeasonFromTrakt(this.app, this.settings, this, showFile, seasonNumber);
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
		const wasWatched = isEffectivelyWatchedFromFrontmatter(fmBefore);
		const mediaType = resolveMediaTypeForFile(this.app, f, this.settings);

		await this.app.fileManager.processFrontMatter(f, (fm) => {
			const now = new Date();
			const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
				now.getDate(),
			).padStart(2, "0")}`;
			const watched = isEffectivelyWatchedFromFrontmatter(fm);
			if (watched) {
				delete fm.watchedDate;
				delete fm.watchedDates;
				if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
			} else {
				const iso = now.toISOString();
				const existing = watchedDatesIsoFromFrontmatter(fm);
				fm.watchedDates = [...existing, iso];
				fm.watchedDate = today;
				fm.reposeStatus = "watched";
			}
		});

		if (mediaType !== "movie" && mediaType !== "episode") return;

		const cacheAfter = this.app.metadataCache.getFileCache(f);
		const fmAfter = (cacheAfter?.frontmatter ?? {}) as Record<string, unknown>;
		const nowWatched = isEffectivelyWatchedFromFrontmatter(fmAfter);
		const dateStr =
			typeof fmAfter.watchedDate === "string" ? fmAfter.watchedDate.trim().split("T")[0] : "";

		let traktIdForPush = readTraktIdFromFrontmatter(fmAfter);
		if (traktIdForPush == null && mediaType === "episode") {
			const resolved = await resolveEpisodeTraktIdForFile(this.app, this.settings, f);
			if (resolved != null) {
				traktIdForPush = resolved;
				await this.app.fileManager.processFrontMatter(f, (fm) => {
					(fm as Record<string, unknown>).traktId = resolved;
				});
			}
		}
		if (traktIdForPush == null) return;

		const token = await ensureTraktAccessToken(this);
		if (!token) return;

		try {
			if (!wasWatched && nowWatched && dateStr) {
				if (mediaType === "movie") await pushMovieWatchedToTrakt(this, traktIdForPush, dateStr);
				else await pushEpisodeWatchedToTrakt(this, traktIdForPush, dateStr);
			} else if (wasWatched && !nowWatched) {
				if (mediaType === "movie") await removeMovieWatchedFromTrakt(this, traktIdForPush);
				else await removeEpisodeWatchedFromTrakt(this, traktIdForPush);
			}
		} catch (e) {
			new Notice(e instanceof Error ? e.message : "Could not update Trakt watch state.");
		}
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_REPOSE, (leaf) => new ReposeShellView(leaf, this));

		registerReposeCompanionMarkdown(this);

		this.reposeRequestSelectPath = (path: string) => {
			void this.navigateCompanionMediaPath(path);
		};

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

	/** Open or focus the Repose media list (ribbon, commands, book hero Home). */
	async openRepose(state?: Record<string, unknown>): Promise<void> {
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

	/** Chapter / episode navigation from markdown hero chrome. */
	async navigateCompanionMediaPath(path: string): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return;
		const mt = resolveMediaTypeForFile(this.app, f, this.settings);
		if (mt !== "book" && mt !== "episode") return;

		const reposeLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPOSE)[0];
		if (reposeLeaf) {
			await reposeLeaf.setViewState({
				type: VIEW_TYPE_REPOSE,
				active: true,
				state: { selectedPath: path },
			});
			await this.app.workspace.revealLeaf(reposeLeaf);
		}
		const anchor = reposeLeaf ?? this.app.workspace.getLeaf("tab");
		if (mt === "book") {
			await openBookCompanionSinglePane(this, anchor, f);
		} else {
			await ensureReposeCompanionMarkdownPane(this, anchor, f);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onunload(): void {
		this.clearTraktDevicePoll();
		this.reposeRequestSelectPath = null;
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPOSE);
	}
}

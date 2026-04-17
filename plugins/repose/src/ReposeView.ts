import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import {
	getEpisodeRowStillThumb,
	getSeasonEpisodes,
	getShowSeasons,
	getThumbnailUrlForSearchHit,
	searchTrakt,
	type TraktSearchHit,
} from "./trakt/client";
import { fetchShowWatchedProgress } from "./trakt/watchedSync";
import type ReposePlugin from "./main";
import {
	addTraktEpisodeToVault,
	addTraktShowOrMovieToVault,
	fetchEpisodeStill,
	fetchImagesForItem,
	lookupShowInVault,
} from "./vault/reposeImport";
import type { TraktEpisode, TraktShowOrMovie } from "./vault/traktNotes";

export const VIEW_TYPE_REPOSE = "repose-main-view";

type SearchRow = TraktSearchHit;

function asShowMovie(data: unknown): TraktShowOrMovie {
	return data && typeof data === "object" ? (data as TraktShowOrMovie) : {};
}

function asEpisode(raw: Record<string, unknown>): TraktEpisode {
	const firstAired =
		(typeof raw.first_aired === "string" && raw.first_aired) ||
		(typeof raw.firstAired === "string" && raw.firstAired) ||
		undefined;
	return {
		title: typeof raw.title === "string" ? raw.title : "",
		season: typeof raw.season === "number" ? raw.season : Number(raw.season),
		number: typeof raw.number === "number" ? raw.number : Number(raw.number),
		overview: raw.overview != null ? String(raw.overview) : undefined,
		firstAired: firstAired,
		first_aired: typeof raw.first_aired === "string" ? raw.first_aired : undefined,
		runtime: raw.runtime != null ? Number(raw.runtime) : undefined,
		rating: raw.rating != null ? Number(raw.rating) : undefined,
		ids: raw.ids && typeof raw.ids === "object" ? (raw.ids as TraktEpisode["ids"]) : {},
	};
}

export class ReposeView extends ItemView {
	private rootEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private typeSelect!: HTMLSelectElement;
	private resultsEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private navBarEl!: HTMLElement;

	/** Season list or episode list from show browse (not search-only). */
	private browseSeasonNumber: number | null = null;

	private searchResults: SearchRow[] = [];
	private selectedImages: {
		poster?: string | null;
		posterLarge?: string | null;
		backdrop?: string | null;
		backdropLarge?: string | null;
	} | null = null;
	private selectedKind: "movie" | "show" | "episode" | null = null;
	private selectedItem: TraktShowOrMovie | TraktEpisode | null = null;
	private selectedShowForEpisode: TraktShowOrMovie | null = null;
	private currentShowTraktId: number | null = null;
	private currentShowTmdbId: number | null = null;
	/** When browsing seasons from a show search, keep the parent show for episode notes. */
	private contextShow: TraktShowOrMovie | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReposePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_REPOSE;
	}

	getDisplayText(): string {
		return "Repose";
	}

	getIcon(): string {
		return "clapperboard";
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass("repose-view-body");
		this.rootEl = this.containerEl.createDiv({ cls: "repose-root" });

		const header = this.rootEl.createEl("header", { cls: "repose-view-header" });
		header.createEl("h1", { text: "Repose", cls: "repose-view-header__title" });
		header.createEl("p", {
			text: "Media notes using Trakt and TVDB APIs",
			cls: "repose-view-header__tagline",
		});

		const searchRow = this.rootEl.createDiv({ cls: "repose-search-row" });
		this.searchInput = searchRow.createEl("input", { type: "text", placeholder: "Search Trakt…" });
		this.typeSelect = searchRow.createEl("select");
		for (const [v, label] of [
			["", "All"],
			["movie", "Movies"],
			["show", "Shows"],
			["episode", "Episodes"],
		] as const) {
			this.typeSelect.createEl("option", { value: v, text: label });
		}
		searchRow.createEl("button", { text: "Search" }).addEventListener("click", () => void this.runSearch());

		this.navBarEl = this.rootEl.createDiv({ cls: "repose-nav-bar repose-nav-bar--hidden" });
		/* Detail card first so show/episode info stays visible above long lists */
		this.detailEl = this.rootEl.createDiv({ cls: "repose-detail-host" });
		this.resultsEl = this.rootEl.createDiv({ cls: "repose-results-host" });
	}

	private async runSearch(): Promise<void> {
		const clientId = this.plugin.settings.traktClientId.trim();
		if (!clientId) {
			new Notice("Set Trakt Client ID in settings.");
			return;
		}
		const q = this.searchInput.value.trim();
		if (!q) {
			new Notice("Enter a search query.");
			return;
		}
		try {
			const type = this.typeSelect.value;
			const raw = await searchTrakt(clientId, q, type);
			const sorted = [...raw].sort((a, b) => (b.score || 0) - (a.score || 0));
			const dedup: SearchRow[] = [];
			const seen = new Set<string>();
			for (const r of sorted) {
				let key = "";
				const mv = r.movie as { ids?: { trakt?: number } } | undefined;
				const sh = r.show as { ids?: { trakt?: number } } | undefined;
				const ep = r.episode as { ids?: { trakt?: number } } | undefined;
				if (mv?.ids?.trakt) key = `movie-${mv.ids.trakt}`;
				else if (sh?.ids?.trakt) key = `show-${sh.ids.trakt}`;
				else if (ep?.ids?.trakt) key = `ep-${ep.ids.trakt}`;
				else key = `x-${dedup.length}`;
				if (seen.has(key)) continue;
				seen.add(key);
				dedup.push(r);
				if (dedup.length >= 20) break;
			}
			this.searchResults = dedup;
			await this.renderResults();
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	private hideBrowseNav(): void {
		this.navBarEl.addClass("repose-nav-bar--hidden");
		this.navBarEl.empty();
	}

	private showBrowseNavForSeasons(showTitle: string): void {
		const id = this.currentShowTraktId;
		if (id == null) return;
		this.navBarEl.removeClass("repose-nav-bar--hidden");
		this.navBarEl.empty();
		const row = this.navBarEl.createDiv({ cls: "repose-nav-row" });
		row.createEl("button", { text: "← Search", cls: "repose-nav-back" }).addEventListener("click", () => {
			this.detailEl.empty();
			void this.renderResults();
			this.hideBrowseNav();
		});
		row.createSpan({ cls: "repose-nav-title", text: `${showTitle} · Seasons` });
	}

	private showBrowseNavForEpisodes(showTitle: string, seasonNumber: number): void {
		const id = this.currentShowTraktId;
		if (id == null) return;
		this.browseSeasonNumber = seasonNumber;
		this.navBarEl.removeClass("repose-nav-bar--hidden");
		this.navBarEl.empty();
		const row = this.navBarEl.createDiv({ cls: "repose-nav-row" });
		row.createEl("button", { text: "← Seasons", cls: "repose-nav-back" }).addEventListener("click", () => {
			this.detailEl.empty();
			void this.loadSeasonsUi(id);
		});
		row.createSpan({
			cls: "repose-nav-title",
			text: `${showTitle} · Season ${seasonNumber}`,
		});
	}

	private async renderResults(): Promise<void> {
		this.hideBrowseNav();
		this.browseSeasonNumber = null;

		this.resultsEl.empty();
		this.resultsEl.createEl("h3", { text: "Results", cls: "repose-muted" });
		const ul = this.resultsEl.createEl("ul", { cls: "repose-results" });
		const tmdbKey = this.plugin.settings.tmdbApiKey.trim();
		const thumbs = tmdbKey
			? await Promise.all(this.searchResults.map((row) => getThumbnailUrlForSearchHit(tmdbKey, row)))
			: this.searchResults.map(() => null as string | null);

		this.searchResults.forEach((row, i) => {
			let title = "";
			if (row.type === "movie" && row.movie) {
				const m = row.movie as { title?: string; year?: number };
				title = `${m.title ?? ""} (${m.year ?? ""})`;
			} else if (row.type === "episode" && row.episode && row.show) {
				const ep = row.episode as { title?: string; season?: number; number?: number };
				const st = row.show as { title?: string } | undefined;
				title = `${st?.title ?? "Show"} — ${ep.title ?? ""} (S${ep.season}E${ep.number})`;
			} else if (row.type === "show" && row.show) {
				const s = row.show as { title?: string; year?: number };
				title = `${s.title ?? ""} (${s.year ?? ""})`;
			} else if (row.movie) {
				const m = row.movie as { title?: string; year?: number };
				title = `${m.title ?? ""} (${m.year ?? ""})`;
			} else if (row.episode && row.show) {
				const ep = row.episode as { title?: string; season?: number; number?: number };
				const st = row.show as { title?: string } | undefined;
				title = `${st?.title ?? "Show"} — ${ep.title ?? ""} (S${ep.season}E${ep.number})`;
			} else if (row.show) {
				const s = row.show as { title?: string; year?: number };
				title = `${s.title ?? ""} (${s.year ?? ""})`;
			}
			const li = ul.createEl("li", { cls: "repose-result-row" });
			const thumbUrl = thumbs[i];
			if (thumbUrl) {
				li.createEl("img", {
					cls: "repose-result-thumb",
					attr: { src: thumbUrl, alt: "", loading: "lazy", decoding: "async" },
				});
			} else {
				li.createDiv({ cls: "repose-result-thumb repose-result-thumb--placeholder" });
			}
			li.createSpan({ cls: "repose-result-label", text: title || "Result" });
			li.addEventListener("click", () => {
				void this.selectResult(row).catch((e) => {
					new Notice(e instanceof Error ? e.message : String(e));
				});
			});
		});
	}

	private renderEpisodeDetailNavigation(card: HTMLElement, fromSeasonBrowse: boolean): void {
		const nav = card.createDiv({ cls: "repose-detail-nav" });
		if (fromSeasonBrowse && this.currentShowTraktId != null && this.browseSeasonNumber != null) {
			nav.createEl("button", { text: "← Episodes" }).addEventListener("click", () => {
				this.detailEl.empty();
				void this.loadEpisodesUi(this.currentShowTraktId!, this.browseSeasonNumber!);
			});
			nav.createEl("button", { text: "← Seasons" }).addEventListener("click", () => {
				this.detailEl.empty();
				void this.loadSeasonsUi(this.currentShowTraktId!);
			});
		} else {
			nav.createEl("button", { text: "← Search results" }).addEventListener("click", () => {
				this.detailEl.empty();
				void this.renderResults();
			});
			if (this.currentShowTraktId != null && this.selectedShowForEpisode) {
				nav.createEl("button", { text: "Browse seasons" }).addEventListener("click", () => {
					this.detailEl.empty();
					this.contextShow = this.selectedShowForEpisode as TraktShowOrMovie;
					void this.loadSeasonsUi(this.currentShowTraktId!);
				});
			}
		}
	}

	private async selectResult(row: SearchRow): Promise<void> {
		this.detailEl.empty();
		this.selectedImages = null;
		this.selectedKind = null;
		this.selectedItem = null;
		this.selectedShowForEpisode = null;
		this.currentShowTraktId = null;
		this.currentShowTmdbId = null;
		this.contextShow = null;
		this.browseSeasonNumber = null;

		const tmdbKey = this.plugin.settings.tmdbApiKey.trim();

		// Prefer Trakt `type` so we don't mis-classify (e.g. empty objects).
		if (row.type === "movie" && row.movie) {
			const movie = row.movie as TraktShowOrMovie & { ids?: { trakt?: number; tmdb?: number } };
			this.selectedKind = "movie";
			this.selectedItem = asShowMovie(movie);
		} else if (row.type === "episode" && row.episode && row.show) {
			const show = row.show as TraktShowOrMovie & { ids?: { tmdb?: number; trakt?: number } };
			this.selectedKind = "episode";
			this.selectedItem = asEpisode(row.episode as Record<string, unknown>);
			this.selectedShowForEpisode = asShowMovie(show);
			this.currentShowTmdbId = show.ids?.tmdb ?? null;
			this.currentShowTraktId = show.ids?.trakt ?? null;
		} else if (row.type === "show" && row.show) {
			const show = row.show as TraktShowOrMovie & { ids?: { trakt?: number; tmdb?: number } };
			this.selectedKind = "show";
			this.selectedItem = asShowMovie(show);
			this.contextShow = asShowMovie(show);
			this.currentShowTraktId = show.ids?.trakt ?? null;
			this.currentShowTmdbId = show.ids?.tmdb ?? null;
		} else if (row.movie) {
			const movie = row.movie as TraktShowOrMovie & { ids?: { trakt?: number; tmdb?: number } };
			this.selectedKind = "movie";
			this.selectedItem = asShowMovie(movie);
		} else if (row.episode && row.show) {
			const show = row.show as TraktShowOrMovie & { ids?: { tmdb?: number; trakt?: number } };
			this.selectedKind = "episode";
			this.selectedItem = asEpisode(row.episode as Record<string, unknown>);
			this.selectedShowForEpisode = asShowMovie(show);
			this.currentShowTmdbId = show.ids?.tmdb ?? null;
			this.currentShowTraktId = show.ids?.trakt ?? null;
		} else if (row.show) {
			const show = row.show as TraktShowOrMovie & { ids?: { trakt?: number; tmdb?: number } };
			this.selectedKind = "show";
			this.selectedItem = asShowMovie(show);
			this.contextShow = asShowMovie(show);
			this.currentShowTraktId = show.ids?.trakt ?? null;
			this.currentShowTmdbId = show.ids?.tmdb ?? null;
		}

		if (!this.selectedKind || !this.selectedItem) {
			new Notice("Could not open this search result.");
			return;
		}

		const card = this.detailEl.createDiv({ cls: "repose-detail" });
		const title =
			this.selectedKind === "episode"
				? `${(this.selectedItem as TraktEpisode).title}`
				: (this.selectedItem as TraktShowOrMovie).title ?? "";
		card.createEl("h3", { text: title });

		if (this.selectedKind === "episode") {
			this.renderEpisodeDetailNavigation(card, false);
		}

		const lookup =
			this.selectedKind === "show" && (this.selectedItem as TraktShowOrMovie).title
				? await lookupShowInVault(
						this.app.vault,
						this.plugin.settings,
						(this.selectedItem as TraktShowOrMovie).title!,
					)
				: { found: false };
		card.createEl("p", {
			text: lookup.found ? `In vault: ${lookup.path}` : "Not in vault yet (for series note path).",
			cls: "repose-muted",
		});

		const actions = card.createDiv({ cls: "repose-actions" });

		if (this.selectedKind === "movie" || this.selectedKind === "show") {
			actions.createEl("button", { text: "Add to vault (movie/show note)" }).addEventListener("click", () =>
				void this.addShowOrMovie(),
			);
		}
		if (this.selectedKind === "show" && this.currentShowTraktId != null) {
			actions.createEl("button", { text: "Load seasons" }).addEventListener("click", () =>
				void this.loadSeasonsUi(this.currentShowTraktId!),
			);
		}
		if (this.selectedKind === "episode" && this.selectedShowForEpisode) {
			actions.createEl("button", { text: "Add episode note" }).addEventListener("click", () =>
				void this.addEpisode(),
			);
		}

		// Load TMDB art after the detail panel is visible so clicks never wait on network.
		if ((this.selectedKind === "movie" || this.selectedKind === "show") && tmdbKey) {
			const item = this.selectedItem as TraktShowOrMovie;
			const tmdb = item.ids?.tmdb;
			if (tmdb != null) {
				try {
					this.selectedImages = await fetchImagesForItem(
						tmdbKey,
						tmdb,
						this.selectedKind === "movie" ? "movie" : "show",
					);
				} catch {
					this.selectedImages = null;
				}
			}
		}
	}

	private async addShowOrMovie(): Promise<void> {
		if (!this.selectedItem || (this.selectedKind !== "movie" && this.selectedKind !== "show")) return;
		try {
			const { path } = await addTraktShowOrMovieToVault(
				this.app.vault,
				this.plugin.settings,
				this.selectedItem as TraktShowOrMovie,
				this.selectedKind,
				this.selectedImages,
				this.plugin,
			);
			new Notice(`Saved: ${path}`);
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	private async addEpisode(): Promise<void> {
		if (!this.selectedItem || this.selectedKind !== "episode" || !this.selectedShowForEpisode) return;
		const ep = this.selectedItem as TraktEpisode;
		const show = this.selectedShowForEpisode;
		let still: string | null = null;
		const tmdb = this.plugin.settings.tmdbApiKey.trim();
		if (tmdb && this.currentShowTmdbId && ep.season != null && ep.number != null) {
			still = await fetchEpisodeStill(tmdb, this.currentShowTmdbId, ep.season, ep.number);
		}
		try {
			const { path } = await addTraktEpisodeToVault(
				this.app.vault,
				this.plugin.settings,
				ep,
				show,
				still,
				this.plugin,
			);
			new Notice(`Saved: ${path}`);
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	private async loadSeasonsUi(showTraktId: number): Promise<void> {
		const clientId = this.plugin.settings.traktClientId.trim();
		if (!clientId) return;
		this.currentShowTraktId = showTraktId;
		const showTitle = this.contextShow?.title ?? "Show";
		try {
			const seasons = await getShowSeasons(clientId, showTraktId);
			this.detailEl.empty();
			this.resultsEl.empty();
			this.showBrowseNavForSeasons(showTitle);
			this.resultsEl.createEl("h3", { text: "Seasons", cls: "repose-muted" });
			const ul = this.resultsEl.createEl("ul", { cls: "repose-results" });
			for (const s of seasons.filter((x) => x.number > 0)) {
				const li = ul.createEl("li", {
					cls: "repose-result-row",
				});
				li.createDiv({ cls: "repose-result-thumb repose-result-thumb--placeholder" });
				li.createSpan({
					cls: "repose-result-label",
					text: `Season ${s.number} (${s.episodeCount} eps)`,
				});
				li.addEventListener("click", () => void this.loadEpisodesUi(showTraktId, s.number));
			}
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	private async loadEpisodesUi(showTraktId: number, seasonNumber: number): Promise<void> {
		const clientId = this.plugin.settings.traktClientId.trim();
		if (!clientId) return;
		this.currentShowTraktId = showTraktId;
		const showTitle = this.contextShow?.title ?? "Show";
		const tmdbKey = this.plugin.settings.tmdbApiKey.trim();
		const showTmdb = this.contextShow
			? ((this.contextShow as { ids?: { tmdb?: number } }).ids?.tmdb ?? null)
			: null;
		try {
			const episodes = await getSeasonEpisodes(clientId, showTraktId, seasonNumber);
			this.detailEl.empty();
			this.resultsEl.empty();
			this.showBrowseNavForEpisodes(showTitle, seasonNumber);

			const header = this.resultsEl.createDiv({ cls: "repose-season-header" });
			header.createEl("h3", {
				text: `${showTitle} · Season ${seasonNumber}`,
				cls: "repose-muted",
			});
			const batchActions = header.createDiv({ cls: "repose-season-actions" });
			batchActions
				.createEl("button", { text: "Add season (all episodes)" })
				.addEventListener("click", () => void this.importSeasonEpisodesBatch(episodes));

			const ul = this.resultsEl.createEl("ul", { cls: "repose-results repose-results--episodes" });
			const thumbs =
				tmdbKey && showTmdb != null
					? await Promise.all(
							episodes.map((ep) =>
								getEpisodeRowStillThumb(tmdbKey, showTmdb, ep.season, ep.number),
							),
						)
					: episodes.map(() => null as string | null);
			for (let i = 0; i < episodes.length; i++) {
				const ep = episodes[i]!;
				const raw = ep as unknown as Record<string, unknown>;
				const li = ul.createEl("li", { cls: "repose-result-row repose-result-row--episode" });
				const tu = thumbs[i];
				const wrap = li.createDiv({ cls: "repose-episode-thumb-wrap" });
				if (tu) {
					wrap.createEl("img", {
						cls: "repose-result-thumb repose-result-thumb--still repose-result-thumb--169",
						attr: { src: tu, alt: "", loading: "lazy", decoding: "async" },
					});
				} else {
					wrap.createDiv({
						cls: "repose-result-thumb repose-result-thumb--placeholder repose-result-thumb--169",
					});
				}
				li.createSpan({
					cls: "repose-result-label",
					text: `${ep.number}: ${ep.title}`,
				});
				li.addEventListener("click", () => void this.selectEpisodeFromSeason(raw, showTraktId, seasonNumber));
			}
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	private async importSeasonEpisodesBatch(
		episodes: Array<{
			season: number;
			number: number;
			title: string;
			overview: string | null;
			firstAired: string | null;
			runtime: number | null;
			rating: number | null;
			votes: number | null;
			ids: Record<string, unknown>;
		}>,
	): Promise<void> {
		const show = this.contextShow ?? this.selectedShowForEpisode;
		if (!show || !(show as TraktShowOrMovie).title) {
			new Notice("Missing show context for import.");
			return;
		}
		const showData = show as TraktShowOrMovie;
		const tmdb = this.plugin.settings.tmdbApiKey.trim();
		const showTmdb = (showData.ids as { tmdb?: number } | undefined)?.tmdb;
		const showTrakt = (showData.ids as { trakt?: number } | undefined)?.trakt;
		const progressOnce =
			showTrakt != null ? await fetchShowWatchedProgress(this.plugin, showTrakt) : undefined;
		let ok = 0;
		let failed = 0;
		for (const epRow of episodes) {
			const raw = epRow as unknown as Record<string, unknown>;
			const episode = asEpisode(raw);
			let still: string | null = null;
			if (tmdb && showTmdb != null && episode.season != null && episode.number != null) {
				still = await fetchEpisodeStill(tmdb, showTmdb, episode.season, episode.number);
			}
			try {
				await addTraktEpisodeToVault(
					this.app.vault,
					this.plugin.settings,
					episode,
					showData,
					still,
					this.plugin,
					progressOnce,
				);
				ok++;
			} catch {
				failed++;
			}
		}
		new Notice(`Season import: ${ok} episode note(s) saved${failed ? `, ${failed} failed` : ""}.`);
	}

	private async selectEpisodeFromSeason(
		epRaw: Record<string, unknown>,
		showTraktId: number,
		seasonNumber: number,
	): Promise<void> {
		const show = this.contextShow ?? this.selectedShowForEpisode ?? {};
		this.selectedKind = "episode";
		this.selectedItem = asEpisode(epRaw);
		this.selectedShowForEpisode = show;
		const ids = show.ids as { tmdb?: number } | undefined;
		this.currentShowTmdbId = ids?.tmdb ?? null;
		this.currentShowTraktId = showTraktId;
		this.browseSeasonNumber = seasonNumber;

		this.detailEl.empty();
		const card = this.detailEl.createDiv({ cls: "repose-detail" });
		card.createEl("h3", { text: (this.selectedItem as TraktEpisode).title });
		this.renderEpisodeDetailNavigation(card, true);
		card.createEl("p", { text: `Show: ${show.title ?? "—"}`, cls: "repose-muted" });
		const actions = card.createDiv({ cls: "repose-actions" });
		actions.createEl("button", { text: "Add episode note" }).addEventListener("click", () => void this.addEpisode());
	}

}

export async function activateReposeView(plugin: ReposePlugin): Promise<void> {
	await revealOrCreateView(plugin.app, VIEW_TYPE_REPOSE, "main");
}

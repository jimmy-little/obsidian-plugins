<script lang="ts">
	import { Notice } from "obsidian";
	import type ReposePlugin from "../main";
	import {
		getEpisodeRowStillThumb,
		getSeasonEpisodes,
		getShowSeasons,
		getThumbnailUrlForSearchHit,
		searchTrakt,
		type TraktSearchHit,
	} from "../trakt/client";
	import {
		dedupeTraktSearchResults,
		episodeFromSeasonRow,
		labelForSearchHit,
		parseSearchHit,
		type ParsedSearchSelection,
	} from "../trakt/searchSelection";
	import {
		addTraktEpisodeToVault,
		addTraktShowOrMovieToVault,
		fetchEpisodeStill,
		fetchImagesForItem,
		lookupShowInVault,
	} from "../vault/reposeImport";
	import type { TraktEpisode, TraktShowOrMovie } from "../vault/traktNotes";

	export let plugin: ReposePlugin;

	function stableSearchRowKey(row: TraktSearchHit, i: number): string {
		const mv = row.movie as { ids?: { trakt?: number } } | undefined;
		const sh = row.show as { ids?: { trakt?: number } } | undefined;
		const ep = row.episode as { ids?: { trakt?: number } } | undefined;
		if (mv?.ids?.trakt != null) return `m-${mv.ids.trakt}`;
		if (sh?.ids?.trakt != null) return `s-${sh.ids.trakt}`;
		if (ep?.ids?.trakt != null) return `e-${ep.ids.trakt}`;
		return `i-${i}-${row.type}`;
	}

	type PanelView = "search" | "detail" | "seasons" | "episodes" | "episodeAdd";

	let searchQuery = "";
	/** Trakt search type: "" = all */
	let typeFilter = "show";
	let searchBusy = false;
	let results: TraktSearchHit[] = [];
	let thumbs: (string | null)[] = [];

	let panelView: PanelView = "search";
	let detailRow: TraktSearchHit | null = null;
	let parsed: ParsedSearchSelection | null = null;
	let vaultPathHint = "";
	let imagesForAdd: Awaited<ReturnType<typeof fetchImagesForItem>> | null = null;

	let contextShow: TraktShowOrMovie | null = null;
	let seasonsBusy = false;
	let episodesBusy = false;
	let seasonsList: Awaited<ReturnType<typeof getShowSeasons>> = [];
	let episodesList: Awaited<ReturnType<typeof getSeasonEpisodes>> = [];
	let browseSeasonNumber = 0;
	let episodeRowThumbs: (string | null)[] = [];
	let episodeAddBusy = false;
	let pickedEpisode: TraktEpisode | null = null;

	async function runSearch(): Promise<void> {
		const clientId = plugin.settings.traktClientId.trim();
		if (!clientId) {
			new Notice("Set Trakt Client ID in Repose settings.");
			return;
		}
		const q = searchQuery.trim();
		if (!q) {
			new Notice("Enter a search query.");
			return;
		}
		searchBusy = true;
		try {
			const raw = await searchTrakt(clientId, q, typeFilter);
			results = dedupeTraktSearchResults(raw);
			const tmdbKey = plugin.settings.tmdbApiKey.trim();
			thumbs = tmdbKey
				? await Promise.all(results.map((row) => getThumbnailUrlForSearchHit(tmdbKey, row)))
				: results.map(() => null);
			panelView = "search";
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
			results = [];
			thumbs = [];
		} finally {
			searchBusy = false;
		}
	}

	function resetBrowse(): void {
		seasonsList = [];
		episodesList = [];
		browseSeasonNumber = 0;
		episodeRowThumbs = [];
		pickedEpisode = null;
	}

	function goSearchList(): void {
		panelView = "search";
		detailRow = null;
		parsed = null;
		vaultPathHint = "";
		imagesForAdd = null;
		resetBrowse();
		pickedEpisode = null;
	}

	async function openDetail(row: TraktSearchHit): Promise<void> {
		const p = parseSearchHit(row);
		if (!p) {
			new Notice("Could not open this search result.");
			return;
		}
		detailRow = row;
		parsed = p;
		contextShow =
			p.kind === "show" ? (p.item as TraktShowOrMovie) : p.showForEpisode ?? contextShow;
		vaultPathHint = "";
		imagesForAdd = null;
		resetBrowse();
		pickedEpisode = null;

		if (p.kind === "show" && (p.item as TraktShowOrMovie).title) {
			const lu = await lookupShowInVault(
				plugin.app.vault,
				plugin.settings,
				(p.item as TraktShowOrMovie).title!,
			);
			vaultPathHint = lu.found ? `In vault: ${lu.path}` : "Not in vault yet.";
		} else {
			vaultPathHint = "";
		}

		const tmdbKey = plugin.settings.tmdbApiKey.trim();
		if ((p.kind === "movie" || p.kind === "show") && tmdbKey) {
			const item = p.item as TraktShowOrMovie;
			const tmdb = item.ids?.tmdb;
			if (tmdb != null) {
				try {
					imagesForAdd = await fetchImagesForItem(tmdbKey, tmdb, p.kind === "movie" ? "movie" : "show");
				} catch {
					imagesForAdd = null;
				}
			}
		}

		panelView = "detail";
	}

	function back(): void {
		if (panelView === "episodeAdd") {
			panelView = "episodes";
			pickedEpisode = null;
			return;
		}
		if (panelView === "episodes") {
			panelView = "seasons";
			episodesList = [];
			episodeRowThumbs = [];
			browseSeasonNumber = 0;
			return;
		}
		if (panelView === "seasons") {
			panelView = "detail";
			seasonsList = [];
			return;
		}
		if (panelView === "detail") {
			goSearchList();
			return;
		}
	}

	async function addMovieOrShow(): Promise<void> {
		if (!parsed || (parsed.kind !== "movie" && parsed.kind !== "show")) return;
		try {
			const { path } = await addTraktShowOrMovieToVault(
				plugin.app.vault,
				plugin.settings,
				parsed.item as TraktShowOrMovie,
				parsed.kind,
				imagesForAdd,
			);
			new Notice(`Saved: ${path}`);
			if ((parsed.item as TraktShowOrMovie).title) {
				const lu = await lookupShowInVault(
					plugin.app.vault,
					plugin.settings,
					(parsed.item as TraktShowOrMovie).title!,
				);
				vaultPathHint = lu.found ? `In vault: ${lu.path}` : vaultPathHint;
			}
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	async function addEpisodeFromSearch(): Promise<void> {
		if (!parsed || parsed.kind !== "episode" || !parsed.showForEpisode) return;
		const ep = parsed.item as TraktEpisode;
		const show = parsed.showForEpisode;
		let still: string | null = null;
		const tmdb = plugin.settings.tmdbApiKey.trim();
		if (tmdb && parsed.showTmdbId != null && ep.season != null && ep.number != null) {
			still = await fetchEpisodeStill(tmdb, parsed.showTmdbId, ep.season, ep.number);
		}
		try {
			const { path } = await addTraktEpisodeToVault(plugin.app.vault, plugin.settings, ep, show, still);
			new Notice(`Saved: ${path}`);
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	async function openSeasonsBrowse(): Promise<void> {
		if (!parsed || parsed.kind !== "show" || parsed.showTraktId == null) return;
		const clientId = plugin.settings.traktClientId.trim();
		if (!clientId) {
			new Notice("Set Trakt Client ID in settings.");
			return;
		}
		contextShow = parsed.item as TraktShowOrMovie;
		seasonsBusy = true;
		try {
			seasonsList = await getShowSeasons(clientId, parsed.showTraktId);
			panelView = "seasons";
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		} finally {
			seasonsBusy = false;
		}
	}

	async function openEpisodesForSeason(seasonNumber: number): Promise<void> {
		if (!parsed?.showTraktId) return;
		const clientId = plugin.settings.traktClientId.trim();
		if (!clientId) return;
		const showTitle = contextShow?.title ?? "Show";
		browseSeasonNumber = seasonNumber;
		episodesBusy = true;
		try {
			episodesList = await getSeasonEpisodes(clientId, parsed.showTraktId, seasonNumber);
			const tmdbKey = plugin.settings.tmdbApiKey.trim();
			const showTmdb = contextShow?.ids?.tmdb ?? null;
			episodeRowThumbs =
				tmdbKey && showTmdb != null
					? await Promise.all(
							episodesList.map((ep) =>
								getEpisodeRowStillThumb(tmdbKey, showTmdb, ep.season, ep.number),
							),
						)
					: episodesList.map(() => null);
			panelView = "episodes";
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		} finally {
			episodesBusy = false;
		}
	}

	async function importSeasonBatch(): Promise<void> {
		const show = contextShow;
		if (!show?.title || episodesList.length === 0) {
			new Notice("Missing show or episodes.");
			return;
		}
		const tmdb = plugin.settings.tmdbApiKey.trim();
		const showTmdb = show.ids?.tmdb;
		let ok = 0;
		let failed = 0;
		for (const epRow of episodesList) {
			const episode = episodeFromSeasonRow(epRow);
			let still: string | null = null;
			if (tmdb && showTmdb != null && episode.season != null && episode.number != null) {
				still = await fetchEpisodeStill(tmdb, showTmdb, episode.season, episode.number);
			}
			try {
				await addTraktEpisodeToVault(plugin.app.vault, plugin.settings, episode, show, still);
				ok++;
			} catch {
				failed++;
			}
		}
		new Notice(`Season import: ${ok} episode note(s) saved${failed ? `, ${failed} failed` : ""}.`);
	}

	function pickEpisodeFromList(ep: (typeof episodesList)[0]): void {
		if (!contextShow) return;
		pickedEpisode = episodeFromSeasonRow(ep);
		panelView = "episodeAdd";
	}

	async function addPickedEpisodeNote(): Promise<void> {
		if (!pickedEpisode || !contextShow) return;
		let still: string | null = null;
		const tmdb = plugin.settings.tmdbApiKey.trim();
		const showTmdb = contextShow.ids?.tmdb;
		if (tmdb && showTmdb != null && pickedEpisode.season != null && pickedEpisode.number != null) {
			still = await fetchEpisodeStill(tmdb, showTmdb, pickedEpisode.season, pickedEpisode.number);
		}
		episodeAddBusy = true;
		try {
			const { path } = await addTraktEpisodeToVault(
				plugin.app.vault,
				plugin.settings,
				pickedEpisode,
				contextShow,
				still,
			);
			new Notice(`Saved: ${path}`);
			panelView = "episodes";
			pickedEpisode = null;
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		} finally {
			episodeAddBusy = false;
		}
	}

	$: detailTitle =
		parsed?.kind === "episode"
			? (parsed.item as TraktEpisode).title ?? ""
			: (parsed?.item as TraktShowOrMovie)?.title ?? "";

	$: seasonsFiltered = seasonsList.filter((x) => x.number > 0);
</script>

<div class="repose-search-add">
	{#if panelView === "search"}
		<div class="repose-search-add__controls">
			<input
				class="search-input"
				type="search"
				placeholder="Search Trakt…"
				aria-label="Search Trakt"
				bind:value={searchQuery}
				on:keydown={(e) => e.key === "Enter" && void runSearch()}
			/>
			<div class="repose-search-add__type-row">
				<select bind:value={typeFilter} aria-label="Result type">
					<option value="">All</option>
					<option value="show">Shows</option>
					<option value="movie">Movies</option>
					<option value="episode">Episodes</option>
				</select>
				<button type="button" class="mod-cta" disabled={searchBusy} on:click={() => void runSearch()}>
					{searchBusy ? "…" : "Search"}
				</button>
			</div>
		</div>
		{#if results.length === 0 && !searchBusy}
			<p class="repose-muted repose-search-add__hint">Search Trakt to add a show or movie to your vault.</p>
		{:else}
			<ul class="repose-sidebar-media-list repose-search-add__results">
				{#each results as row, i (stableSearchRowKey(row, i))}
					<li>
						<div
							role="button"
							tabindex="0"
							class="repose-ml-row"
							on:click={() => void openDetail(row)}
							on:keydown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									void openDetail(row);
								}
							}}
						>
							<div class="repose-ml-row__thumb-wrap">
								{#if thumbs[i]}
									<img class="repose-ml-row__thumb" src={thumbs[i] ?? ""} alt="" />
								{:else}
									<div class="repose-ml-row__thumb repose-ml-row__thumb--placeholder" aria-hidden="true"></div>
								{/if}
							</div>
							<div class="repose-ml-row__inner">
								<div class="repose-ml-row__head">
									<span class="repose-ml-row__name">{labelForSearchHit(row)}</span>
									<span class="repose-ml-row__area">{row.type}</span>
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if panelView === "detail" && parsed}
		<div class="repose-search-add__nav">
			<button type="button" class="repose-search-add__back" on:click={back}>← Results</button>
		</div>
		<div class="repose-search-add__detail">
			<h3 class="repose-search-add__detail-title">{detailTitle || "Result"}</h3>
			{#if vaultPathHint}
				<p class="repose-muted repose-search-add__vault-hint">{vaultPathHint}</p>
			{/if}
			<div class="repose-search-add__actions">
				{#if parsed.kind === "movie" || parsed.kind === "show"}
					<button type="button" class="mod-cta" on:click={() => void addMovieOrShow()}>Add to vault</button>
				{/if}
				{#if parsed.kind === "show" && parsed.showTraktId != null}
					<button type="button" on:click={() => void openSeasonsBrowse()} disabled={seasonsBusy}>
						{seasonsBusy ? "…" : "Browse seasons"}
					</button>
				{/if}
				{#if parsed.kind === "episode" && parsed.showForEpisode}
					<button type="button" class="mod-cta" on:click={() => void addEpisodeFromSearch()}>Add episode note</button>
				{/if}
			</div>
		</div>
	{:else if panelView === "seasons" && contextShow}
		<div class="repose-search-add__nav">
			<button type="button" class="repose-search-add__back" on:click={back}>← Result</button>
		</div>
		<h3 class="repose-search-add__subhead">Seasons · {contextShow.title ?? ""}</h3>
		<ul class="repose-sidebar-media-list">
			{#each seasonsFiltered as season (season.number)}
				<li>
					<div
						role="button"
						tabindex="0"
						class="repose-ml-row"
						on:click={() => void openEpisodesForSeason(season.number)}
						on:keydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								void openEpisodesForSeason(season.number);
							}
						}}
					>
						<div class="repose-ml-row__thumb-wrap">
							<div class="repose-ml-row__thumb repose-ml-row__thumb--placeholder" aria-hidden="true"></div>
						</div>
						<div class="repose-ml-row__inner">
							<div class="repose-ml-row__head">
								<span class="repose-ml-row__name">Season {season.number}</span>
								<span class="repose-ml-row__area">{season.episodeCount} ep</span>
							</div>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else if panelView === "episodes" && contextShow}
		<div class="repose-search-add__nav repose-search-add__nav--split">
			<button type="button" class="repose-search-add__back" on:click={back}>← Seasons</button>
			<button type="button" on:click={() => void importSeasonBatch()} disabled={episodesBusy || episodesList.length === 0}>
				Add all in season
			</button>
		</div>
		<h3 class="repose-search-add__subhead">{contextShow.title ?? ""} · S{browseSeasonNumber}</h3>
		<ul class="repose-sidebar-media-list repose-search-add__ep-list">
			{#each episodesList as ep, i (ep.number + "-" + ep.season)}
				<li>
					<div
						role="button"
						tabindex="0"
						class="repose-ml-row"
						on:click={() => pickEpisodeFromList(ep)}
						on:keydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								pickEpisodeFromList(ep);
							}
						}}
					>
						<div class="repose-ml-row__thumb-wrap repose-ml-row__thumb-wrap--wide">
							{#if episodeRowThumbs[i]}
								<img
									class="repose-ml-row__thumb repose-ml-row__thumb--still"
									src={episodeRowThumbs[i] ?? ""}
									alt=""
								/>
							{:else}
								<div class="repose-ml-row__thumb repose-ml-row__thumb--placeholder repose-ml-row__thumb--still" aria-hidden="true"></div>
							{/if}
						</div>
						<div class="repose-ml-row__inner">
							<div class="repose-ml-row__head">
								<span class="repose-ml-row__name">{ep.number}. {ep.title}</span>
							</div>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else if panelView === "episodeAdd" && pickedEpisode && contextShow}
		<div class="repose-search-add__nav">
			<button type="button" class="repose-search-add__back" on:click={back}>← Episodes</button>
		</div>
		<div class="repose-search-add__detail">
			<h3 class="repose-search-add__detail-title">{pickedEpisode.title}</h3>
			<p class="repose-muted">S{pickedEpisode.season}E{pickedEpisode.number} · {contextShow.title ?? ""}</p>
			<button
				type="button"
				class="mod-cta"
				disabled={episodeAddBusy}
				on:click={() => void addPickedEpisodeNote()}
			>
				{episodeAddBusy ? "…" : "Add episode note"}
			</button>
		</div>
	{/if}
</div>

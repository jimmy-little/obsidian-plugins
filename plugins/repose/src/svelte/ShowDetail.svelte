<script lang="ts">
	import { Notice, setIcon, type App, TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import type { MediaHeroPalette } from "../media/bannerSample";
	import {
		resolveBannerOrCoverFile,
		resolveExternalImageUrl,
		resolveListThumbnailFile,
	} from "../media/banner";
	import {
		bookAuthorsLineFromFrontmatter,
		descriptionFromFrontmatter,
		genresFromFrontmatter,
		isEffectivelyWatchedFromFrontmatter,
		openLibraryCatalogUrlFromFrontmatter,
		readMediaItem,
		readingDatesCommaDetail,
		releaseLabelFromFrontmatter,
		traktShowStatusBadgeFromFrontmatter,
		watchedPlayDatesCommaDetail,
	} from "../media/mediaModel";
	import BundleNoteEditor from "./BundleNoteEditor.svelte";
	import MediaHero from "./MediaHero.svelte";
	import { resolveMediaTypeForFile } from "../media/mediaDetect";
	import {
		collectEpisodeNoteFiles,
		personalSerialWatchBadgeLabel,
		readEpisodeRow,
		sortPodcastEpisodeFilesNewestFirst,
		tmdbIdFromFrontmatter,
		type EpisodeRow,
	} from "../media/showEpisodes";
	import { traktShowWebUrl } from "../trakt/constants";
	import { getTMDBEpisodeImage } from "../trakt/client";
	import { readTraktIdFromFrontmatter } from "../trakt/watchedSync";

	export let plugin: ReposePlugin;
	export let showFile: TFile;
	/** Games use the same hero banner as shows but no Trakt refresh or episode list. */
	export let serialKind: "show" | "game" = "show";
	/** Open an episode (or other path) in the Repose main view — required for serial episode rows. */
	export let onSelectPath: (path: string) => void;
	/** Forwarded to MediaHero so the parent can tint the full detail pane. */
	export let onPalette: ((p: MediaHeroPalette | null) => void) | undefined = undefined;
	/** Repose home — shown in the hero toolbar for podcast / book bundles only. */
	export let onGoHome: (() => void) | undefined = undefined;
	/** Fulcrum-style: hero is on the markdown leaf — hide bundle lists/notes below the hero. */
	export let embeddedMarkdownChrome = false;
	/** Repose main pane: book bundle is already open in the split — don’t duplicate the hero here. */
	export let suppressReposeBookMirror = false;
	/** Markdown chrome: bundle file is already the open note. */
	export let hideOpenNoteButton = false;

	let bannerSrc: string | null = null;
	let posterSrc: string | null = null;
	let episodes: EpisodeRow[] = [];
	let thumbByPath: Record<string, string | null> = {};
	/** Season numbers with expanded episode lists (default: none → all collapsed). */
	let expandedSeasonKeys = new Set<number>();
	let loadToken = 0;
	/** Bumps when show watched state changes so `item` re-reads frontmatter. */
	let detailRefresh = 0;
	let refreshBusy = false;

	function truncate(s: string, max: number): string {
		const t = s.trim();
		if (t.length <= max) return t;
		return t.slice(0, max - 1).trimEnd() + "…";
	}

	/** One line: "Watched · Apr 18, 2026" or "Listened · …" using play dates when present. */
	function episodeWatchedMetaLine(ep: EpisodeRow, listen: boolean): string | null {
		const label = listen ? "Listened" : "Watched";
		const parts: string[] =
			ep.watchedDatesCard.length > 0 ? [...ep.watchedDatesCard] : ep.watchedDate ? [ep.watchedDate] : [];
		if (parts.length === 0) return null;
		return `${label} · ${parts.join(" · ")}`;
	}

	function groupEpisodesBySeason(eps: EpisodeRow[]): [number, EpisodeRow[]][] {
		const map = new Map<number, EpisodeRow[]>();
		for (const ep of eps) {
			const s = ep.season != null ? ep.season : -1;
			if (!map.has(s)) map.set(s, []);
			map.get(s)!.push(ep);
		}
		return [...map.entries()].sort((a, b) => {
			if (a[0] === -1) return 1;
			if (b[0] === -1) return -1;
			return a[0] - b[0];
		});
	}

	function seasonHeading(seasonNum: number): string {
		if (seasonNum === -1) return "Other episodes";
		return `Season ${seasonNum}`;
	}

	function toggleSeasonExpanded(seasonNum: number): void {
		const next = new Set(expandedSeasonKeys);
		if (next.has(seasonNum)) next.delete(seasonNum);
		else next.add(seasonNum);
		expandedSeasonKeys = next;
	}

	function onSeasonHeaderKeydown(seasonNum: number, ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		toggleSeasonExpanded(seasonNum);
	}

	function seasonChevron(node: HTMLElement, expanded: boolean): { update: (ex: boolean) => void } {
		setIcon(node, expanded ? "chevron-down" : "chevron-right");
		return {
			update(ex: boolean) {
				node.empty();
				setIcon(node, ex ? "chevron-down" : "chevron-right");
			},
		};
	}

	function seasonRefreshGlyph(node: HTMLElement): void {
		setIcon(node, "refresh-ccw");
	}

	/** Which season is currently running a Trakt refresh (null = idle). */
	let seasonRefreshSeason: number | null = null;

	async function refreshSeasonFromTrakt(seasonNum: number): Promise<void> {
		if (serialKind !== "show" || seasonRefreshSeason !== null) return;
		seasonRefreshSeason = seasonNum;
		try {
			const r = await plugin.refreshTvSeasonFromTrakt(showFile, seasonNum);
			if (!r.ok) new Notice(r.error ?? "Could not refresh this season.");
			else new Notice(`Updated season ${seasonNum} from Trakt.`);
		} finally {
			seasonRefreshSeason = null;
			detailRefresh += 1;
			void loadDetail(showFile, serialKind);
		}
	}

	function hueFromPath(path: string): number {
		let h = 216;
		for (let i = 0; i < path.length; i++) h = (h + path.charCodeAt(i) * (i + 3)) % 360;
		return h;
	}

	function serialEpisodeProgress(
		app: App,
		kind: "show" | "game",
		textOnlySerial: boolean,
		eps: EpisodeRow[],
		_rev: number,
	): { watched: number; total: number } | null {
		if (kind === "game" || textOnlySerial || eps.length === 0) return null;
		let watched = 0;
		for (const ep of eps) {
			const f = app.vault.getAbstractFileByPath(ep.path);
			if (!(f instanceof TFile)) continue;
			const fm = (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
			if (isEffectivelyWatchedFromFrontmatter(fm)) watched++;
		}
		return { watched, total: eps.length };
	}

	function formatAirDate(iso: string): string {
		if (!iso) return "";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	}

	async function loadDetail(f: TFile, kind: typeof serialKind): Promise<void> {
		const token = ++loadToken;
		bannerSrc = null;
		posterSrc = null;
		episodes = [];
		thumbByPath = {};

		const app = plugin.app;
		const cache = app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

		const hostMt = resolveMediaTypeForFile(app, f, plugin.settings);
		const textOnlyBundle = hostMt === "podcast" || hostMt === "book";
		if (textOnlyBundle) {
			bannerSrc = null;
		} else {
			const backdrop = resolveBannerOrCoverFile(app, fm, f.path);
			bannerSrc = backdrop ? app.vault.getResourcePath(backdrop) : null;
		}
		const posterFile = resolveListThumbnailFile(app, fm, f.path, {
			bookBundle: hostMt === "book",
		});
		posterSrc = posterFile
			? app.vault.getResourcePath(posterFile)
			: resolveExternalImageUrl(fm);

		if (kind === "game") {
			if (token !== loadToken) return;
			expandedSeasonKeys = new Set();
			return;
		}

		let files = collectEpisodeNoteFiles(app, f, plugin.settings);
		if (hostMt === "podcast") {
			files = sortPodcastEpisodeFilesNewestFirst(app, files);
		}
		const rows = files.map((file) => readEpisodeRow(app, file));
		if (token !== loadToken) return;
		episodes = rows;

		const next: Record<string, string | null> = {};
		if (!textOnlyBundle) {
			const showTmdb = tmdbIdFromFrontmatter(fm);
			const apiKey = plugin.settings.tmdbApiKey?.trim() ?? "";

			for (const ep of rows) {
				const ef = app.vault.getAbstractFileByPath(ep.path);
				if (!(ef instanceof TFile)) {
					next[ep.path] = null;
					continue;
				}
				const eCache = app.metadataCache.getFileCache(ef);
				const eFm = (eCache?.frontmatter ?? {}) as Record<string, unknown>;
				const local = resolveBannerOrCoverFile(app, eFm, ep.path);
				if (local) {
					next[ep.path] = app.vault.getResourcePath(local);
					continue;
				}
				if (
					showTmdb != null &&
					apiKey &&
					ep.season != null &&
					ep.episode != null
				) {
					try {
						const url = await getTMDBEpisodeImage(
							showTmdb,
							ep.season,
							ep.episode,
							apiKey,
						);
						next[ep.path] = url;
					} catch {
						next[ep.path] = null;
					}
				} else {
					next[ep.path] = null;
				}
				if (token !== loadToken) return;
			}
		}
		if (token !== loadToken) return;
		thumbByPath = next;
		expandedSeasonKeys = new Set();
	}

	$: void loadDetail(showFile, serialKind);

	$: seasonGroups = groupEpisodesBySeason(episodes);

	function onEpisodeRowKeydown(ev: KeyboardEvent, ep: EpisodeRow): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		onSelectPath(ep.path);
	}

	async function toggleWatched(path: string): Promise<void> {
		await plugin.toggleWatchedFrontmatter(path);
		const f = plugin.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) {
			const row = readEpisodeRow(plugin.app, f);
			episodes = episodes.map((e) => (e.path === path ? row : e));
		}
	}

	async function openShowNote(): Promise<void> {
		await plugin.app.workspace.getLeaf("tab").openFile(showFile);
	}

	async function toggleShowWatched(): Promise<void> {
		await plugin.toggleWatchedFrontmatter(showFile.path);
		detailRefresh += 1;
	}

	function refreshSuccessNotice(): void {
		const mt = resolveMediaTypeForFile(plugin.app, showFile, plugin.settings);
		if (serialKind === "game") {
			new Notice("Updated game metadata and images.");
			return;
		}
		if (mt === "book") {
			new Notice("Updated book metadata and cover.");
			return;
		}
		if (mt === "show") {
			new Notice("Updated series metadata and added any new episode notes.");
			return;
		}
		new Notice("Updated metadata and images.");
	}

	async function refreshData(): Promise<void> {
		if (refreshBusy) return;
		refreshBusy = true;
		try {
			const bump = (): void => {
				refreshSuccessNotice();
				detailRefresh += 1;
				void loadDetail(showFile, serialKind);
			};
			const r = await plugin.refreshMediaNote(showFile, { onComplete: bump });
			if (r.deferred) return;
			if (!r.ok) new Notice(r.error ?? "Could not refresh.");
			else bump();
		} finally {
			refreshBusy = false;
		}
	}

	$: item = (detailRefresh, readMediaItem(plugin.app, showFile, plugin.settings));
	$: isPodcast = item.mediaType === "podcast";
	$: isBook = item.mediaType === "book";
	$: isTextOnlySerial = isPodcast || isBook;
	$: seriesWatchIcon = item.watchedDate ? "eye-off" : "eye";
	$: watchedAria =
		serialKind === "game"
			? item.watchedDate
				? "Mark unwatched"
				: "Mark watched"
			: isPodcast
				? item.watchedDate
					? "Mark podcast as not listened"
					: "Mark podcast as listened"
				: isBook
					? item.watchedDate
						? "Mark book as unwatched"
						: "Mark book as watched"
					: item.watchedDate
						? "Mark series as unwatched"
						: "Mark series as watched";
	$: bannerDescription = descriptionFromFrontmatter(
		(detailRefresh, plugin.app.metadataCache.getFileCache(showFile)?.frontmatter ?? {}) as Record<
			string,
			unknown
		>,
	);
	$: genrePills = genresFromFrontmatter(
		(detailRefresh, plugin.app.metadataCache.getFileCache(showFile)?.frontmatter ?? {}) as Record<
			string,
			unknown
		>,
	);
	$: releaseLabel = releaseLabelFromFrontmatter(
		(detailRefresh, plugin.app.metadataCache.getFileCache(showFile)?.frontmatter ?? {}) as Record<
			string,
			unknown
		>,
		serialKind === "game"
			? "game"
			: item.mediaType === "podcast"
				? "podcast"
				: item.mediaType === "book"
					? "book"
					: "show",
	);
	$: posterHue = hueFromPath(showFile.path);
	$: showFmForMeta = (detailRefresh, plugin.app.metadataCache.getFileCache(showFile)?.frontmatter ?? {}) as Record<
		string,
		unknown
	>;
	$: bundleWatchedLine = isTextOnlySerial ? watchedPlayDatesCommaDetail(showFmForMeta) : "";
	$: bundleDetailMetaRows = ((): { label: string; value: string }[] => {
		if (!isTextOnlySerial) return [];
		const rows: { label: string; value: string }[] = [
			{ label: "Type", value: isBook ? "Book" : "Podcast" },
		];
		if (isBook) {
			const authors = bookAuthorsLineFromFrontmatter(showFmForMeta);
			if (authors) rows.push({ label: "Author", value: authors });
			const lh = readingDatesCommaDetail(showFmForMeta, "lastHighlighted");
			if (lh) rows.push({ label: "Last highlighted", value: lh });
		}
		if (item.status) rows.push({ label: "Status", value: item.status });
		if (bundleWatchedLine) rows.push({ label: isPodcast ? "Listened" : "Watched", value: bundleWatchedLine });
		return rows;
	})();
	$: episodeProgress = serialEpisodeProgress(
		plugin.app,
		serialKind,
		isTextOnlySerial,
		episodes,
		detailRefresh,
	);

	$: tvHeroPersonalBadge =
		item.mediaType === "show" && serialKind === "show" && !isTextOnlySerial
			? personalSerialWatchBadgeLabel(
					episodeProgress?.watched ?? 0,
					episodeProgress?.total ?? episodes.length,
					item.status,
				)
			: null;
	$: tvTraktPosterBadge =
		item.mediaType === "show" && serialKind === "show" && !isTextOnlySerial
			? traktShowStatusBadgeFromFrontmatter(showFmForMeta)
			: null;

	$: heroGlobeUrl = ((): string | null => {
		if (item.mediaType === "show" && serialKind === "show" && !isTextOnlySerial) {
			const tid = readTraktIdFromFrontmatter(showFmForMeta);
			return tid != null ? traktShowWebUrl(tid) : null;
		}
		if (isBook) return openLibraryCatalogUrlFromFrontmatter(showFmForMeta);
		return null;
	})();

	/** Banner + hero buttons: show refresh/sync progress (Trakt can be slow when rate-limited). */
	$: bannerSyncStatus = refreshBusy
		? serialKind === "game"
			? "Updating game…"
			: isBook
				? "Updating book…"
				: isPodcast
					? "Updating podcast…"
					: "Updating series from Trakt…"
		: seasonRefreshSeason !== null
			? `Syncing season ${seasonRefreshSeason} from Trakt…`
			: null;

	function epIsWatched(ep: EpisodeRow): boolean {
		void detailRefresh;
		const f = plugin.app.vault.getAbstractFileByPath(ep.path);
		if (!(f instanceof TFile)) return false;
		const fm = (plugin.app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
		return isEffectivelyWatchedFromFrontmatter(fm);
	}
</script>

{#if suppressReposeBookMirror}
	<p class="repose-muted repose-book-detail__suppressed">
		This book’s note is open in the editor beside Repose — read and edit there.
	</p>
{:else}
<div class="repose-show-detail">
	<MediaHero
		backdropSrc={bannerSrc}
		posterSrc={posterSrc}
		title={item.title}
		titleStatusBadge={tvHeroPersonalBadge}
		posterStatusBadge={tvTraktPosterBadge}
		releaseLabel={releaseLabel}
		description={bannerDescription}
		genres={genrePills}
		refreshBusy={refreshBusy || seasonRefreshSeason !== null}
		traktWebUrl={heroGlobeUrl}
		globeLinkTitle={isBook && heroGlobeUrl ? "Open Library" : undefined}
		globeLinkAria={isBook && heroGlobeUrl ? "Open this book on Open Library" : undefined}
		bannerStatus={bannerSyncStatus}
		watchIcon={seriesWatchIcon}
		watchedAria={watchedAria}
		hideOpenNoteButton={hideOpenNoteButton}
		refreshTitle={serialKind === "game"
			? "Refresh game metadata and images (IGDB)"
			: isBook
				? "Refresh book metadata and cover (Open Library)"
				: isPodcast
					? "Podcast refresh (not available yet)"
					: "Update series — metadata and new episode notes (Trakt / TMDB)"}
		onPalette={onPalette}
		onOpenNote={openShowNote}
		onToggleWatched={toggleShowWatched}
		onRefresh={() => void refreshData()}
		onGoHome={isTextOnlySerial ? onGoHome : undefined}
		detailMetaRows={bundleDetailMetaRows}
		listenUi={isPodcast}
		coverLayout={isTextOnlySerial}
		bookHero={isBook}
		coverShape={isBook ? "book" : "square"}
		collapseBannerWithoutBackdrop={isTextOnlySerial}
		showPosterPlaceholder={isTextOnlySerial && !posterSrc}
		posterPlaceholderHue={posterHue}
		episodeProgress={episodeProgress}
	/>

	{#if !embeddedMarkdownChrome}
	{#if isPodcast}
		<section class="repose-bundle-notes" aria-labelledby="repose-bundle-notes-h">
			<h3 id="repose-bundle-notes-h" class="repose-bundle-notes__title">Notes</h3>
			{#key showFile.path}
				<BundleNoteEditor {plugin} file={showFile} />
			{/key}
		</section>
	{/if}

	{#if serialKind !== "game" && episodes.length === 0}
		<p class="repose-muted repose-show-detail__empty">
			{isPodcast
				? "No episode notes in this podcast folder yet."
				: isBook
					? "No chapters in this book folder yet."
					: "No episode notes in this series folder yet."}
		</p>
	{:else if serialKind !== "game"}
		{#if isTextOnlySerial}
			<h3 class="repose-show-detail__episodes-heading">
				{isBook ? "Chapters" : "Episodes"}
			</h3>
			<ul class="repose-show-episodes repose-show-episodes--flat" role="list">
				{#each episodes as ep (ep.path)}
					{@const watchedMeta = episodeWatchedMetaLine(ep, isPodcast)}
					<li class="repose-show-episode-row repose-show-episode-row--text">
						<div class="repose-show-episode-row__stack">
							<div
								role="button"
								tabindex="0"
								class="repose-show-episode-row__hit repose-show-episode-row__hit--text-only"
								aria-label="Open {ep.title} in Repose"
								on:click={() => onSelectPath(ep.path)}
								on:keydown={(e) => onEpisodeRowKeydown(e, ep)}
							>
								<div class="repose-show-episode-row__side">
									<div class="repose-show-episode-row__head repose-show-episode-row__head--row">
										{#if watchedMeta}
											<p class="repose-show-episode-row__meta-line">
												{watchedMeta}
											</p>
										{:else}
											<span class="repose-show-episode-row__meta-line-spacer" aria-hidden="true"></span>
										{/if}
										<button
											type="button"
											class="repose-show-episode-row__watch"
											class:repose-show-episode-row__watch--watched={!!ep.watchedDate}
											on:click|stopPropagation={() => toggleWatched(ep.path)}
										>
											{isPodcast ? (ep.watchedDate ? "Listened" : "Listen") : ep.watchedDate ? "Watched" : "Watch"}
										</button>
									</div>
									<div class="repose-show-episode-row__body">
										<div class="repose-show-episode-row__title-line">
											<span class="repose-show-episode-row__title">{ep.title}</span>
											{#if ep.season != null && ep.episode != null}
												<span class="repose-muted">
													S{String(ep.season).padStart(2, "0")}E{String(ep.episode).padStart(2, "0")}
												</span>
											{/if}
										</div>
										{#if ep.airDate}
											<p class="repose-show-episode-row__date-line">
												{formatAirDate(ep.airDate)}
											</p>
										{/if}
										{#if ep.description}
											<p class="repose-show-episode-row__desc">
												{truncate(ep.description, 220)}
											</p>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
		<ul class="repose-show-episodes">
			{#each seasonGroups as [seasonNum, seasonEps] (seasonNum)}
				{@const total = seasonEps.length}
				{@const watchedCount = seasonEps.filter((e) => epIsWatched(e)).length}
				{@const expanded = expandedSeasonKeys.has(seasonNum)}
				<li class="repose-show-season">
					<!-- div, not button: Obsidian’s default button surface stays pale until :hover and overrides our bar styles -->
					<div
						role="button"
						tabindex="0"
						class="repose-show-season__header"
						aria-expanded={expanded}
						aria-controls={`repose-season-${String(seasonNum)}`}
						id={`repose-season-h-${String(seasonNum)}`}
						on:click={() => toggleSeasonExpanded(seasonNum)}
						on:keydown={(e) => onSeasonHeaderKeydown(seasonNum, e)}
					>
						{#if seasonRefreshSeason === seasonNum}
							<span class="repose-show-season__sync-hint" aria-live="polite">Syncing from Trakt…</span>
						{/if}
						<span class="repose-show-season__header-text">
							<strong class="repose-show-season__title">{seasonHeading(seasonNum)}</strong>
							<span class="repose-muted repose-show-season__stats">
								{total === 1 ? "1 episode" : `${total} episodes`}, {watchedCount} watched
							</span>
						</span>
						<div class="repose-show-season__header-end">
							{#if seasonNum >= 0}
								<button
									type="button"
									class="repose-show-season__refresh clickable-icon"
									title="Refresh this season from Trakt (metadata + watch state for all episodes)"
									aria-label="Refresh season {seasonNum} from Trakt"
									disabled={seasonRefreshSeason !== null}
									aria-busy={seasonRefreshSeason === seasonNum}
									on:click|stopPropagation={() => void refreshSeasonFromTrakt(seasonNum)}
								>
									<span
										class="repose-show-season__refresh-icon"
										use:seasonRefreshGlyph
										aria-hidden="true"
									></span>
								</button>
							{/if}
							<span
								class="repose-show-season__chevron"
								use:seasonChevron={expanded}
								aria-hidden="true"
							></span>
						</div>
					</div>
					{#if expanded}
						<ul class="repose-show-season__list" id={`repose-season-${String(seasonNum)}`} role="list">
							{#each seasonEps as ep (ep.path)}
								{@const watchedMeta = episodeWatchedMetaLine(ep, false)}
								<li class="repose-show-episode-row repose-show-episode-row--tv">
									<div class="repose-show-episode-row__stack">
										<div
											role="button"
											tabindex="0"
											class="repose-show-episode-row__hit"
											aria-label="Open {ep.title} in Repose{epIsWatched(ep)
												? ', watched'
												: ', not watched'}"
											on:click={() => onSelectPath(ep.path)}
											on:keydown={(e) => onEpisodeRowKeydown(e, ep)}
										>
											<div class="repose-show-episode-row__thumb-wrap">
												{#if thumbByPath[ep.path]}
													<img
														class="repose-show-episode-row__thumb"
														src={thumbByPath[ep.path] ?? ""}
														alt=""
													/>
												{:else}
													<div class="repose-show-episode-row__thumb-placeholder" />
												{/if}
											</div>
											<div class="repose-show-episode-row__side">
												<div class="repose-show-episode-row__head repose-show-episode-row__head--row">
													{#if watchedMeta}
														<p class="repose-show-episode-row__meta-line">
															{watchedMeta}
														</p>
													{:else}
														<span class="repose-show-episode-row__meta-line-spacer" aria-hidden="true"></span>
													{/if}
													<button
														type="button"
														class="repose-show-episode-row__watch"
													class:repose-show-episode-row__watch--watched={epIsWatched(ep)}
														on:click|stopPropagation={() => toggleWatched(ep.path)}
													>
														{epIsWatched(ep) ? "Watched" : "Watch"}
													</button>
												</div>
												<div class="repose-show-episode-row__body">
													<div class="repose-show-episode-row__title-line">
														<span class="repose-show-episode-row__title">{ep.title}</span>
														{#if ep.season != null && ep.episode != null}
															<span class="repose-muted">
																S{String(ep.season).padStart(2, "0")}E{String(ep.episode).padStart(2, "0")}
															</span>
														{/if}
													</div>
													{#if ep.airDate}
														<p class="repose-show-episode-row__air">
															{formatAirDate(ep.airDate)}
														</p>
													{/if}
													{#if ep.description}
														<p class="repose-show-episode-row__desc">
															{truncate(ep.description, 220)}
														</p>
													{/if}
												</div>
											</div>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
		{/if}
	{/if}
	{/if}
</div>
{/if}

<script lang="ts">
	import { Notice, setIcon, TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import type { MediaHeroPalette } from "../media/bannerSample";
	import { resolveBannerOrCoverFile, resolveListThumbnailFile } from "../media/banner";
	import {
		descriptionFromFrontmatter,
		genresFromFrontmatter,
		readMediaItem,
		releaseLabelFromFrontmatter,
	} from "../media/mediaModel";
	import MediaHero from "./MediaHero.svelte";
	import {
		collectEpisodeNoteFiles,
		readEpisodeRow,
		tmdbIdFromFrontmatter,
		type EpisodeRow,
	} from "../media/showEpisodes";
	import { getTMDBEpisodeImage } from "../trakt/client";

	export let plugin: ReposePlugin;
	export let showFile: TFile;
	/** Games use the same hero banner as shows but no Trakt refresh or episode list. */
	export let serialKind: "show" | "game" = "show";
	/** Forwarded to MediaHero so the parent can tint the full detail pane. */
	export let onPalette: ((p: MediaHeroPalette | null) => void) | undefined = undefined;

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

	function seasonChevron(node: HTMLElement, expanded: boolean): { update: (ex: boolean) => void } {
		setIcon(node, expanded ? "chevron-down" : "chevron-right");
		return {
			update(ex: boolean) {
				node.empty();
				setIcon(node, ex ? "chevron-down" : "chevron-right");
			},
		};
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

		const backdrop = resolveBannerOrCoverFile(app, fm, f.path);
		bannerSrc = backdrop ? app.vault.getResourcePath(backdrop) : null;
		const posterFile = resolveListThumbnailFile(app, fm, f.path);
		posterSrc = posterFile ? app.vault.getResourcePath(posterFile) : null;

		if (kind === "game") {
			if (token !== loadToken) return;
			expandedSeasonKeys = new Set();
			return;
		}

		const files = collectEpisodeNoteFiles(app, f);
		const rows = files.map((file) => readEpisodeRow(app, file));
		if (token !== loadToken) return;
		episodes = rows;

		const showTmdb = tmdbIdFromFrontmatter(fm);
		const apiKey = plugin.settings.tmdbApiKey?.trim() ?? "";

		const next: Record<string, string | null> = {};
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
		if (token !== loadToken) return;
		thumbByPath = next;
		expandedSeasonKeys = new Set();
	}

	$: void loadDetail(showFile, serialKind);

	$: seasonGroups = groupEpisodesBySeason(episodes);

	async function openNote(path: string): Promise<void> {
		const f = plugin.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) await plugin.app.workspace.getLeaf("tab").openFile(f);
	}

	async function toggleWatched(path: string): Promise<void> {
		await plugin.toggleWatchedFrontmatter(path);
		const f = plugin.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) {
			const row = readEpisodeRow(plugin.app, f);
			episodes = episodes.map((e) =>
				e.path === path ? { ...e, watchedDate: row.watchedDate } : e,
			);
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
		new Notice(
			serialKind === "game"
				? "Updated game metadata and images."
				: "Updated metadata and images.",
		);
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
	$: seriesWatchIcon = item.watchedDate ? "eye-off" : "eye";
	$: watchedAria =
		serialKind === "game"
			? item.watchedDate
				? "Mark unwatched"
				: "Mark watched"
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
		serialKind === "game" ? "game" : item.mediaType === "podcast" ? "podcast" : "show",
	);
</script>

<div class="repose-show-detail">
	<MediaHero
		backdropSrc={bannerSrc}
		posterSrc={posterSrc}
		title={item.title}
		releaseLabel={releaseLabel}
		description={bannerDescription}
		genres={genrePills}
		busy={refreshBusy}
		watchIcon={seriesWatchIcon}
		watchedAria={watchedAria}
		refreshTitle="Refresh metadata and images (Trakt / TMDB / IGDB)"
		onPalette={onPalette}
		onOpenNote={openShowNote}
		onToggleWatched={toggleShowWatched}
		onRefresh={() => void refreshData()}
	/>

	{#if serialKind !== "game" && episodes.length === 0}
		<p class="repose-muted repose-show-detail__empty">No episode notes in this series folder yet.</p>
	{:else if serialKind !== "game"}
		<ul class="repose-show-episodes">
			{#each seasonGroups as [seasonNum, seasonEps] (seasonNum)}
				{@const total = seasonEps.length}
				{@const watchedCount = seasonEps.filter((e) => !!e.watchedDate).length}
				{@const expanded = expandedSeasonKeys.has(seasonNum)}
				<li class="repose-show-season">
					<button
						type="button"
						class="repose-show-season__header"
						aria-expanded={expanded}
						aria-controls={`repose-season-${String(seasonNum)}`}
						id={`repose-season-h-${String(seasonNum)}`}
						on:click={() => toggleSeasonExpanded(seasonNum)}
					>
						<span class="repose-show-season__header-text">
							<strong class="repose-show-season__title">{seasonHeading(seasonNum)}</strong>
							<span class="repose-muted repose-show-season__stats">
								{total === 1 ? "1 episode" : `${total} episodes`}, {watchedCount} watched
							</span>
						</span>
						<span
							class="repose-show-season__chevron"
							use:seasonChevron={expanded}
							aria-hidden="true"
						></span>
					</button>
					{#if expanded}
						<ul class="repose-show-season__list" id={`repose-season-${String(seasonNum)}`} role="list">
							{#each seasonEps as ep (ep.path)}
								<li class="repose-show-episode-row">
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
									<div class="repose-show-episode-row__actions">
										<button type="button" on:click={() => openNote(ep.path)}>Open</button>
										<button
											type="button"
											class="repose-show-episode-row__watch"
											class:repose-show-episode-row__watch--watched={!!ep.watchedDate}
											on:click={() => toggleWatched(ep.path)}
										>
											{ep.watchedDate ? "Watched" : "Watch"}
										</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

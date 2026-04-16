<script lang="ts">
	import { Notice, setIcon, TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { resolveBannerOrCoverFile } from "../media/banner";
	import { readMediaItem } from "../media/mediaModel";
	import {
		collectEpisodeNoteFiles,
		readEpisodeRow,
		tmdbIdFromFrontmatter,
		type EpisodeRow,
	} from "../media/showEpisodes";
	import { getTMDBEpisodeImage } from "../trakt/client";

	export let plugin: ReposePlugin;
	export let showFile: TFile;

	function reposeBannerIcon(node: HTMLElement, icon: string): { update: (next: string) => void } {
		setIcon(node, icon);
		return {
			update(next: string) {
				node.empty();
				setIcon(node, next);
			},
		};
	}

	let bannerSrc: string | null = null;
	let episodes: EpisodeRow[] = [];
	let thumbByPath: Record<string, string | null> = {};
	let loadToken = 0;
	/** Bumps when show watched state changes so `item` re-reads frontmatter. */
	let detailRefresh = 0;
	let refreshBusy = false;

	function truncate(s: string, max: number): string {
		const t = s.trim();
		if (t.length <= max) return t;
		return t.slice(0, max - 1).trimEnd() + "…";
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

	async function loadDetail(f: TFile): Promise<void> {
		const token = ++loadToken;
		bannerSrc = null;
		episodes = [];
		thumbByPath = {};

		const app = plugin.app;
		const cache = app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

		const img = resolveBannerOrCoverFile(app, fm, f.path);
		bannerSrc = img ? app.vault.getResourcePath(img) : null;

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
	}

	$: void loadDetail(showFile);

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

	async function refreshData(): Promise<void> {
		if (refreshBusy) return;
		refreshBusy = true;
		try {
			const r = await plugin.refreshShowFromTrakt(showFile);
			if (r.ok) new Notice("Refreshed show and episodes.");
			else new Notice(r.error ?? "Could not refresh.");
			detailRefresh += 1;
			await loadDetail(showFile);
		} finally {
			refreshBusy = false;
		}
	}

	$: item = (detailRefresh, readMediaItem(plugin.app, showFile));
	$: seriesWatchIcon = item.watchedDate ? "eye-off" : "eye";
</script>

<div class="repose-show-detail">
	<div
		class="repose-show-banner"
		class:repose-show-banner--image={!!bannerSrc}
		class:repose-show-banner--placeholder={!bannerSrc}
	>
		{#if bannerSrc}
			<img class="repose-show-banner__img" src={bannerSrc} alt="" />
		{/if}
		<div class="repose-show-banner__scrim" aria-hidden="true"></div>
		<div class="repose-show-banner__inner repose-show-banner__inner--on-dark">
			<div class="repose-show-banner__bottom">
				<h2 class="repose-show-banner__title">{item.title}</h2>
				<div class="repose-show-banner__actions">
					<div class="repose-banner-btn-row">
						<button
							type="button"
							class="repose-banner-btn repose-banner-btn--icon-only"
							aria-label="Open note"
							title="Open note"
							disabled={refreshBusy}
							on:click={openShowNote}
						>
							<span
								class="repose-banner-btn__icon"
								use:reposeBannerIcon={"file-input"}
								aria-hidden="true"
							></span>
						</button>
						<button
							type="button"
							class="repose-banner-btn repose-banner-btn--icon-only"
							aria-label={item.watchedDate ? "Mark series as unwatched" : "Mark series as watched"}
							title={item.watchedDate ? "Mark series as unwatched" : "Mark series as watched"}
							disabled={refreshBusy}
							on:click={toggleShowWatched}
						>
							<span
								class="repose-banner-btn__icon"
								use:reposeBannerIcon={seriesWatchIcon}
								aria-hidden="true"
							></span>
						</button>
					</div>
					<div class="repose-banner-btn-row">
						<button
							type="button"
							class="repose-banner-btn repose-banner-btn--icon-only"
							aria-label="Refresh data"
							title="Refresh data from Trakt / TMDB"
							disabled={refreshBusy}
							on:click={() => void refreshData()}
						>
							<span
								class="repose-banner-btn__icon"
								use:reposeBannerIcon={"refresh-ccw"}
								aria-hidden="true"
							></span>
						</button>
						<span class="repose-banner-btn-slot" aria-hidden="true"></span>
					</div>
				</div>
			</div>
		</div>
	</div>

	{#if episodes.length === 0}
		<p class="repose-muted repose-show-detail__empty">No episode notes in this series folder yet.</p>
	{:else}
		<ul class="repose-show-episodes">
			{#each episodes as ep (ep.path)}
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
</div>

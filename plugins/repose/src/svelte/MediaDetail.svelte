<script lang="ts">
	import { Notice, setIcon, type TFile } from "obsidian";
	import type { MediaHeroPalette } from "../media/bannerSample";
	import type ReposePlugin from "../main";
	import {
		resolveBannerOrCoverFile,
		resolveExternalImageUrl,
		resolveListThumbnailFile,
	} from "../media/banner";
	import {
		descriptionFromFrontmatter,
		genresFromFrontmatter,
		readMediaItem,
		releaseLabelFromFrontmatter,
		watchedPlayDatesCommaDetail,
	} from "../media/mediaModel";
	import MediaHero from "./MediaHero.svelte";
	import ShowDetail from "./ShowDetail.svelte";
	import EpisodeDetail from "./EpisodeDetail.svelte";
	import { resolveMediaTypeForFile, resolveSerialHostFile } from "../media/mediaDetect";

	export let plugin: ReposePlugin;
	export let selectedPath: string | null;
	export let onSelectPath: (path: string) => void;
	export let onGoHome: () => void;

	let detailRev = 0;
	let homeBtnEl: HTMLButtonElement | null = null;
	let backBtnEl: HTMLButtonElement | null = null;
	let movieRefreshBusy = false;
	let mediaSurfaceStyle = "";
	let mediaHasTint = false;

	function onMediaPalette(p: MediaHeroPalette | null): void {
		if (!p) {
			mediaSurfaceStyle = "";
			mediaHasTint = false;
			return;
		}
		mediaHasTint = true;
		mediaSurfaceStyle = `--repose-sample-r: ${p.r}; --repose-sample-g: ${p.g}; --repose-sample-b: ${p.b};`;
	}

	function backdropSrcForFile(f: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const img = resolveBannerOrCoverFile(plugin.app, fm, f.path);
		if (img) return plugin.app.vault.getResourcePath(img);
		return resolveExternalImageUrl(fm, ["banner", "cover", "image", "poster"]);
	}

	function posterSrcForFile(f: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const mt = resolveMediaTypeForFile(plugin.app, f, plugin.settings);
		const img = resolveListThumbnailFile(plugin.app, fm, f.path, {
			bookBundle: mt === "book",
		});
		if (img) return plugin.app.vault.getResourcePath(img);
		return resolveExternalImageUrl(fm);
	}

	$: file = selectedPath ? (plugin.app.vault.getAbstractFileByPath(selectedPath) as TFile | null) : null;
	$: item = (detailRev, file ? readMediaItem(plugin.app, file, plugin.settings) : null);
	$: movieBackdropSrc = file && item?.mediaType === "movie" ? backdropSrcForFile(file) : null;
	$: moviePosterSrc = file && item?.mediaType === "movie" ? posterSrcForFile(file) : null;
	$: movieWatchIcon = item?.mediaType === "movie" && item.watchedDate ? "eye-off" : "eye";
	$: movieCache = (detailRev, file && item?.mediaType === "movie" ? plugin.app.metadataCache.getFileCache(file) : null);
	$: movieFm = (movieCache?.frontmatter ?? {}) as Record<string, unknown>;
	$: movieDescription =
		file && item?.mediaType === "movie" ? descriptionFromFrontmatter(movieFm) : null;
	$: movieGenres = file && item?.mediaType === "movie" ? genresFromFrontmatter(movieFm) : [];
	$: movieReleaseLabel =
		file && item?.mediaType === "movie" ? releaseLabelFromFrontmatter(movieFm, "movie") : null;
	$: movieWatchedDetailLine =
		file && item?.mediaType === "movie" ? watchedPlayDatesCommaDetail(movieFm) : "";
	$: movieDetailMetaRows = movieWatchedDetailLine
		? [{ label: "Watched", value: movieWatchedDetailLine }]
		: [];

	$: if (!selectedPath || !file || !item) {
		mediaSurfaceStyle = "";
		mediaHasTint = false;
	}

	$: if (homeBtnEl) setIcon(homeBtnEl, "home");
	$: if (backBtnEl) setIcon(backBtnEl, "arrow-left");

	$: hostForEpisode =
		file && item?.mediaType === "episode"
			? resolveSerialHostFile(plugin.app, file, plugin.settings)
			: null;

	$: companionPath = plugin.reposeCompanionMarkdownPath;
	$: bookChromeEmbedded =
		!!file && companionPath === file.path && item?.mediaType === "book";
	$: episodeCompanionSuppress =
		!!file && companionPath === file.path && item?.mediaType === "episode";

	async function openNote(): Promise<void> {
		if (!file) return;
		await plugin.app.workspace.getLeaf("tab").openFile(file);
	}

	async function toggleWatched(): Promise<void> {
		if (!selectedPath) return;
		await plugin.toggleWatchedFrontmatter(selectedPath);
		detailRev += 1;
	}

	async function refreshMovieData(): Promise<void> {
		if (!file) return;
		if (movieRefreshBusy) return;
		movieRefreshBusy = true;
		try {
			const bump = (): void => {
				new Notice("Updated metadata and images.");
				detailRev += 1;
			};
			const r = await plugin.refreshMediaNote(file, { onComplete: bump });
			if (r.deferred) return;
			if (!r.ok) new Notice(r.error ?? "Could not refresh.");
			else bump();
		} finally {
			movieRefreshBusy = false;
		}
	}
</script>

<div
	class="repose-media-detail"
	data-repose-tint={mediaHasTint ? "1" : undefined}
	style={mediaSurfaceStyle}
>
	{#if item && file}
		<div class="repose-media-detail__home-wrap">
			{#if hostForEpisode}
				<button
					type="button"
					bind:this={backBtnEl}
					class="repose-banner-btn repose-banner-btn--icon-only repose-media-detail__home-btn"
					aria-label="Back to series"
					title="Back to series"
					on:click={() => onSelectPath(hostForEpisode.path)}
				></button>
			{/if}
			{#if item.mediaType !== "podcast" && item.mediaType !== "book"}
				<button
					type="button"
					bind:this={homeBtnEl}
					class="repose-banner-btn repose-banner-btn--icon-only repose-media-detail__home-btn"
					aria-label="Repose home"
					title="Home"
					on:click={() => onGoHome()}
				></button>
			{/if}
		</div>
	{/if}
	{#if !item || !file}
		<p class="repose-muted">Pick an item from the list.</p>
	{:else if item.mediaType === "show" || item.mediaType === "podcast" || item.mediaType === "book"}
		<ShowDetail
			{plugin}
			showFile={file}
			{onSelectPath}
			onPalette={onMediaPalette}
			onGoHome={item.mediaType === "podcast" || item.mediaType === "book" ? onGoHome : undefined}
			suppressReposeBookMirror={bookChromeEmbedded}
		/>
	{:else if item.mediaType === "game"}
		<ShowDetail {plugin} showFile={file} serialKind="game" {onSelectPath} onPalette={onMediaPalette} />
	{:else if item.mediaType === "episode"}
		<EpisodeDetail
			{plugin}
			episodeFile={file}
			hostFile={hostForEpisode}
			{onSelectPath}
			onPalette={onMediaPalette}
			suppressDetail={episodeCompanionSuppress}
		/>
	{:else if item.mediaType === "movie"}
		<div class="repose-show-detail">
			<MediaHero
				backdropSrc={movieBackdropSrc}
				posterSrc={moviePosterSrc}
				title={item.title}
				releaseLabel={movieReleaseLabel}
				description={movieDescription}
				genres={movieGenres}
				refreshBusy={movieRefreshBusy}
				watchIcon={movieWatchIcon}
				watchedAria={item.watchedDate ? "Mark unwatched" : "Mark watched"}
				refreshTitle="Refresh metadata and images (Trakt / TMDB)"
				onPalette={onMediaPalette}
				onOpenNote={openNote}
				onToggleWatched={() => void toggleWatched()}
				onRefresh={() => void refreshMovieData()}
				detailMetaRows={movieDetailMetaRows}
			/>
			<p class="repose-muted repose-show-detail__movie-footnote">
				Type: Movie{item.status ? ` · ${item.status}` : ""}
			</p>
		</div>
	{:else}
		<header class="repose-media-detail__header">
			<h2 class="repose-media-detail__title">{item.title}</h2>
			<div class="repose-media-detail__actions">
				<button type="button" on:click={openNote}>Open note</button>
				<button type="button" on:click={() => void toggleWatched()}>
					{item.watchedDate ? "Mark unwatched" : "Mark watched"}
				</button>
			</div>
		</header>
		<p class="repose-muted">Type: {item.mediaType}{item.status ? ` · ${item.status}` : ""}</p>
	{/if}
</div>

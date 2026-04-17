<script lang="ts">
	import { Notice, type TFile } from "obsidian";
	import type { MediaHeroPalette } from "../media/bannerSample";
	import type ReposePlugin from "../main";
	import { resolveBannerOrCoverFile, resolveListThumbnailFile } from "../media/banner";
	import {
		descriptionFromFrontmatter,
		genresFromFrontmatter,
		readMediaItem,
		releaseLabelFromFrontmatter,
	} from "../media/mediaModel";
	import MediaHero from "./MediaHero.svelte";
	import ShowDetail from "./ShowDetail.svelte";

	export let plugin: ReposePlugin;
	export let selectedPath: string | null;

	let detailRev = 0;
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
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	function posterSrcForFile(f: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const img = resolveListThumbnailFile(plugin.app, fm, f.path);
		return img ? plugin.app.vault.getResourcePath(img) : null;
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

	$: if (!selectedPath || !file || !item) {
		mediaSurfaceStyle = "";
		mediaHasTint = false;
	}

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
	{#if !item || !file}
		<p class="repose-muted">Pick an item from the list.</p>
	{:else if item.mediaType === "show" || item.mediaType === "podcast"}
		<ShowDetail {plugin} showFile={file} onPalette={onMediaPalette} />
	{:else if item.mediaType === "game"}
		<ShowDetail {plugin} showFile={file} serialKind="game" onPalette={onMediaPalette} />
	{:else if item.mediaType === "movie"}
		<div class="repose-show-detail">
			<MediaHero
				backdropSrc={movieBackdropSrc}
				posterSrc={moviePosterSrc}
				title={item.title}
				releaseLabel={movieReleaseLabel}
				description={movieDescription}
				genres={movieGenres}
				busy={movieRefreshBusy}
				watchIcon={movieWatchIcon}
				watchedAria={item.watchedDate ? "Mark unwatched" : "Mark watched"}
				refreshTitle="Refresh metadata and images (Trakt / TMDB)"
				onPalette={onMediaPalette}
				onOpenNote={openNote}
				onToggleWatched={() => void toggleWatched()}
				onRefresh={() => void refreshMovieData()}
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

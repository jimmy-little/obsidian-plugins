<script lang="ts">
	import { Notice, setIcon, TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import type { MediaHeroPalette } from "../media/bannerSample";
	import { resolveBannerOrCoverFile, resolveListThumbnailFile } from "../media/banner";
	import { resolveMediaTypeForFile } from "../media/mediaDetect";
	import {
		descriptionFromFrontmatter,
		episodeHeroLabelFromFrontmatter,
		genresFromFrontmatter,
		readMediaItem,
		readingDatesCommaDetail,
		watchedPlayDatesCommaDetail,
	} from "../media/mediaModel";
	import MediaHero from "./MediaHero.svelte";
	import { orderedEpisodePaths } from "../media/showEpisodes";

	export let plugin: ReposePlugin;
	export let episodeFile: TFile;
	/** Bundle note (`Series/Series.md`) when this file lives in a serial folder. */
	export let hostFile: TFile | null;
	export let onSelectPath: (path: string) => void;
	export let onPalette: ((p: MediaHeroPalette | null) => void) | undefined = undefined;
	/** Hero + nav are on the markdown leaf; hide duplicate in Repose. */
	export let suppressDetail = false;

	let detailRev = 0;
	let refreshBusy = false;
	let prevNavBtn: HTMLButtonElement | null = null;
	let nextNavBtn: HTMLButtonElement | null = null;

	function hueFromPath(path: string): number {
		let h = 216;
		for (let i = 0; i < path.length; i++) h = (h + path.charCodeAt(i) * (i + 3)) % 360;
		return h;
	}

	function backdropSrcForEpisode(f: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const img = resolveBannerOrCoverFile(plugin.app, fm, f.path);
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	function posterSrcForHost(f: TFile | null): string | null {
		if (!f) return null;
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const bookBundle = resolveMediaTypeForFile(plugin.app, f, plugin.settings) === "book";
		const img = resolveListThumbnailFile(plugin.app, fm, f.path, { bookBundle });
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	function listThumbForFile(f: TFile, bookChapter: boolean): string | null {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const img = resolveListThumbnailFile(plugin.app, fm, f.path, {
			bookBundle: bookChapter,
		});
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	$: epCache = (detailRev, plugin.app.metadataCache.getFileCache(episodeFile));
	$: epFm = (epCache?.frontmatter ?? {}) as Record<string, unknown>;
	$: item = readMediaItem(plugin.app, episodeFile, plugin.settings);
	$: hostCache = hostFile
		? (detailRev, plugin.app.metadataCache.getFileCache(hostFile))
		: null;
	$: hostFm = (hostCache?.frontmatter ?? {}) as Record<string, unknown>;

	$: hostMt = hostFile ? resolveMediaTypeForFile(plugin.app, hostFile, plugin.settings) : null;

	$: bannerSrc = backdropSrcForEpisode(episodeFile);
	/** Prefer series poster; else episode list thumbnail (book chapters share bundle `images/`). */
	$: posterSrc =
		posterSrcForHost(hostFile) ??
		listThumbForFile(episodeFile, hostMt === "book");
	$: listenUi = hostMt === "podcast";

	$: episodeDescription = descriptionFromFrontmatter(epFm);
	$: genrePills = genresFromFrontmatter(hostFm);
	$: releaseLabel = episodeHeroLabelFromFrontmatter(epFm, hostMt);
	$: watchIcon = item.watchedDate ? "eye-off" : "eye";
	$: watchedAria = listenUi
		? item.watchedDate
			? "Mark as not listened"
			: "Mark as listened"
		: item.watchedDate
			? "Mark unwatched"
			: "Mark watched";
	$: posterHue = hostFile ? hueFromPath(hostFile.path) : hueFromPath(episodeFile.path);

	$: watchedDetailLine = watchedPlayDatesCommaDetail(epFm);
	$: lastHighlightedLine =
		hostMt === "book" ? readingDatesCommaDetail(epFm, "lastHighlighted") : "";
	$: completedReadLine =
		hostMt === "book" ? readingDatesCommaDetail(epFm, "completedRead") : "";
	$: detailMetaRows = [
		...(watchedDetailLine
			? [{ label: listenUi ? "Listened" : "Watched", value: watchedDetailLine }]
			: []),
		...(lastHighlightedLine
			? [{ label: "Last highlighted", value: lastHighlightedLine }]
			: []),
		...(completedReadLine
			? [{ label: "Completed read", value: completedReadLine }]
			: []),
	];

	$: episodeOrder = hostFile
		? orderedEpisodePaths(plugin.app, hostFile, plugin.settings)
		: [];
	$: epIndex = episodeOrder.indexOf(episodeFile.path);
	$: hasPrev = epIndex > 0;
	$: hasNext = epIndex >= 0 && epIndex < episodeOrder.length - 1;

	$: if (prevNavBtn) setIcon(prevNavBtn, "chevron-left");
	$: if (nextNavBtn) setIcon(nextNavBtn, "chevron-right");

	function goPrev(): void {
		if (!hasPrev) return;
		onSelectPath(episodeOrder[epIndex - 1]!);
	}

	function goNext(): void {
		if (!hasNext) return;
		onSelectPath(episodeOrder[epIndex + 1]!);
	}

	async function openEpisodeNote(): Promise<void> {
		await plugin.app.workspace.getLeaf("tab").openFile(episodeFile);
	}

	async function toggleEpisodeWatched(): Promise<void> {
		await plugin.toggleWatchedFrontmatter(episodeFile.path);
		detailRev += 1;
	}

	async function refreshEpisodeContext(): Promise<void> {
		if (refreshBusy) return;
		refreshBusy = true;
		try {
			const bump = (): void => {
				new Notice(
					hostMt === "show"
						? "Updated this episode from Trakt."
						: "Updated metadata and images.",
				);
				detailRev += 1;
			};
			const r = await plugin.refreshMediaNote(episodeFile, { onComplete: bump });
			if (r.deferred) return;
			if (!r.ok) new Notice(r.error ?? "Could not refresh.");
			else bump();
		} finally {
			refreshBusy = false;
		}
	}
</script>

{#if suppressDetail}
	<p class="repose-muted repose-episode-detail__suppressed">
		Episode note is open in the split editor — edit and preview there.
	</p>
{:else}
<div class="repose-show-detail">
	<MediaHero
		backdropSrc={bannerSrc}
		posterSrc={posterSrc}
		title={item.title}
		releaseLabel={releaseLabel}
		description={episodeDescription}
		genres={genrePills}
		refreshBusy={refreshBusy}
		watchIcon={watchIcon}
		watchedAria={watchedAria}
		hideBannerWatch={true}
		watchPillWatched={!!item.watchedDate}
		refreshTitle={hostMt === "show"
			? "Refresh this episode (Trakt / TMDB)"
			: "Refresh metadata and images"}
		collapseBannerWithoutBackdrop={true}
		showPosterPlaceholder={!posterSrc}
		posterPlaceholderHue={posterHue}
		onPalette={onPalette}
		onOpenNote={openEpisodeNote}
		onToggleWatched={() => void toggleEpisodeWatched()}
		onRefresh={() => void refreshEpisodeContext()}
		detailMetaRows={detailMetaRows}
		listenUi={listenUi}
	/>
	{#if hostFile && episodeOrder.length > 1}
		<div class="repose-episode-nav" role="toolbar" aria-label="Episode navigation">
			<button
				type="button"
				class="repose-episode-nav__btn clickable-icon"
				bind:this={prevNavBtn}
				disabled={!hasPrev}
				aria-label="Previous episode"
				title="Previous episode"
				on:click={goPrev}
			></button>
			<button
				type="button"
				class="repose-episode-nav__btn clickable-icon"
				bind:this={nextNavBtn}
				disabled={!hasNext}
				aria-label="Next episode"
				title="Next episode"
				on:click={goNext}
			></button>
		</div>
	{/if}
	{#if hostFile}
		<p class="repose-muted repose-show-detail__episode-footnote">
			{hostMt === "book" ? "Book" : hostMt === "podcast" ? "Podcast" : "Series"}:
			{readMediaItem(plugin.app, hostFile, plugin.settings).title}
		</p>
	{/if}
</div>
{/if}

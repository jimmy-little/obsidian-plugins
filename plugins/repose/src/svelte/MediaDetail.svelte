<script lang="ts">
	import { setIcon, type TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { resolveBannerOrCoverFile, resolveLogoFile } from "../media/banner";
	import { descriptionFromFrontmatter, readMediaItem } from "../media/mediaModel";
	import ShowDetail from "./ShowDetail.svelte";

	export let plugin: ReposePlugin;
	export let selectedPath: string | null;

	let detailRev = 0;

	function reposeBannerIcon(node: HTMLElement, icon: string): { update: (next: string) => void } {
		setIcon(node, icon);
		return {
			update(next: string) {
				node.empty();
				setIcon(node, next);
			},
		};
	}

	function bannerSrcForFile(f: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const img = resolveBannerOrCoverFile(plugin.app, fm, f.path);
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	$: file = selectedPath ? (plugin.app.vault.getAbstractFileByPath(selectedPath) as TFile | null) : null;
	$: item = (detailRev, file ? readMediaItem(plugin.app, file, plugin.settings) : null);
	$: movieBannerSrc = file && item?.mediaType === "movie" ? bannerSrcForFile(file) : null;
	$: movieWatchIcon = item?.mediaType === "movie" && item.watchedDate ? "eye-off" : "eye";
	$: movieCache = (detailRev, file && item?.mediaType === "movie" ? plugin.app.metadataCache.getFileCache(file) : null);
	$: movieFm = (movieCache?.frontmatter ?? {}) as Record<string, unknown>;
	$: movieDescription =
		file && item?.mediaType === "movie" ? descriptionFromFrontmatter(movieFm) : null;
	$: movieLogoFile =
		file && item?.mediaType === "movie" ? resolveLogoFile(plugin.app, movieFm, file.path) : null;
	$: movieLogoSrc = movieLogoFile ? plugin.app.vault.getResourcePath(movieLogoFile) : null;

	async function openNote(): Promise<void> {
		if (!file) return;
		await plugin.app.workspace.getLeaf("tab").openFile(file);
	}

	async function toggleWatched(): Promise<void> {
		if (!selectedPath) return;
		await plugin.toggleWatchedFrontmatter(selectedPath);
		detailRev += 1;
	}
</script>

<div class="repose-media-detail">
	{#if !item || !file}
		<p class="repose-muted">Pick an item from the list.</p>
	{:else if item.mediaType === "show" || item.mediaType === "podcast"}
		<ShowDetail {plugin} showFile={file} />
	{:else if item.mediaType === "movie"}
		<div class="repose-show-detail">
			<div
				class="repose-show-banner"
				class:repose-show-banner--image={!!movieBannerSrc}
				class:repose-show-banner--placeholder={!movieBannerSrc}
			>
				{#if movieBannerSrc}
					<img class="repose-show-banner__img" src={movieBannerSrc} alt="" />
				{/if}
				<div class="repose-show-banner__scrim" aria-hidden="true"></div>
				<div class="repose-show-banner__inner repose-show-banner__inner--on-dark">
					<div class="repose-show-banner__bottom">
						<div class="repose-show-banner__hero-stack">
							{#if movieLogoSrc}
								<div class="repose-show-banner__logo-wrap">
									<img class="repose-show-banner__logo" src={movieLogoSrc} alt={item.title} />
								</div>
							{:else}
								<h2 class="repose-show-banner__title repose-show-banner__title--in-stack">{item.title}</h2>
							{/if}
							{#if movieDescription}
								<p class="repose-show-banner__description">{movieDescription}</p>
							{/if}
						</div>
						<div class="repose-show-banner__actions">
							<div class="repose-banner-btn-row">
								<button
									type="button"
									class="repose-banner-btn repose-banner-btn--icon-only"
									aria-label="Open note"
									title="Open note"
									on:click={openNote}
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
									aria-label={item.watchedDate ? "Mark unwatched" : "Mark watched"}
									title={item.watchedDate ? "Mark unwatched" : "Mark watched"}
									on:click={() => void toggleWatched()}
								>
									<span
										class="repose-banner-btn__icon"
										use:reposeBannerIcon={movieWatchIcon}
										aria-hidden="true"
									></span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<p class="repose-muted">Type: Movie{item.status ? ` · ${item.status}` : ""}</p>
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

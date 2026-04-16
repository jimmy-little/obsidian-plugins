<script lang="ts">
	import { onMount } from "svelte";
	import type { TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { resolveListThumbnailFile } from "../media/banner";
	import { collectMediaMarkdownFiles } from "../media/collectMediaFiles";
	import { readMediaItem, type MediaItem, type ReposeMediaType } from "../media/mediaModel";
	import { countShowSeasonsAndEpisodes } from "../media/showEpisodes";

	export let plugin: ReposePlugin;
	export let selectedPath: string | null;
	export let onSelectPath: (path: string) => void;

	let searchQuery = "";
	let filterType: ReposeMediaType | "all" = "all";
	let listRev = 0;

	type ListRow = {
		file: TFile;
		item: MediaItem;
		thumbUrl: string | null;
		/** Right column: season/episode counts (shows) or short type label. */
		headRight: string;
		/** Subline: status / watched, etc. */
		desc: string;
	};

	function shortMediaTypeLabel(mt: ReposeMediaType): string {
		if (mt === "show") return "TV";
		if (mt === "movie") return "Movie";
		if (mt === "book") return "Book";
		if (mt === "game") return "Game";
		if (mt === "podcast") return "Podcast";
		return "Media";
	}

	function formatShowCounts(c: { seasonCount: number; episodeCount: number }): string {
		if (c.episodeCount === 0) return "No episodes in folder";
		const s =
			c.seasonCount === 0
				? "—"
				: c.seasonCount === 1
					? "1 season"
					: `${c.seasonCount} seasons`;
		const e = c.episodeCount === 1 ? "1 episode" : `${c.episodeCount} episodes`;
		return `${s} · ${e}`;
	}

	function metaLine(it: MediaItem): string {
		const bits: string[] = [];
		if (it.status) bits.push(it.status);
		if (it.watchedDate) bits.push(`watched ${it.watchedDate}`);
		return bits.join(" · ");
	}

	function thumbUrlForFile(file: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const img = resolveListThumbnailFile(plugin.app, fm, file.path);
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	function labelForType(mt: string): string {
		if (mt === "show") return "Shows";
		if (mt === "movie") return "Movies";
		if (mt === "book") return "Books";
		if (mt === "game") return "Games";
		if (mt === "podcast") return "Podcasts";
		return "All";
	}

	$: files = (listRev, collectMediaMarkdownFiles(plugin.app, plugin.settings));
	$: sortedFiles = [...files].sort((a, b) =>
		readMediaItem(plugin.app, a).title.localeCompare(readMediaItem(plugin.app, b).title, undefined, {
			sensitivity: "base",
		}),
	);

	$: rows = ((): ListRow[] => {
		const app = plugin.app;
		const q = searchQuery.trim().toLowerCase();
		const out: ListRow[] = [];
		for (const file of sortedFiles) {
			const item = readMediaItem(app, file);
			if (filterType !== "all" && item.mediaType !== filterType) continue;
			if (!q) {
				/* keep */
			} else if (!`${item.title} ${item.mediaType}`.toLowerCase().includes(q)) {
				continue;
			}

			let headRight: string;
			if (item.mediaType === "show") {
				headRight = formatShowCounts(countShowSeasonsAndEpisodes(app, file));
			} else {
				headRight = shortMediaTypeLabel(item.mediaType);
			}
			const desc = metaLine(item);
			out.push({
				file,
				item,
				thumbUrl: thumbUrlForFile(file),
				headRight,
				desc,
			});
		}
		return out;
	})();

	function bump(): void {
		listRev++;
	}

	onMount(() => {
		plugin.registerEvent(plugin.app.metadataCache.on("changed", bump));
		plugin.registerEvent(plugin.app.vault.on("create", bump));
		plugin.registerEvent(plugin.app.vault.on("delete", bump));
		plugin.registerEvent(plugin.app.vault.on("rename", bump));
	});

	function activateRow(path: string): void {
		onSelectPath(path);
	}

	function onRowKeydown(path: string, ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		activateRow(path);
	}
</script>

<div class="repose-media-panel">
	<div class="repose-media-panel__search">
		<input
			class="search-input"
			type="search"
			placeholder="Search media"
			aria-label="Search media"
			bind:value={searchQuery}
		/>
	</div>
	<div class="repose-media-panel__filters">
		<select bind:value={filterType} aria-label="Filter by media type">
			<option value="all">{labelForType("all")}</option>
			<option value="show">{labelForType("show")}</option>
			<option value="movie">{labelForType("movie")}</option>
			<option value="book">{labelForType("book")}</option>
			<option value="game">{labelForType("game")}</option>
			<option value="podcast">{labelForType("podcast")}</option>
		</select>
	</div>

	{#if rows.length === 0}
		<p class="repose-muted repose-media-panel__empty">
			{files.length === 0 ? "No media notes found." : "No matches."}
		</p>
	{:else}
		<ul class="repose-sidebar-media-list">
			{#each rows as row (row.item.path)}
				<li>
					<div
						role="button"
						tabindex="0"
						class="repose-ml-row"
						class:repose-ml-row--active={selectedPath === row.item.path}
						aria-label={row.item.title}
						on:click={() => activateRow(row.item.path)}
						on:keydown={(e) => onRowKeydown(row.item.path, e)}
					>
						<div class="repose-ml-row__thumb-wrap">
							{#if row.thumbUrl}
								<img class="repose-ml-row__thumb" src={row.thumbUrl} alt="" />
							{:else}
								<div class="repose-ml-row__thumb repose-ml-row__thumb--placeholder" aria-hidden="true"></div>
							{/if}
						</div>
						<div class="repose-ml-row__inner">
							<div class="repose-ml-row__head">
								<span class="repose-ml-row__name">{row.item.title}</span>
								<span class="repose-ml-row__area">{row.headRight}</span>
							</div>
							{#if row.desc}
								<p class="repose-ml-row__desc">{row.desc}</p>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

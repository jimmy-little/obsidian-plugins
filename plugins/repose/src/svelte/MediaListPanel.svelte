<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { setIcon, TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { resolveListThumbnailFile } from "../media/banner";
	import { collectMediaMarkdownFiles } from "../media/collectMediaFiles";
	import { resolveMediaTypeForFile } from "../media/mediaDetect";
	import { readMediaItem, type MediaItem, type ReposeMediaType } from "../media/mediaModel";
	import { pathUnderMediaRoot, reposeMobile } from "../platform";
	import {
		countShowSeasonsAndEpisodes,
		formatSeasonEpisodeCode,
		groupShowEpisodesBySeason,
		personalSerialWatchBadgeLabel,
		showEpisodeWatchProgress,
		type ShowSeasonGroup,
	} from "../media/showEpisodes";
	import {
		REPOSE_CALENDAR_EPISODE_MIME,
		episodeDragPayload,
	} from "../calendar/calendarEpisodeDrag";

	export let plugin: ReposePlugin;
	export let selectedPath: string | null;
	export let onSelectPath: (path: string) => void;

	let searchQuery = "";
	let filterType: ReposeMediaType | "all" = "show";
	let listRev = 0;
	let listReady = !reposeMobile();
	let bumpTimer: number | undefined;
	const mobileList = reposeMobile();

	/** Expanded TV show rows (show note path). */
	let expandedShows: Record<string, true> = {};
	/** Expanded season rows (`showPath::seasonNum`). */
	let expandedSeasons: Record<string, true> = {};
	let draggedEpisodePath: string | null = null;

	const FILTER_OPTIONS: { type: ReposeMediaType; icon: string; label: string }[] = [
		{ type: "show", icon: "tv", label: "TV shows" },
		{ type: "movie", icon: "clapperboard", label: "Movies" },
		{ type: "podcast", icon: "podcast", label: "Podcasts" },
		{ type: "book", icon: "book-open", label: "Books" },
		{ type: "game", icon: "gamepad-2", label: "Games" },
	];

	function onFilterClick(t: ReposeMediaType): void {
		filterType = filterType === t ? "all" : t;
	}

	function filterTypeIcon(node: HTMLElement, icon: string): { update: (next: string) => void } {
		setIcon(node, icon);
		return {
			update(next: string) {
				node.empty();
				setIcon(node, next);
			},
		};
	}

	type ListRow = {
		file: TFile;
		item: MediaItem;
		thumbUrl: string | null;
		/** Short type label when serial count lines are not shown. */
		headRight: string | null;
		/** TV / podcast: season and episode counts on separate lines (no · divider). */
		seasonCountLine: string | null;
		episodeCountLine: string | null;
		/** TV / podcast: vault watched vs total episodes for bottom bar; null if no episodes. */
		serialProgress: { watched: number; total: number } | null;
		/** TV shows only: NOT STARTED / WATCHING / CAUGHT UP from vault episode notes. */
		serialPersonalBadge: string | null;
	};

	function shortMediaTypeLabel(mt: ReposeMediaType): string {
		if (mt === "show") return "TV";
		if (mt === "movie") return "Movie";
		if (mt === "book") return "Book";
		if (mt === "game") return "Game";
		if (mt === "podcast") return "Podcast";
		return "Media";
	}

	function formatShowCountLines(c: {
		seasonCount: number;
		episodeCount: number;
	}): { season: string; episode: string | null } {
		if (c.episodeCount === 0) return { season: "No episodes in folder", episode: null };
		const season =
			c.seasonCount === 0
				? "—"
				: c.seasonCount === 1
					? "1 season"
					: `${c.seasonCount} seasons`;
		const episode = c.episodeCount === 1 ? "1 episode" : `${c.episodeCount} episodes`;
		return { season, episode };
	}

	function thumbUrlForFile(file: TFile): string | null {
		const cache = plugin.app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const mt = resolveMediaTypeForFile(plugin.app, file, plugin.settings);
		const img = resolveListThumbnailFile(plugin.app, fm, file.path, {
			bookBundle: mt === "book",
		});
		return img ? plugin.app.vault.getResourcePath(img) : null;
	}

	function episodeThumbUrl(epPath: string, showPath: string): string | null {
		const app = plugin.app;
		const epFile = app.vault.getAbstractFileByPath(epPath);
		const showFile = app.vault.getAbstractFileByPath(showPath);
		if (!(epFile instanceof TFile) || !(showFile instanceof TFile)) return null;
		const efm = (app.metadataCache.getFileCache(epFile)?.frontmatter ?? {}) as Record<string, unknown>;
		const local = resolveListThumbnailFile(app, efm, epFile.path, { bookBundle: false });
		if (local) return app.vault.getResourcePath(local);
		return thumbUrlForFile(showFile);
	}

	function seasonKey(showPath: string, season: number): string {
		return `${showPath}::${season}`;
	}

	function showSeasonGroups(showPath: string): ShowSeasonGroup[] {
		void listRev;
		const f = plugin.app.vault.getAbstractFileByPath(showPath);
		if (!(f instanceof TFile)) return [];
		return groupShowEpisodesBySeason(plugin.app, f, plugin.settings);
	}

	function toggleShowTree(showPath: string, ev: MouseEvent): void {
		ev.stopPropagation();
		ev.preventDefault();
		if (expandedShows[showPath]) {
			const next = { ...expandedShows };
			delete next[showPath];
			expandedShows = next;
		} else {
			expandedShows = { ...expandedShows, [showPath]: true };
		}
	}

	function toggleSeasonTree(key: string, ev: MouseEvent): void {
		ev.stopPropagation();
		ev.preventDefault();
		if (expandedSeasons[key]) {
			const next = { ...expandedSeasons };
			delete next[key];
			expandedSeasons = next;
		} else {
			expandedSeasons = { ...expandedSeasons, [key]: true };
		}
	}

	function onEpisodeDragStart(epPath: string, ev: DragEvent): void {
		if (!ev.dataTransfer) return;
		ev.stopPropagation();
		ev.dataTransfer.setData(REPOSE_CALENDAR_EPISODE_MIME, episodeDragPayload(epPath));
		ev.dataTransfer.effectAllowed = "copy";
		draggedEpisodePath = epPath;
	}

	function onEpisodeDragEnd(): void {
		draggedEpisodePath = null;
	}

	$: files = listReady ? (listRev, collectMediaMarkdownFiles(plugin.app, plugin.settings)) : [];
	$: sortedFiles = [...files].sort((a, b) =>
		readMediaItem(plugin.app, a, plugin.settings).title.localeCompare(
			readMediaItem(plugin.app, b, plugin.settings).title,
			undefined,
			{ sensitivity: "base" },
		),
	);

	$: rows = ((): ListRow[] => {
		const app = plugin.app;
		const q = searchQuery.trim().toLowerCase();
		const out: ListRow[] = [];
		for (const file of sortedFiles) {
			const item = readMediaItem(app, file, plugin.settings);
			if (filterType !== "all" && item.mediaType !== filterType) continue;
			if (!q) {
				/* keep */
			} else if (!`${item.title} ${item.mediaType}`.toLowerCase().includes(q)) {
				continue;
			}

			let headRight: string | null = null;
			let seasonCountLine: string | null = null;
			let episodeCountLine: string | null = null;
			let serialProgress: { watched: number; total: number } | null = null;
			let serialPersonalBadge: string | null = null;
			if (item.mediaType === "show" || item.mediaType === "podcast") {
				if (!mobileList) {
					const counts = formatShowCountLines(
						countShowSeasonsAndEpisodes(app, file, plugin.settings),
					);
					seasonCountLine = counts.season;
					episodeCountLine = counts.episode;
					const ep = showEpisodeWatchProgress(app, file, plugin.settings);
					if (ep.total > 0) serialProgress = ep;
					if (item.mediaType === "show") {
						serialPersonalBadge = personalSerialWatchBadgeLabel(ep.watched, ep.total, item.status);
					}
				} else {
					headRight = shortMediaTypeLabel(item.mediaType);
				}
			} else {
				headRight = shortMediaTypeLabel(item.mediaType);
			}
			out.push({
				file,
				item,
				thumbUrl: thumbUrlForFile(file),
				headRight,
				seasonCountLine,
				episodeCountLine,
				serialProgress,
				serialPersonalBadge,
			});
		}
		return out;
	})();

	function scheduleBump(): void {
		window.clearTimeout(bumpTimer);
		bumpTimer = window.setTimeout(() => {
			bumpTimer = undefined;
			listRev++;
		}, mobileList ? 600 : 120);
	}

	function onVaultMetadataChanged(f: TFile): void {
		if (!pathUnderMediaRoot(f.path, plugin.settings.mediaRoot)) return;
		scheduleBump();
	}

	function onVaultFileChanged(f: TFile): void {
		if (!pathUnderMediaRoot(f.path, plugin.settings.mediaRoot)) return;
		scheduleBump();
	}

	const vaultEvents: Array<() => void> = [];

	onMount(() => {
		if (mobileList) {
			window.setTimeout(() => {
				listReady = true;
				listRev++;
			}, 0);
		}
		vaultEvents.push(plugin.app.metadataCache.on("changed", onVaultMetadataChanged));
		vaultEvents.push(plugin.app.vault.on("create", onVaultFileChanged));
		vaultEvents.push(plugin.app.vault.on("delete", onVaultFileChanged));
		vaultEvents.push(
			plugin.app.vault.on("rename", (f) => {
				if (f instanceof TFile) onVaultFileChanged(f);
			}),
		);
	});

	onDestroy(() => {
		window.clearTimeout(bumpTimer);
		for (const off of vaultEvents) off();
		vaultEvents.length = 0;
	});

	function activateRow(path: string): void {
		onSelectPath(path);
	}

	function onRowKeydown(path: string, ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		activateRow(path);
	}

	function onEpisodeKeydown(path: string, ev: KeyboardEvent): void {
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
	<div class="repose-media-panel__filters" role="toolbar" aria-label="Filter by media type">
		{#each FILTER_OPTIONS as opt (opt.type)}
			<button
				type="button"
				class="repose-media-panel__filter-btn clickable-icon"
				class:repose-media-panel__filter-btn--active={filterType === opt.type}
				aria-label={opt.label}
				title={opt.label}
				aria-pressed={filterType === opt.type}
				on:click={() => onFilterClick(opt.type)}
			>
				<span class="repose-media-panel__filter-icon" use:filterTypeIcon={opt.icon} aria-hidden="true"></span>
			</button>
		{/each}
	</div>

	{#if rows.length === 0}
		<p class="repose-muted repose-media-panel__empty">
			{files.length === 0 ? "No media notes found." : "No matches."}
		</p>
	{/if}
	{#if rows.length > 0}
		<ul class="repose-sidebar-media-list">
			{#each rows as row (row.item.path)}
				{@const sp = row.serialProgress}
				{@const isShow = row.item.mediaType === "show"}
				{@const showTreeOpen = isShow && !!expandedShows[row.item.path]}
				{@const progressPct =
					sp && sp.total > 0 ? Math.round((100 * sp.watched) / sp.total) : 0}
				<li class="repose-ml-show-block">
					<div
						class="repose-ml-row"
						class:repose-ml-row--serial={!!sp}
						class:repose-ml-row--count-stack={!!row.seasonCountLine}
						class:repose-ml-row--with-tree={isShow && !!sp}
						class:repose-ml-row--active={selectedPath === row.item.path}
					>
						<div
							class="repose-ml-row__hit"
							role="button"
							tabindex="0"
							aria-label={sp
								? `${row.item.title}, ${row.seasonCountLine ?? ""}${row.episodeCountLine ? `, ${row.episodeCountLine}` : ""}, ${sp.watched} of ${sp.total} episodes watched in vault${row.serialPersonalBadge ? `, ${row.serialPersonalBadge}` : ""}`
								: row.serialPersonalBadge
									? `${row.item.title}, ${row.seasonCountLine ?? row.headRight ?? ""}${row.episodeCountLine ? `, ${row.episodeCountLine}` : ""}, ${row.serialPersonalBadge}`
									: row.seasonCountLine
										? `${row.item.title}, ${row.seasonCountLine}${row.episodeCountLine ? `, ${row.episodeCountLine}` : ""}`
										: row.item.title}
							on:click={() => activateRow(row.item.path)}
							on:keydown={(e) => onRowKeydown(row.item.path, e)}
						>
							<div class="repose-ml-row__thumb-wrap">
								{#if row.thumbUrl}
									<img class="repose-ml-row__thumb" src={row.thumbUrl} alt="" />
								{/if}
								{#if !row.thumbUrl}
									<div class="repose-ml-row__thumb repose-ml-row__thumb--placeholder" aria-hidden="true"></div>
								{/if}
							</div>
							<div class="repose-ml-row__inner">
								<div class="repose-ml-row__head">
									<span class="repose-ml-row__name">{row.item.title}</span>
									<div class="repose-ml-row__meta-col">
										{#if row.seasonCountLine}
											<span class="repose-ml-row__area">{row.seasonCountLine}</span>
											{#if row.episodeCountLine}
												<span class="repose-ml-row__area repose-ml-row__area--sub">{row.episodeCountLine}</span>
											{/if}
										{/if}
										{#if !row.seasonCountLine}
											{#if row.headRight}
												<span class="repose-ml-row__area">{row.headRight}</span>
											{/if}
										{/if}
										{#if row.serialPersonalBadge}
											<span class="repose-badge repose-badge--serial-personal">{row.serialPersonalBadge}</span>
										{/if}
									</div>
								</div>
							</div>
						</div>
						{#if isShow && sp}
							<button
								type="button"
								class="repose-ml-row__tree-toggle clickable-icon"
								class:repose-ml-row__tree-toggle--open={showTreeOpen}
								aria-label={showTreeOpen ? "Collapse seasons" : "Expand seasons"}
								aria-expanded={showTreeOpen}
								title={showTreeOpen ? "Collapse seasons" : "Expand seasons"}
								on:click={(e) => toggleShowTree(row.item.path, e)}
								on:mousedown|stopPropagation
							>
								<span class="repose-ml-row__tree-toggle-icon" use:filterTypeIcon={"list-chevrons-up-down"} aria-hidden="true"></span>
							</button>
						{/if}
						{#if sp}
							<div class="repose-ml-row__progress-edge" aria-hidden="true">
								<div class="repose-ml-row__progress-fill" style:width="{progressPct}%"></div>
							</div>
						{/if}
					</div>
					{#if showTreeOpen}
						<ul class="repose-ml-show-tree" aria-label="Seasons for {row.item.title}">
							{#each showSeasonGroups(row.item.path) as season (seasonKey(row.item.path, season.season))}
								{@const sKey = seasonKey(row.item.path, season.season)}
								{@const seasonOpen = !!expandedSeasons[sKey]}
								<li class="repose-ml-season-block">
									<button
										type="button"
										class="repose-ml-season-row"
										aria-expanded={seasonOpen}
										on:click={(e) => toggleSeasonTree(sKey, e)}
									>
										<span
											class="repose-ml-season-row__chev"
											use:filterTypeIcon={seasonOpen ? "chevron-down" : "chevron-right"}
											aria-hidden="true"
										></span>
										<span class="repose-ml-season-row__label">{season.label}</span>
										<span class="repose-ml-season-row__count">{season.episodes.length}</span>
									</button>
									{#if seasonOpen}
										<ul class="repose-ml-ep-list">
											{#each season.episodes as ep (ep.path)}
												{@const epCode = formatSeasonEpisodeCode(ep.season, ep.episode)}
												{@const epThumb = episodeThumbUrl(ep.path, row.item.path)}
												<li>
													<div
														class="repose-ml-ep-row"
														class:repose-ml-ep-row--active={selectedPath === ep.path}
														class:repose-ml-ep-row--dragging={draggedEpisodePath === ep.path}
														role="button"
														tabindex="0"
														draggable="true"
														aria-label="{ep.title}{epCode ? `, ${epCode}` : ''}"
														on:click={() => activateRow(ep.path)}
														on:keydown={(e) => onEpisodeKeydown(ep.path, e)}
														on:dragstart={(e) => onEpisodeDragStart(ep.path, e)}
														on:dragend={onEpisodeDragEnd}
													>
														{#if epThumb}
															<img class="repose-ml-ep-row__thumb" src={epThumb} alt="" />
														{/if}
														{#if !epThumb}
															<span class="repose-ml-ep-row__thumb repose-ml-ep-row__thumb--ph" aria-hidden="true"></span>
														{/if}
														{#if epCode}
															<span class="repose-ml-ep-row__code">{epCode}</span>
														{/if}
														<span class="repose-ml-ep-row__title">{ep.title}</span>
													</div>
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
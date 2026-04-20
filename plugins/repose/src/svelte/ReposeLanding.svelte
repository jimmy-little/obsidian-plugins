<script lang="ts">
	import { onMount } from "svelte";
	import { setIcon, type App, type TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import {
		resolveBannerOrCoverFile,
		resolveExternalImageUrl,
		resolveListThumbnailFile,
	} from "../media/banner";
	import { resolveMediaTypeForFile } from "../media/mediaDetect";
	import { collectMediaMarkdownFiles } from "../media/collectMediaFiles";
	import {
		displayYearFromFrontmatter,
		episodeAirTimeMsFromFrontmatter,
		genresFromFrontmatter,
		readMediaItem,
		releaseLabelFromFrontmatter,
		releaseTimeFromFrontmatter,
		type MediaItem,
		type ReposeMediaType,
		watchedTimeFromFrontmatter,
	} from "../media/mediaModel";
	import {
		collectEpisodeNoteFiles,
		findFirstUnwatchedEpisodeNote,
		readEpisodeRow,
	} from "../media/showEpisodes";

	export let plugin: ReposePlugin;
	export let onSelectPath: (path: string) => void;

	let listRev = 0;

	type Enriched = {
		file: TFile;
		item: MediaItem;
		thumbUrl: string | null;
		heroUrl: string | null;
		releaseMs: number | null;
		watchedMs: number | null;
	};

	type EpisodeDashCard = {
		epPath: string;
		showPath: string;
		showTitle: string;
		epTitle: string;
		sub: string;
		thumbUrl: string | null;
		airMs: number | null;
	};

	const TYPE_ROWS: { type: ReposeMediaType; icon: string; label: string; blurb: string }[] = [
		{ type: "show", icon: "tv", label: "Shows", blurb: "Series & seasons" },
		{ type: "movie", icon: "clapperboard", label: "Movies", blurb: "Films & features" },
		{ type: "game", icon: "gamepad-2", label: "Games", blurb: "Play next" },
		{ type: "podcast", icon: "podcast", label: "Podcasts", blurb: "Feeds & listens" },
		{ type: "book", icon: "book-open", label: "Books", blurb: "Reading list" },
	];

	const UPCOMING_EP_HORIZON_MS = 1000 * 60 * 60 * 24 * 120;

	function iconAction(node: HTMLElement, icon: string): { update: (next: string) => void } {
		setIcon(node, icon);
		return {
			update(next: string) {
				node.empty();
				setIcon(node, next);
			},
		};
	}

	function hueFromPath(path: string): number {
		let h = 216;
		for (let i = 0; i < path.length; i++) h = (h + path.charCodeAt(i) * (i + 3)) % 360;
		return h;
	}

	function enrich(file: TFile): Enriched {
		const app = plugin.app;
		const cache = app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const item = readMediaItem(app, file, plugin.settings);
		const mt = resolveMediaTypeForFile(app, file, plugin.settings);
		const poster = resolveListThumbnailFile(app, fm, file.path, {
			bookBundle: mt === "book",
		});
		const banner = resolveBannerOrCoverFile(app, fm, file.path);
		const thumbUrl = poster
			? app.vault.getResourcePath(poster)
			: resolveExternalImageUrl(fm);
		const wide = banner ?? poster;
		const heroUrl = wide
			? app.vault.getResourcePath(wide)
			: resolveExternalImageUrl(fm, ["banner", "cover", "image", "poster"]);
		return {
			file,
			item,
			thumbUrl,
			heroUrl,
			releaseMs: releaseTimeFromFrontmatter(fm),
			watchedMs: watchedTimeFromFrontmatter(fm),
		};
	}

	function thumbForEpisode(app: App, epFile: TFile, showFile: TFile): string | null {
		const hostMt = resolveMediaTypeForFile(app, showFile, plugin.settings);
		const bookBundle = hostMt === "book";
		const efm = (app.metadataCache.getFileCache(epFile)?.frontmatter ?? {}) as Record<string, unknown>;
		const local =
			resolveListThumbnailFile(app, efm, epFile.path, { bookBundle }) ??
			resolveBannerOrCoverFile(app, efm, epFile.path);
		if (local) return app.vault.getResourcePath(local);
		const extEp = resolveExternalImageUrl(efm);
		if (extEp) return extEp;
		const sfm = (app.metadataCache.getFileCache(showFile)?.frontmatter ?? {}) as Record<string, unknown>;
		const p = resolveListThumbnailFile(app, sfm, showFile.path, { bookBundle });
		if (p) return app.vault.getResourcePath(p);
		return resolveExternalImageUrl(sfm);
	}

	$: files = (listRev, collectMediaMarkdownFiles(plugin.app, plugin.settings));
	$: all = files.map(enrich);

	$: currentItems = all
		.filter((e) => e.item.status === "watching" || e.item.status === "reading")
		.sort((a, b) => a.item.title.localeCompare(b.item.title, undefined, { sensitivity: "base" }));

	$: watchingSerials = all.filter(
		(e) =>
			(e.item.mediaType === "show" || e.item.mediaType === "podcast") &&
			e.item.status === "watching",
	);

	$: upcomingEpisodes = ((): EpisodeDashCard[] => {
		const now = Date.now();
		const end = now + UPCOMING_EP_HORIZON_MS;
		const app = plugin.app;
		const out: EpisodeDashCard[] = [];
		for (const show of watchingSerials) {
			const eps = collectEpisodeNoteFiles(app, show.file, plugin.settings);
			for (const epFile of eps) {
				const fm = (app.metadataCache.getFileCache(epFile)?.frontmatter ?? {}) as Record<
					string,
					unknown
				>;
				const airMs = episodeAirTimeMsFromFrontmatter(fm);
				if (airMs == null || airMs <= now || airMs > end) continue;
				const row = readEpisodeRow(app, epFile);
				const sub =
					row.season != null && row.episode != null ? `S${row.season}E${row.episode}` : "";
				out.push({
					epPath: epFile.path,
					showPath: show.item.path,
					showTitle: show.item.title,
					epTitle: row.title,
					sub,
					thumbUrl: thumbForEpisode(app, epFile, show.file),
					airMs,
				});
			}
		}
		out.sort((a, b) => (a.airMs ?? 0) - (b.airMs ?? 0));
		return out.slice(0, 36);
	})();

	$: continueEpisodes = ((): EpisodeDashCard[] => {
		const app = plugin.app;
		const out: EpisodeDashCard[] = [];
		for (const show of watchingSerials) {
			const epFile = findFirstUnwatchedEpisodeNote(app, show.file, plugin.settings);
			if (!epFile) continue;
			const row = readEpisodeRow(app, epFile);
			const fm = (app.metadataCache.getFileCache(epFile)?.frontmatter ?? {}) as Record<
				string,
				unknown
			>;
			const airMs = episodeAirTimeMsFromFrontmatter(fm);
			const sub =
				row.season != null && row.episode != null ? `S${row.season}E${row.episode}` : "";
			out.push({
				epPath: epFile.path,
				showPath: show.item.path,
				showTitle: show.item.title,
				epTitle: row.title,
				sub,
				thumbUrl: thumbForEpisode(app, epFile, show.file),
				airMs,
			});
		}
		out.sort((a, b) =>
			a.showTitle.localeCompare(b.showTitle, undefined, { sensitivity: "base" }),
		);
		return out;
	})();

	function rowForType(t: ReposeMediaType): Enriched[] {
		return all
			.filter((e) => e.item.mediaType === t)
			.sort((a, b) => a.item.title.localeCompare(b.item.title, undefined, { sensitivity: "base" }))
			.slice(0, 28);
	}

	function open(e: Enriched): void {
		onSelectPath(e.item.path);
	}

	function openPath(path: string): void {
		onSelectPath(path);
	}

	function onTileKeydown(ev: KeyboardEvent, e: Enriched): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		open(e);
	}

	function onEpKeydown(ev: KeyboardEvent, path: string): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		openPath(path);
	}

	function subline(e: Enriched): string {
		const app = plugin.app;
		const cache = app.metadataCache.getFileCache(e.file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const kind = e.item.mediaType;
		if (kind === "show" || kind === "movie" || kind === "podcast" || kind === "game") {
			const rel = releaseLabelFromFrontmatter(fm, kind === "movie" || kind === "game" ? "movie" : kind);
			if (rel) return rel;
		}
		const g = genresFromFrontmatter(fm);
		if (g.length) return g.slice(0, 2).join(" · ");
		return "";
	}

	function formatAirBadge(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}

	function titleYearLine(e: Enriched): string {
		const cache = plugin.app.metadataCache.getFileCache(e.file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const y = displayYearFromFrontmatter(fm);
		return y != null ? `${e.item.title} (${y})` : e.item.title;
	}

	function currentKindLabel(e: Enriched): string {
		const t = e.item.mediaType;
		if (t === "book" && e.item.status === "reading") return "Reading";
		if (t === "show") return "Watching";
		if (t === "podcast") return "Listening";
		if (t === "movie" || t === "game") return "In progress";
		return "Current";
	}

	onMount(() => {
		plugin.registerEvent(plugin.app.metadataCache.on("changed", () => listRev++));
		plugin.registerEvent(plugin.app.vault.on("create", () => listRev++));
		plugin.registerEvent(plugin.app.vault.on("delete", () => listRev++));
		plugin.registerEvent(plugin.app.vault.on("rename", () => listRev++));
	});
</script>

<div class="repose-dash" aria-label="Repose home">
	<div class="repose-dash__aurora" aria-hidden="true"></div>
	<div class="repose-dash__noise" aria-hidden="true"></div>

	<div class="repose-dash__inner">
		{#if currentItems.length > 0}
			<section class="repose-dash__strip" aria-labelledby="repose-dash-current-title">
				<div class="repose-dash__section-head">
					<span class="repose-dash__section-icon" use:iconAction={"bookmark"} aria-hidden="true"></span>
					<div>
						<h3 id="repose-dash-current-title" class="repose-dash__section-title">Current</h3>
						<p class="repose-dash__section-sub">Watching, reading, and other active items</p>
					</div>
				</div>
				<div class="repose-dash__grid repose-dash__grid--poster">
					{#each currentItems as e (e.item.path)}
						<div
							class="repose-dash__tile"
							role="button"
							tabindex="0"
							aria-label="{titleYearLine(e)}, {currentKindLabel(e)}"
							on:click={() => open(e)}
							on:keydown={(ev) => onTileKeydown(ev, e)}
						>
							<div class="repose-dash__thumb repose-dash__thumb--poster">
								{#if e.thumbUrl}
									<img src={e.thumbUrl} alt="" />
								{:else}
									<div class="repose-dash__thumb-ph" style="--repose-hue: {hueFromPath(e.item.path)}"></div>
								{/if}
								<span class="repose-dash__badge">{currentKindLabel(e)}</span>
							</div>
							<span class="repose-dash__label">{titleYearLine(e)}</span>
							{#if subline(e)}
								<span class="repose-dash__sub">{subline(e)}</span>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if upcomingEpisodes.length > 0}
			<section class="repose-dash__strip" aria-labelledby="repose-dash-up-ep-title">
				<div class="repose-dash__section-head">
					<span class="repose-dash__section-icon" use:iconAction={"calendar-clock"} aria-hidden="true"></span>
					<div>
						<h3 id="repose-dash-up-ep-title" class="repose-dash__section-title">Upcoming</h3>
						<p class="repose-dash__section-sub">Episodes airing soon from shows you’re watching</p>
					</div>
				</div>
				<div class="repose-dash__grid repose-dash__grid--episode">
					{#each upcomingEpisodes as ep (ep.epPath)}
						<div
							class="repose-dash__tile"
							role="button"
							tabindex="0"
							aria-label="{ep.epTitle}, {ep.showTitle}{ep.sub ? `, ${ep.sub}` : ''}"
							on:click={() => openPath(ep.epPath)}
							on:keydown={(ev) => onEpKeydown(ev, ep.epPath)}
						>
							<div class="repose-dash__thumb repose-dash__thumb--ep">
								{#if ep.thumbUrl}
									<img src={ep.thumbUrl} alt="" />
								{:else}
									<div class="repose-dash__thumb-ph" style="--repose-hue: {hueFromPath(ep.epPath)}"></div>
								{/if}
								{#if ep.airMs != null}
									<span class="repose-dash__badge repose-dash__badge--tl">{formatAirBadge(ep.airMs)}</span>
								{/if}
							</div>
							<span class="repose-dash__label">{ep.epTitle}</span>
							<span class="repose-dash__sub"
								>{ep.showTitle}{#if ep.sub} · {ep.sub}{/if}</span
							>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if continueEpisodes.length > 0}
			<section class="repose-dash__strip" aria-labelledby="repose-dash-continue-title">
				<div class="repose-dash__section-head">
					<span class="repose-dash__section-icon" use:iconAction={"play-circle"} aria-hidden="true"></span>
					<div>
						<h3 id="repose-dash-continue-title" class="repose-dash__section-title">Continue watching</h3>
						<p class="repose-dash__section-sub">Next unwatched episode for each series</p>
					</div>
				</div>
				<div class="repose-dash__grid repose-dash__grid--episode">
					{#each continueEpisodes as ep (ep.epPath)}
						<div
							class="repose-dash__tile"
							role="button"
							tabindex="0"
							aria-label="Continue {ep.epTitle}, {ep.showTitle}"
							on:click={() => openPath(ep.epPath)}
							on:keydown={(ev) => onEpKeydown(ev, ep.epPath)}
						>
							<div class="repose-dash__thumb repose-dash__thumb--ep">
								{#if ep.thumbUrl}
									<img src={ep.thumbUrl} alt="" />
								{:else}
									<div class="repose-dash__thumb-ph" style="--repose-hue: {hueFromPath(ep.epPath)}"></div>
								{/if}
								{#if ep.sub}
									<span class="repose-dash__badge">{ep.sub}</span>
								{/if}
							</div>
							<span class="repose-dash__label">{ep.epTitle}</span>
							<span class="repose-dash__sub">{ep.showTitle}</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#each TYPE_ROWS as row (row.type)}
			{@const items = rowForType(row.type)}
			{@const isPodcast = row.type === "podcast"}
			{#if items.length > 0}
				<section class="repose-dash__strip" aria-labelledby="repose-dash-row-{row.type}">
					<div class="repose-dash__section-head">
						<span class="repose-dash__section-icon" use:iconAction={row.icon} aria-hidden="true"></span>
						<div>
							<h3 id="repose-dash-row-{row.type}" class="repose-dash__section-title">{row.label}</h3>
							<p class="repose-dash__section-sub">{row.blurb}</p>
						</div>
					</div>
					<div
						class="repose-dash__grid {isPodcast
							? 'repose-dash__grid--sq'
							: 'repose-dash__grid--poster'}"
					>
						{#each items as e (e.item.path)}
							<div
								class="repose-dash__tile"
								role="button"
								tabindex="0"
								aria-label={titleYearLine(e)}
								on:click={() => open(e)}
								on:keydown={(ev) => onTileKeydown(ev, e)}
							>
								<div
									class="repose-dash__thumb {isPodcast
										? 'repose-dash__thumb--sq'
										: 'repose-dash__thumb--poster'}"
								>
									{#if e.thumbUrl}
										<img src={e.thumbUrl} alt="" />
									{:else}
										<div class="repose-dash__thumb-ph" style="--repose-hue: {hueFromPath(e.item.path)}"></div>
									{/if}
								</div>
								<span class="repose-dash__label">{titleYearLine(e)}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	</div>
</div>

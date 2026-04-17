<script lang="ts">
	import { onMount } from "svelte";
	import { setIcon, type TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { resolveBannerOrCoverFile, resolveListThumbnailFile } from "../media/banner";
	import { collectMediaMarkdownFiles } from "../media/collectMediaFiles";
	import {
		descriptionFromFrontmatter,
		displayYearFromFrontmatter,
		genresFromFrontmatter,
		readMediaItem,
		releaseLabelFromFrontmatter,
		releaseTimeFromFrontmatter,
		type MediaItem,
		type ReposeMediaType,
		watchedTimeFromFrontmatter,
	} from "../media/mediaModel";

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

	const TYPE_ROWS: { type: ReposeMediaType; icon: string; label: string; blurb: string }[] = [
		{ type: "show", icon: "tv", label: "Shows", blurb: "Series & seasons" },
		{ type: "movie", icon: "clapperboard", label: "Movies", blurb: "Films & features" },
		{ type: "game", icon: "gamepad-2", label: "Games", blurb: "Play next" },
		{ type: "podcast", icon: "podcast", label: "Podcasts", blurb: "Feeds & listens" },
		{ type: "book", icon: "book-open", label: "Books", blurb: "Reading list" },
	];

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
		const poster = resolveListThumbnailFile(app, fm, file.path);
		const banner = resolveBannerOrCoverFile(app, fm, file.path);
		const thumbUrl = poster ? app.vault.getResourcePath(poster) : null;
		const wide = banner ?? poster;
		const heroUrl = wide ? app.vault.getResourcePath(wide) : null;
		return {
			file,
			item,
			thumbUrl,
			heroUrl,
			releaseMs: releaseTimeFromFrontmatter(fm),
			watchedMs: watchedTimeFromFrontmatter(fm),
		};
	}

	$: files = (listRev, collectMediaMarkdownFiles(plugin.app, plugin.settings));
	$: all = files.map(enrich);

	$: watching = all
		.filter((e) => e.item.status === "watching")
		.sort((a, b) => a.item.title.localeCompare(b.item.title, undefined, { sensitivity: "base" }));

	$: recentlyWatched = all
		.filter((e) => e.watchedMs != null)
		.sort((a, b) => (b.watchedMs ?? 0) - (a.watchedMs ?? 0))
		.slice(0, 18);

	const UPCOMING_HORIZON_MS = 1000 * 60 * 60 * 24 * 400;

	$: upcoming = (() => {
		const now = Date.now();
		return all
			.filter((e) => e.releaseMs != null && e.releaseMs > now && e.releaseMs - now < UPCOMING_HORIZON_MS)
			.sort((a, b) => (a.releaseMs ?? 0) - (b.releaseMs ?? 0))
			.slice(0, 16);
	})();

	$: featured = ((): Enriched | null => {
		const pick = (list: Enriched[]) =>
			list.find((e) => e.heroUrl) ?? list[0] ?? null;
		const w = watching.length ? pick(watching) : null;
		if (w) return w;
		if (upcoming.length) return pick(upcoming);
		if (all.length) return pick(all);
		return null;
	})();

	type CalDay = { day: number; key: string; inMonth: boolean; dots: number };

	$: calendarDays = ((): CalDay[] => {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth();
		const firstDow = new Date(y, m, 1).getDay();
		const dim = new Date(y, m + 1, 0).getDate();
		const counts = new Map<string, number>();
		for (const e of all) {
			if (e.releaseMs == null) continue;
			const d = new Date(e.releaseMs);
			if (d.getFullYear() !== y || d.getMonth() !== m) continue;
			const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		const pad = firstDow;
		const cells: CalDay[] = [];
		const prevDim = new Date(y, m, 0).getDate();
		for (let i = 0; i < pad; i++) {
			const day = prevDim - pad + i + 1;
			cells.push({ day, key: `p-${day}`, inMonth: false, dots: 0 });
		}
		for (let d = 1; d <= dim; d++) {
			const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
			cells.push({ day: d, key, inMonth: true, dots: Math.min(3, counts.get(key) ?? 0) });
		}
		const tail = (7 - (cells.length % 7)) % 7;
		for (let i = 0; i < tail; i++) {
			cells.push({ day: i + 1, key: `n-${i}`, inMonth: false, dots: 0 });
		}
		return cells;
	})();

	$: monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

	function rowForType(t: ReposeMediaType): Enriched[] {
		return all
			.filter((e) => e.item.mediaType === t)
			.sort((a, b) => a.item.title.localeCompare(b.item.title, undefined, { sensitivity: "base" }))
			.slice(0, 28);
	}

	function open(e: Enriched): void {
		onSelectPath(e.item.path);
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

	function heroTagline(e: Enriched | null): string {
		if (!e) return "";
		const app = plugin.app;
		const cache = app.metadataCache.getFileCache(e.file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const desc = descriptionFromFrontmatter(fm);
		if (desc && desc.length < 120) return desc;
		const g = genresFromFrontmatter(fm);
		if (g.length) return g.join(" · ");
		const k = e.item.mediaType;
		if (k === "show" || k === "movie" || k === "podcast" || k === "game") {
			const rel = releaseLabelFromFrontmatter(fm, k === "movie" || k === "game" ? "movie" : k);
			if (rel) return rel;
		}
		return "";
	}

	function formatShortDate(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}

	function titleYearLine(e: Enriched): string {
		const cache = plugin.app.metadataCache.getFileCache(e.file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const y = displayYearFromFrontmatter(fm);
		return y != null ? `${e.item.title} (${y})` : e.item.title;
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
		<section class="repose-dash__hero" aria-labelledby="repose-dash-hero-title">
			{#if featured}
				<button
					type="button"
					class="repose-dash__hero-stage"
					on:click={() => open(featured)}
					aria-label="Open {featured.item.title}"
				>
					<div class="repose-dash__hero-visual">
						{#if featured.heroUrl}
							<img class="repose-dash__hero-img" src={featured.heroUrl} alt="" />
						{:else}
							<div
								class="repose-dash__hero-img repose-dash__hero-img--mesh"
								style="--repose-hue: {hueFromPath(featured.item.path)}"
							></div>
						{/if}
						<div class="repose-dash__hero-scrim"></div>
						<div class="repose-dash__hero-grain"></div>
					</div>
					<div class="repose-dash__hero-copy">
						<p class="repose-dash__eyebrow">
							<span class="repose-dash__eyebrow-dot"></span>
							{featured.item.status === "watching"
								? "Now playing"
								: featured.releaseMs && featured.releaseMs > Date.now()
									? "Coming up"
									: "Spotlight"}
						</p>
						<h2 id="repose-dash-hero-title" class="repose-dash__hero-title">{featured.item.title}</h2>
						{#if heroTagline(featured)}
							<p class="repose-dash__hero-tag">{heroTagline(featured)}</p>
						{/if}
					</div>
				</button>
			{:else}
				<div class="repose-dash__hero-stage repose-dash__hero-stage--empty">
					<div class="repose-dash__hero-visual">
						<div class="repose-dash__hero-img repose-dash__hero-img--mesh repose-dash__hero-img--empty"></div>
						<div class="repose-dash__hero-scrim"></div>
					</div>
					<div class="repose-dash__hero-copy">
						<p class="repose-dash__eyebrow"><span class="repose-dash__eyebrow-dot"></span> Your vault</p>
						<h2 id="repose-dash-hero-title" class="repose-dash__hero-title">Repose</h2>
						<p class="repose-dash__hero-tag">Add media from the sidebar to fill this canvas.</p>
					</div>
				</div>
			{/if}
		</section>

		<section class="repose-dash__calendar-block" aria-labelledby="repose-dash-cal-title">
			<div class="repose-dash__section-head repose-dash__section-head--cal">
				<h3 id="repose-dash-cal-title" class="repose-dash__section-title">{monthLabel}</h3>
				<p class="repose-dash__section-sub">Release dates from your notes</p>
			</div>
			<div class="repose-dash__cal" role="grid" aria-label="Month at a glance">
				<div class="repose-dash__cal-weekdays" aria-hidden="true">
					{#each ["S", "M", "T", "W", "T", "F", "S"] as letter}
						<span class="repose-dash__cal-wd">{letter}</span>
					{/each}
				</div>
				<div class="repose-dash__cal-cells">
					{#each calendarDays as c (c.key)}
						<div
							class="repose-dash__cal-cell"
							class:repose-dash__cal-cell--muted={!c.inMonth}
							class:repose-dash__cal-cell--today={c.inMonth && c.day === new Date().getDate()}
						>
							<span class="repose-dash__cal-num">{c.day}</span>
							{#if c.dots > 0}
								<span class="repose-dash__cal-dots" aria-hidden="true">
									{#each Array(c.dots) as _, i (i)}
										<span class="repose-dash__cal-dot"></span>
									{/each}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</section>

		{#if watching.length > 0}
			<section class="repose-dash__strip" aria-labelledby="repose-dash-watch-title">
				<div class="repose-dash__section-head">
					<span class="repose-dash__section-icon" use:iconAction={"play-circle"} aria-hidden="true"></span>
					<div>
						<h3 id="repose-dash-watch-title" class="repose-dash__section-title">In progress</h3>
						<p class="repose-dash__section-sub">Watching right now</p>
					</div>
				</div>
				<div class="repose-dash__scroll-shell repose-dash__scroll-shell--poster-row">
					<div class="repose-dash__scroll repose-dash__scroll--strip">
						{#each watching as e (e.item.path)}
							<button
								type="button"
								class="repose-dash__tile repose-dash__tile--lib"
								on:click={() => open(e)}
								aria-label={titleYearLine(e)}
							>
								<div class="repose-dash__lib-art repose-dash__lib-art--poster">
									{#if e.thumbUrl}
										<img src={e.thumbUrl} alt="" class="repose-dash__lib-img" />
									{:else}
										<div class="repose-dash__lib-ph" style="--repose-hue: {hueFromPath(e.item.path)}"></div>
									{/if}
								</div>
								<span class="repose-dash__tile-cap">{titleYearLine(e)}</span>
							</button>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		{#if recentlyWatched.length > 0}
			<section class="repose-dash__strip" aria-labelledby="repose-dash-recent-title">
				<div class="repose-dash__section-head">
					<span class="repose-dash__section-icon" use:iconAction={"history"} aria-hidden="true"></span>
					<div>
						<h3 id="repose-dash-recent-title" class="repose-dash__section-title">Recently finished</h3>
						<p class="repose-dash__section-sub">Sorted by watched date</p>
					</div>
				</div>
				<div class="repose-dash__scroll-shell repose-dash__scroll-shell--poster-row">
					<div class="repose-dash__scroll repose-dash__scroll--strip">
						{#each recentlyWatched as e (e.item.path)}
							<button
								type="button"
								class="repose-dash__tile repose-dash__tile--lib"
								on:click={() => open(e)}
								aria-label={titleYearLine(e)}
							>
								<div class="repose-dash__lib-art repose-dash__lib-art--poster">
									{#if e.thumbUrl}
										<img src={e.thumbUrl} alt="" class="repose-dash__lib-img" />
									{:else}
										<div class="repose-dash__lib-ph" style="--repose-hue: {hueFromPath(e.item.path)}"></div>
									{/if}
									<span class="repose-dash__lib-badge">{formatShortDate(e.watchedMs ?? 0)}</span>
								</div>
								<span class="repose-dash__tile-cap">{titleYearLine(e)}</span>
							</button>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		{#if upcoming.length > 0}
			<section class="repose-dash__strip" aria-labelledby="repose-dash-up-title">
				<div class="repose-dash__section-head">
					<span class="repose-dash__section-icon" use:iconAction={"calendar-clock"} aria-hidden="true"></span>
					<div>
						<h3 id="repose-dash-up-title" class="repose-dash__section-title">On the horizon</h3>
						<p class="repose-dash__section-sub">Upcoming releases in your library</p>
					</div>
				</div>
				<div class="repose-dash__scroll-shell repose-dash__scroll-shell--upcoming-row">
					<div class="repose-dash__scroll repose-dash__scroll--strip">
						{#each upcoming as e (e.item.path)}
							<button
								type="button"
								class="repose-dash__tile repose-dash__tile--lib repose-dash__tile--upcoming"
								on:click={() => open(e)}
								aria-label={titleYearLine(e)}
							>
								<div class="repose-dash__lib-art repose-dash__lib-art--horiz">
									{#if e.thumbUrl}
										<img src={e.thumbUrl} alt="" class="repose-dash__lib-img" />
									{:else}
										<div class="repose-dash__lib-ph" style="--repose-hue: {hueFromPath(e.item.path)}"></div>
									{/if}
									<span class="repose-dash__lib-badge repose-dash__lib-badge--tl">{formatShortDate(e.releaseMs ?? 0)}</span>
								</div>
								<span class="repose-dash__tile-cap">{titleYearLine(e)}</span>
								{#if subline(e)}
									<span class="repose-dash__tile-sub">{subline(e)}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		{#each TYPE_ROWS as row (row.type)}
			{@const items = rowForType(row.type)}
			{@const isPodcast = row.type === "podcast"}
			{#if items.length > 0}
				<section class="repose-dash__strip repose-dash__strip--lib" aria-labelledby="repose-dash-row-{row.type}">
					<div class="repose-dash__section-head">
						<span class="repose-dash__section-icon" use:iconAction={row.icon} aria-hidden="true"></span>
						<div>
							<h3 id="repose-dash-row-{row.type}" class="repose-dash__section-title">{row.label}</h3>
							<p class="repose-dash__section-sub">{row.blurb}</p>
						</div>
					</div>
					<div class="repose-dash__scroll-shell repose-dash__scroll-shell--poster-row">
						<div class="repose-dash__scroll repose-dash__scroll--lib">
							{#each items as e (e.item.path)}
								<button
									type="button"
									class="repose-dash__tile repose-dash__tile--lib {isPodcast ? 'repose-dash__tile--pod' : 'repose-dash__tile--poster'}"
									on:click={() => open(e)}
									aria-label={titleYearLine(e)}
								>
									<div
										class="repose-dash__lib-art {isPodcast
											? 'repose-dash__lib-art--sq'
											: 'repose-dash__lib-art--poster'}"
									>
										{#if e.thumbUrl}
											<img src={e.thumbUrl} alt="" class="repose-dash__lib-img" />
										{:else}
											<div
												class="repose-dash__lib-ph"
												style="--repose-hue: {hueFromPath(e.item.path)}"
											></div>
										{/if}
									</div>
									<span class="repose-dash__tile-cap">{titleYearLine(e)}</span>
								</button>
							{/each}
						</div>
					</div>
				</section>
			{/if}
		{/each}
	</div>
</div>

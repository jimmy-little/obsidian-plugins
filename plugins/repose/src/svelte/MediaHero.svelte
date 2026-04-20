<script lang="ts">
	import { setIcon } from "obsidian";
	import { sampleMediaHeroPalette, type MediaHeroPalette } from "../media/bannerSample";

	/** Backdrop (banner / wide art) for full-bleed background */
	export let backdropSrc: string | null = null;
	/** Portrait poster on the left */
	export let posterSrc: string | null = null;
	export let title: string;
	/** e.g. "Released Feb 12, 2021" */
	export let releaseLabel: string | null = null;
	export let description: string | null = null;
	export let genres: string[] = [];
	/** When true, only the refresh/sync control is disabled (other actions stay usable). */
	export let refreshBusy = false;
	/** Optional status under the banner icon buttons (e.g. Trakt sync in progress). */
	export let bannerStatus: string | null = null;
	export let watchIcon: string;
	export let watchedAria: string;
	/** Episode detail: hide eye toggle in banner; use watch pill in Genres row instead. */
	export let hideBannerWatch = false;
	/** Text pill state when `hideBannerWatch` (same as episode list). */
	export let watchPillWatched = false;
	/** Podcast: pill says Listen / Listened instead of Watch / Watched. */
	export let listenUi = false;
	/** Extra labeled rows under Genres (e.g. Watched dates, book highlights). */
	export let detailMetaRows: { label: string; value: string }[] = [];
	export let refreshTitle = "Refresh metadata and images";

	/** Fires when dominant color is computed so the parent can tint the full detail surface. */
	export let onPalette: ((p: MediaHeroPalette | null) => void) | undefined = undefined;

	let paletteToken = 0;

	function reposeBannerIcon(node: HTMLElement, icon: string): { update: (next: string) => void } {
		setIcon(node, icon);
		return {
			update(next: string) {
				node.empty();
				setIcon(node, next);
			},
		};
	}

	export let onOpenNote: () => void | Promise<void>;
	/** Markdown companion: bundle note is already the open file — hide “Open note”. */
	export let hideOpenNoteButton = false;
	export let onToggleWatched: () => void | Promise<void>;
	export let onRefresh: () => void | Promise<void>;
	/** When set (e.g. podcast / book bundle), home appears in the collapsed toolbar row with other actions. */
	export let onGoHome: (() => void) | undefined = undefined;

	/** When there is no backdrop image, show only the top icon row (no tall banner strip). */
	export let collapseBannerWithoutBackdrop = false;
	/** When true, show a 2:3 placeholder if `posterSrc` is null (e.g. series poster missing). */
	export let showPosterPlaceholder = false;
	/** Passed as `--repose-hue` for the poster placeholder gradient. */
	export let posterPlaceholderHue = 220;
	/** No wide banner: toolbar + cover/poster beside title (podcast / book bundles). */
	export let coverLayout = false;
	/** Book bundle: transparent hero on page background (not the podcast card treatment). */
	export let bookHero = false;
	/** Cover aspect: podcast album art vs book cover. */
	export let coverShape: "default" | "square" | "book" = "default";
	/** TV bundle: watched episode count vs total in vault (at least one play each); bar at bottom of dock. */
	export let episodeProgress: { watched: number; total: number } | null = null;
	/** TV series: NOT STARTED / WATCHING / CAUGHT UP — shown beside the hero title. */
	export let titleStatusBadge: string | null = null;
	/** Trakt `showStatus` (e.g. ENDED) — bottom-right on the poster. */
	export let posterStatusBadge: string | null = null;
	/** When set, show a globe control that opens this URL in a new tab (e.g. Trakt show or Open Library). */
	export let traktWebUrl: string | null = null;
	/** Overrides default Trakt-oriented globe tooltip/aria (e.g. Open Library for books). */
	export let globeLinkTitle: string | undefined = undefined;
	export let globeLinkAria: string | undefined = undefined;

	function applyPalette(backdrop: string | null, poster: string | null): void {
		if (!backdrop && !poster) {
			paletteToken += 1;
			onPalette?.(null);
			return;
		}
		const t = ++paletteToken;
		void sampleMediaHeroPalette(backdrop, poster).then((p) => {
			if (t !== paletteToken) return;
			onPalette?.(p);
		});
	}

	$: heroBackdrop = coverLayout ? null : backdropSrc;
	$: applyPalette(heroBackdrop, posterSrc);
	$: collapsedToolbar =
		coverLayout || (collapseBannerWithoutBackdrop && !heroBackdrop);
	$: showPosterSlot = posterSrc || showPosterPlaceholder;
	$: progressPct =
		episodeProgress && episodeProgress.total > 0
			? Math.min(100, Math.round((episodeProgress.watched / episodeProgress.total) * 100))
			: 0;
</script>

<div class="repose-show-detail__hero-bleed">
	<div class="repose-hero-stage">
		{#if collapsedToolbar}
			<div class="repose-show-banner repose-show-banner--toolbar-only">
				<div class="repose-show-banner__toolbar-column">
					<div
						class="repose-show-banner__top-actions repose-show-banner__top-actions--toolbar-row"
						class:repose-show-banner__top-actions--toolbar-split={!!onGoHome}
					>
						{#if onGoHome}
							<button
								type="button"
								class="repose-banner-btn repose-banner-btn--icon-only"
								aria-label="Repose home"
								title="Home"
								on:click={() => onGoHome?.()}
							>
								<span class="repose-banner-btn__icon" use:reposeBannerIcon={"home"} aria-hidden="true"></span>
							</button>
						{/if}
						<div class="repose-show-banner__toolbar-actions">
							{#if !hideOpenNoteButton}
								<button
									type="button"
									class="repose-banner-btn repose-banner-btn--icon-only"
									aria-label="Open note"
									title="Open note"
									on:click={() => void onOpenNote()}
								>
									<span class="repose-banner-btn__icon" use:reposeBannerIcon={"file-input"} aria-hidden="true"></span>
								</button>
							{/if}
							{#if !hideBannerWatch}
								<button
									type="button"
									class="repose-banner-btn repose-banner-btn--icon-only"
									aria-label={watchedAria}
									title={watchedAria}
									on:click={() => void onToggleWatched()}
								>
									<span class="repose-banner-btn__icon" use:reposeBannerIcon={watchIcon} aria-hidden="true"></span>
								</button>
							{/if}
							{#if traktWebUrl}
								<a
									class="repose-banner-btn repose-banner-btn--icon-only"
									href={traktWebUrl}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={globeLinkAria ?? "Open on Trakt website"}
									title={globeLinkTitle ?? "Open on Trakt"}
								>
									<span class="repose-banner-btn__icon" use:reposeBannerIcon={"globe"} aria-hidden="true"></span>
								</a>
							{/if}
							<button
								type="button"
								class="repose-banner-btn repose-banner-btn--icon-only"
								aria-label="Refresh metadata and images"
								title={refreshTitle}
								disabled={refreshBusy}
								on:click={() => void onRefresh()}
							>
								<span class="repose-banner-btn__icon" use:reposeBannerIcon={"refresh-ccw"} aria-hidden="true"></span>
							</button>
						</div>
					</div>
					{#if bannerStatus}
						<p class="repose-show-banner__sync-status" aria-live="polite">{bannerStatus}</p>
					{/if}
				</div>
			</div>
		{:else}
		<div
			class="repose-show-banner"
			class:repose-show-banner--image={!!heroBackdrop}
			class:repose-show-banner--placeholder={!heroBackdrop}
		>
			{#if heroBackdrop}
				<img class="repose-show-banner__img" src={heroBackdrop} alt="" />
			{/if}
			<div class="repose-show-banner__scrim" aria-hidden="true"></div>
			<div class="repose-show-banner__fade-bottom" aria-hidden="true"></div>

			<div class="repose-show-banner__actions-stack">
				<div class="repose-show-banner__top-actions">
					{#if !hideOpenNoteButton}
						<button
							type="button"
							class="repose-banner-btn repose-banner-btn--icon-only"
							aria-label="Open note"
							title="Open note"
							on:click={() => void onOpenNote()}
						>
							<span class="repose-banner-btn__icon" use:reposeBannerIcon={"file-input"} aria-hidden="true"></span>
						</button>
					{/if}
					{#if !hideBannerWatch}
						<button
							type="button"
							class="repose-banner-btn repose-banner-btn--icon-only"
							aria-label={watchedAria}
							title={watchedAria}
							on:click={() => void onToggleWatched()}
						>
							<span class="repose-banner-btn__icon" use:reposeBannerIcon={watchIcon} aria-hidden="true"></span>
						</button>
					{/if}
					{#if traktWebUrl}
						<a
							class="repose-banner-btn repose-banner-btn--icon-only"
							href={traktWebUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={globeLinkAria ?? "Open on Trakt website"}
							title={globeLinkTitle ?? "Open on Trakt"}
						>
							<span class="repose-banner-btn__icon" use:reposeBannerIcon={"globe"} aria-hidden="true"></span>
						</a>
					{/if}
					<button
						type="button"
						class="repose-banner-btn repose-banner-btn--icon-only"
						aria-label="Refresh metadata and images"
						title={refreshTitle}
						disabled={refreshBusy}
						on:click={() => void onRefresh()}
					>
						<span class="repose-banner-btn__icon" use:reposeBannerIcon={"refresh-ccw"} aria-hidden="true"></span>
					</button>
				</div>
				{#if bannerStatus}
					<p class="repose-show-banner__sync-status repose-show-banner__sync-status--backdrop" aria-live="polite">
						{bannerStatus}
					</p>
				{/if}
			</div>
		</div>
		{/if}

		<div
			class="repose-hero-dock"
			class:repose-hero-dock--flush={collapsedToolbar}
			class:repose-hero-dock--cover={coverLayout}
			class:repose-hero-dock--book={coverLayout && bookHero}
		>
			<div class="repose-hero-dock__inner">
				{#if showPosterSlot}
					<div
						class="repose-show-banner__poster-wrap"
						class:repose-show-banner__poster-wrap--has-corner-badge={!!posterStatusBadge}
						class:repose-poster-wrap--square={coverLayout && coverShape === "square"}
						class:repose-poster-wrap--book={coverLayout && coverShape === "book"}
					>
						{#if posterSrc}
							<img class="repose-show-banner__poster" src={posterSrc} alt="" />
						{:else}
							<div
								class="repose-show-banner__poster repose-show-banner__poster--placeholder"
								style="--repose-hue: {posterPlaceholderHue}"
								aria-hidden="true"
							></div>
						{/if}
						{#if posterStatusBadge}
							<span class="repose-show-banner__poster-corner-badge">{posterStatusBadge}</span>
						{/if}
					</div>
				{/if}
				<div class="repose-show-banner__hero-main">
					<div class="repose-show-banner__title-row">
						<div class="repose-show-banner__title-cluster">
							<h2 class="repose-show-banner__title repose-show-banner__title--hero">{title}</h2>
							{#if titleStatusBadge}
								<span class="repose-badge repose-badge--hero-title-status">{titleStatusBadge}</span>
							{/if}
						</div>
						{#if releaseLabel}
							<span class="repose-show-banner__release">{releaseLabel}</span>
						{/if}
					</div>
					{#if description}
						<p class="repose-show-banner__description repose-show-banner__description--panel">
							{description}
						</p>
					{/if}
					{#if genres.length > 0 || hideBannerWatch || detailMetaRows.length > 0}
						<div
							class="repose-show-banner__meta-block"
							class:repose-show-banner__meta-block--hero-watch={hideBannerWatch}
							class:repose-show-banner__meta-block--hero-watch-pill-only={hideBannerWatch &&
								genres.length === 0 &&
								detailMetaRows.length === 0}
						>
							{#if hideBannerWatch}
								<div class="repose-show-banner__meta-primary">
									{#if genres.length > 0}
										<div class="repose-show-banner__meta-genres">
											<span class="repose-show-banner__meta-label">Genres</span>
											<div class="repose-show-banner__pills" role="list">
												{#each genres as g (g)}
													<span class="repose-pill" role="listitem">{g}</span>
												{/each}
											</div>
										</div>
									{/if}
									{#each detailMetaRows as row, i (String(i))}
										<div class="repose-show-banner__meta-extra">
											<span class="repose-show-banner__meta-label">{row.label}</span>
											<p class="repose-show-banner__meta-value">{row.value}</p>
										</div>
									{/each}
								</div>
								<button
									type="button"
									class="repose-show-episode-row__watch"
									class:repose-show-episode-row__watch--watched={watchPillWatched}
									aria-label={watchedAria}
									on:click|stopPropagation={() => void onToggleWatched()}
								>
									{listenUi
										? watchPillWatched
											? "Listened"
											: "Listen"
										: watchPillWatched
											? "Watched"
											: "Watch"}
								</button>
							{:else}
								{#if genres.length > 0}
									<div class="repose-show-banner__meta-genres">
										<span class="repose-show-banner__meta-label">Genres</span>
										<div class="repose-show-banner__pills" role="list">
											{#each genres as g (g)}
												<span class="repose-pill" role="listitem">{g}</span>
											{/each}
										</div>
									</div>
								{/if}
								{#each detailMetaRows as row, i (String(i))}
									<div class="repose-show-banner__meta-extra">
										<span class="repose-show-banner__meta-label">{row.label}</span>
										<p class="repose-show-banner__meta-value">{row.value}</p>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			</div>
			{#if episodeProgress && episodeProgress.total > 0}
				<div class="repose-hero-dock__progress-row">
					<div
						class="repose-hero-dock__progress"
						role="progressbar"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={progressPct}
						aria-valuetext="{episodeProgress.watched} of {episodeProgress.total} episodes in vault"
						aria-label="Episodes watched in vault: {episodeProgress.watched} of {episodeProgress.total}"
					>
						<div
							class="repose-hero-dock__progress-fill"
							style:width="{progressPct}%"
						></div>
					</div>
					<span class="repose-hero-dock__progress-count" aria-hidden="true">
						{episodeProgress.watched} of {episodeProgress.total}
					</span>
				</div>
			{/if}
		</div>
	</div>
</div>

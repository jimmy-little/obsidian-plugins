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
	export let busy = false;
	export let watchIcon: string;
	export let watchedAria: string;
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
	export let onToggleWatched: () => void | Promise<void>;
	export let onRefresh: () => void | Promise<void>;

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

	$: applyPalette(backdropSrc, posterSrc);
</script>

<div class="repose-show-detail__hero-bleed">
	<div class="repose-hero-stage">
		<div
			class="repose-show-banner"
			class:repose-show-banner--image={!!backdropSrc}
			class:repose-show-banner--placeholder={!backdropSrc}
		>
			{#if backdropSrc}
				<img class="repose-show-banner__img" src={backdropSrc} alt="" />
			{/if}
			<div class="repose-show-banner__scrim" aria-hidden="true"></div>
			<div class="repose-show-banner__fade-bottom" aria-hidden="true"></div>

			<div class="repose-show-banner__top-actions">
				<button
					type="button"
					class="repose-banner-btn repose-banner-btn--icon-only"
					aria-label="Open note"
					title="Open note"
					disabled={busy}
					on:click={() => void onOpenNote()}
				>
					<span class="repose-banner-btn__icon" use:reposeBannerIcon={"file-input"} aria-hidden="true"></span>
				</button>
				<button
					type="button"
					class="repose-banner-btn repose-banner-btn--icon-only"
					aria-label={watchedAria}
					title={watchedAria}
					disabled={busy}
					on:click={() => void onToggleWatched()}
				>
					<span class="repose-banner-btn__icon" use:reposeBannerIcon={watchIcon} aria-hidden="true"></span>
				</button>
				<button
					type="button"
					class="repose-banner-btn repose-banner-btn--icon-only"
					aria-label="Refresh metadata and images"
					title={refreshTitle}
					disabled={busy}
					on:click={() => void onRefresh()}
				>
					<span class="repose-banner-btn__icon" use:reposeBannerIcon={"refresh-ccw"} aria-hidden="true"></span>
				</button>
			</div>
		</div>

		<div class="repose-hero-dock">
			<div class="repose-hero-dock__inner">
				{#if posterSrc}
					<div class="repose-show-banner__poster-wrap">
						<img class="repose-show-banner__poster" src={posterSrc} alt="" />
					</div>
				{/if}
				<div class="repose-show-banner__hero-main">
					<div class="repose-show-banner__title-row">
						<h2 class="repose-show-banner__title repose-show-banner__title--hero">{title}</h2>
						{#if releaseLabel}
							<span class="repose-show-banner__release">{releaseLabel}</span>
						{/if}
					</div>
					{#if description}
						<p class="repose-show-banner__description repose-show-banner__description--panel">
							{description}
						</p>
					{/if}
					{#if genres.length > 0}
						<div class="repose-show-banner__meta-block">
							<span class="repose-show-banner__meta-label">Genres</span>
							<div class="repose-show-banner__pills" role="list">
								{#each genres as g (g)}
									<span class="repose-pill" role="listitem">{g}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

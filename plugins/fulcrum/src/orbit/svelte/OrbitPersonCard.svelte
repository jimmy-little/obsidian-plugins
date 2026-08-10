<script lang="ts">
	import {setIcon} from "obsidian";

	export let displayName: string;
	export let position = "";
	export let avatarSrc: string | null = null;
	export let isGhost = false;
	export let layout: "horizontal" | "vertical" = "horizontal";
	export let title: string | undefined = undefined;

	let ghostIconHost: HTMLElement | undefined;

	$: if (ghostIconHost && isGhost) {
		ghostIconHost.empty();
		setIcon(ghostIconHost, "ghost");
	}
</script>

<button
	type="button"
	class="orbit-person-card"
	class:orbit-person-card--horizontal={layout === "horizontal"}
	class:orbit-person-card--vertical={layout === "vertical"}
	class:orbit-person-card--ghost={isGhost}
	aria-label={isGhost ? `${displayName} (create person note)` : displayName}
	{title}
	on:click
>
	<span class="orbit-person-card__avatar" aria-hidden="true">
		{#if isGhost}
			<span bind:this={ghostIconHost}></span>
		{:else if avatarSrc}
			<img src={avatarSrc} alt="" />
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="12" cy="8" r="3" />
				<path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
			</svg>
		{/if}
	</span>
	<div class="orbit-person-card__text">
		<span class="orbit-person-card__name">{displayName}</span>
		{#if position}
			<span class="orbit-person-card__position">{position}</span>
		{/if}
	</div>
</button>

<style>
	.orbit-person-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
		margin: 0;
		padding: 0.15rem 0;
		border: none;
		border-radius: var(--radius-s, 6px);
		background: transparent;
		color: var(--text-normal);
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-sizing: border-box;
	}
	.orbit-person-card:hover {
		background: var(--background-modifier-hover);
	}
	.orbit-person-card:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}
	.orbit-person-card--ghost {
		opacity: 0.85;
	}
	.orbit-person-card--horizontal {
		flex-direction: row;
		align-items: center;
	}
	.orbit-person-card--horizontal .orbit-person-card__text {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.1rem;
		min-height: calc(1.25em * 2 + 0.1rem);
	}
	.orbit-person-card--vertical {
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 0.25rem 0.35rem 0.35rem;
	}
	.orbit-person-card--vertical .orbit-person-card__text {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.12rem;
		width: 100%;
	}
	.orbit-person-card__name {
		font-size: var(--font-ui-small);
		font-weight: 700;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}
	.orbit-person-card__position {
		font-size: calc(var(--font-ui-smaller) - 1px);
		font-weight: 400;
		color: var(--text-muted);
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}
	.orbit-person-card__avatar {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		overflow: hidden;
		background: color-mix(in srgb, var(--background-modifier-border) 40%, var(--background-primary));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.orbit-person-card--horizontal .orbit-person-card__avatar {
		align-self: center;
	}
	.orbit-person-card__avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.orbit-person-card__avatar svg {
		width: 55%;
		height: 55%;
		opacity: 0.5;
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import {setIcon} from "obsidian";

	export let displayName: string;
	export let avatarSrc: string | null = null;
	export let isGhost = false;
	export let title: string | undefined = undefined;

	let ghostIconHost: HTMLElement | undefined;

	$: if (ghostIconHost && isGhost) {
		ghostIconHost.empty();
		setIcon(ghostIconHost, "ghost");
	}
</script>

<button
	type="button"
	class="fulcrum-person-inline-pill"
	class:fulcrum-person-inline-pill--ghost={isGhost}
	aria-label={isGhost ? `${displayName} (create person note)` : displayName}
	{title}
	on:click
>
	<span class="fulcrum-person-inline-pill__avatar" aria-hidden="true">
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
	<span class="fulcrum-person-inline-pill__name">{displayName}</span>
</button>

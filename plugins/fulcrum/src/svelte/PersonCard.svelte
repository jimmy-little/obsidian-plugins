<script lang="ts">
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedPerson} from "../fulcrum/types";

	export let person: IndexedPerson;
	export let plugin: FulcrumHost;
	export let onKnownClick: (path: string) => void;

	let ghostIconHost: HTMLElement | undefined;

	$: if (ghostIconHost && person.isGhost) {
		ghostIconHost.empty();
		setIcon(ghostIconHost, "ghost");
	}

	function handleClick(): void {
		if (person.isGhost) {
			void plugin.createPersonNote(person.linkText, person.name);
			return;
		}
		if (person.file) onKnownClick(person.file.path);
	}
</script>

<button
	type="button"
	class="fulcrum-person-card"
	class:fulcrum-person-card--ghost={person.isGhost}
	aria-label={person.isGhost ? `${person.name} (create person note)` : person.name}
	title={person.isGhost ? "Create person note" : undefined}
	on:click={handleClick}
>
	<div
		class="fulcrum-person-card__top"
		class:fulcrum-person-card__top--has-banner={!!person.bannerImageSrc}
		style:background-image={person.bannerImageSrc
			? `url(${JSON.stringify(person.bannerImageSrc)})`
			: undefined}
	>
		<div class="fulcrum-person-card__avatar">
			{#if person.isGhost}
				<span bind:this={ghostIconHost} aria-hidden="true"></span>
			{:else if person.avatarSrc}
				<img src={person.avatarSrc} alt="" />
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<circle cx="12" cy="8" r="3"/>
					<path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
				</svg>
			{/if}
		</div>
	</div>
	<span class="fulcrum-person-card__name">{person.name}</span>
</button>

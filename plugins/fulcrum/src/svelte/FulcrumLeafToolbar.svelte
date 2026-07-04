<script lang="ts">
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";

	export let plugin: FulcrumHost;
	/** When true, show gear for Horizon calendar/meeting settings. */
	export let showHorizonSettings = false;
	export let onHorizonSettings: (() => void) | undefined = undefined;

	let refreshBtn: HTMLButtonElement | null = null;
	let settingsBtn: HTMLButtonElement | null = null;

	$: if (refreshBtn) {
		setIcon(refreshBtn, "refresh-ccw");
	}
	$: if (settingsBtn) {
		setIcon(settingsBtn, "settings");
	}
</script>

<div class="fulcrum-leaf-toolbar">
	{#if showHorizonSettings}
		<button
			type="button"
			class="fulcrum-leaf-toolbar__settings clickable-icon"
			aria-label="Horizon display settings"
			title="Horizon display settings"
			bind:this={settingsBtn}
			on:click={() => onHorizonSettings?.()}
		></button>
	{/if}
	<button
		type="button"
		class="fulcrum-leaf-toolbar__refresh clickable-icon"
		aria-label="Refresh index"
		title="Refresh index"
		bind:this={refreshBtn}
		on:click={() => void plugin.refreshIndex()}
	></button>
</div>

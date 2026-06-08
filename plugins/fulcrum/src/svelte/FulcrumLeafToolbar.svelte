<script lang="ts">
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";

	export let plugin: FulcrumHost;

	let refreshBtn: HTMLButtonElement | null = null;

	$: if (refreshBtn) {
		setIcon(refreshBtn, "refresh-ccw");
	}
</script>

<div class="fulcrum-leaf-toolbar">
	<button
		type="button"
		class="fulcrum-leaf-toolbar__refresh clickable-icon"
		aria-label="Refresh index"
		title="Refresh index"
		bind:this={refreshBtn}
		on:click={() => void plugin.refreshIndex()}
	></button>
</div>

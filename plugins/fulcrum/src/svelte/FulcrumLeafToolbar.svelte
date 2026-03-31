<script lang="ts">
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {workRelatedOnly, setWorkRelatedOnly} from "../fulcrum/stores";

	export let plugin: FulcrumHost;

	let refreshBtn: HTMLButtonElement | null = null;

	$: if (refreshBtn) {
		setIcon(refreshBtn, "refresh-ccw");
	}

	function onWorkChange(ev: Event): void {
		const el = ev.currentTarget as HTMLInputElement;
		setWorkRelatedOnly(el.checked);
	}
</script>

<div class="fulcrum-leaf-toolbar">
	<label class="fulcrum-leaf-toolbar__work">
		<span class="fulcrum-leaf-toolbar__work-text">Work related</span>
		<input
			type="checkbox"
			class="fulcrum-leaf-toolbar__checkbox"
			checked={$workRelatedOnly}
			aria-label="Show only projects in work-related areas"
			title="Show only projects linked to an area with work-related: true"
			on:change={onWorkChange}
		/>
	</label>
	<button
		type="button"
		class="fulcrum-leaf-toolbar__refresh clickable-icon"
		aria-label="Refresh index"
		title="Refresh index"
		bind:this={refreshBtn}
		on:click={() => void plugin.refreshIndex()}
	></button>
</div>

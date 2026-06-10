<script lang="ts">
	export let collapsed = false;
	export let toggleLabel = "Filters";
	export let panelId = "fulcrum-facet-panel";
	export let onToggle: () => void;
</script>

<div class="fulcrum-project-list-panel__facets-shell">
	<button
		type="button"
		class="fulcrum-project-list-panel__facets-toggle"
		aria-expanded={!collapsed}
		aria-controls={panelId}
		on:click={onToggle}
	>
		<span class="fulcrum-project-list-panel__facets-toggle-label">{toggleLabel}</span>
		<span
			class="fulcrum-project-list-panel__facets-toggle-chevron"
			class:fulcrum-project-list-panel__facets-toggle-chevron--collapsed={collapsed}
			aria-hidden="true"
		>▾</span>
	</button>
	{#if !collapsed}
		<div id={panelId} class="fulcrum-project-list-panel__facets">
			<slot />
		</div>
	{/if}
</div>

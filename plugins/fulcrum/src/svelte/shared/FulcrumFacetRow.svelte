<script lang="ts">
	export let label = "";
	export let filterRow = false;
</script>

<div
	class="fulcrum-project-list-panel__facet-row"
	class:fulcrum-project-list-panel__facet-row--filter={filterRow}
>
	<span class="fulcrum-project-list-panel__facet-label">{label}</span>
	<div
		class="fulcrum-project-list-panel__facet-controls"
		class:fulcrum-project-list-panel__facet-controls--filter={filterRow}
	>
		<slot />
	</div>
</div>

<script lang="ts">
	export let ariaLabel = "View toolbar";
	export let className = "";
</script>

<div class="fulcrum-view-toolbar {className}" role="toolbar" aria-label={ariaLabel}>
	<div class="fulcrum-view-toolbar__primary">
		<slot name="primary" />
	</div>
	<div class="fulcrum-view-toolbar__secondary">
		<slot name="secondary" />
	</div>
	<div class="fulcrum-view-toolbar__actions">
		<slot name="actions" />
	</div>
</div>

<style>
	.fulcrum-view-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.5rem;
		width: 100%;
		box-sizing: border-box;
	}
	.fulcrum-view-toolbar__primary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}
	.fulcrum-view-toolbar__secondary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}
	.fulcrum-view-toolbar__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		margin-left: auto;
	}
</style>

<script lang="ts">
	export let expanded = true;
	export let title = "";
	/** e.g. "(3)" — shown muted after the title */
	export let suffix: string | undefined = undefined;
	export let areaIcon: string | undefined = undefined;
	export let onToggle: () => void;
</script>

<button
	type="button"
	class="fulcrum-collapsible-head"
	aria-expanded={expanded}
	on:click={onToggle}
>
	<span
		class="fulcrum-collapsible-head__chevron"
		class:fulcrum-collapsible-head__chevron--collapsed={!expanded}
		aria-hidden="true"
	>▾</span>
	{#if areaIcon?.trim()}
		<span class="fulcrum-area-icon">{areaIcon}</span>
	{/if}
	<span class="fulcrum-collapsible-head__title">
		{title}
		{#if suffix}
			<span class="fulcrum-muted">{suffix}</span>
		{/if}
	</span>
</button>

<script lang="ts">
	export let title: string;
</script>

<div class="suite-shell">
	<h2 class="suite-shell__title">{title}</h2>
	<p class="suite-shell__muted">obsidian-suite scaffold — UI coming next.</p>
</div>

<style>
	.suite-shell {
		padding: var(--suite-gap, 1rem);
	}
	.suite-shell__title {
		margin: 0 0 0.5rem;
		font-size: var(--font-ui-large);
	}
	.suite-shell__muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}
</style>

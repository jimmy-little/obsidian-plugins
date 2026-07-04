<script lang="ts">
	import {TFile} from "obsidian";
	import type {OrbitHost} from "../orbit/pluginHost";
	import {buildOrgChartRows, type OrgChartRow} from "../orbit/orgChart";

	export let plugin: OrbitHost;
	export let anchorPath: string;

	let rows: OrgChartRow[] = [];

	$: {
		const f = plugin.app.vault.getAbstractFileByPath(anchorPath);
		rows = f instanceof TFile ? buildOrgChartRows(plugin.app, f) : [];
	}

	async function openPerson(path: string): Promise<void> {
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await plugin.openPersonFile(file);
	}
</script>

<div class="orbit-org-chart">
	<h2 class="orbit-org-chart__title">Org chart</h2>
	{#if rows.length === 0}
		<p class="orbit-muted">No person note at this path.</p>
	{:else if rows.length === 1 && rows[0].isAnchor}
		<p class="orbit-muted">
			No org chain linked yet. Add <code>org_up</code> / <code>org_down</code> in people notes.
		</p>
		<button
			type="button"
			class="orbit-org-chart__card orbit-org-chart__card--anchor"
			style="margin-left: 0"
			on:click={() => void openPerson(rows[0].path)}
		>
			<span class="orbit-org-chart__name">{rows[0].displayName}</span>
			<span class="orbit-org-chart__hint">Current person</span>
		</button>
	{:else}
		<div class="orbit-org-chart__list">
			{#each rows as row (row.path + row.depth + (row.isAnchor ? "@" : ""))}
				<button
					type="button"
					class="orbit-org-chart__card"
					class:orbit-org-chart__card--anchor={row.isAnchor}
					style={`margin-left: ${row.depth * 1.05}rem`}
					on:click={() => void openPerson(row.path)}
				>
					<span class="orbit-org-chart__name">{row.displayName}</span>
					{#if row.isAnchor}
						<span class="orbit-org-chart__hint">Current person</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.orbit-org-chart {
		padding: 0.75rem 0.65rem 1rem;
		box-sizing: border-box;
	}
	.orbit-org-chart__title {
		margin: 0 0 0.65rem;
		font-size: var(--font-ui-medium);
		font-weight: 700;
	}
	.orbit-org-chart__list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: stretch;
	}
	.orbit-org-chart__card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		text-align: left;
		font: inherit;
		padding: 0.45rem 0.55rem;
		border-radius: var(--radius-s, 6px);
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
		color: var(--text-normal);
		cursor: pointer;
		box-sizing: border-box;
		max-width: 100%;
	}
	.orbit-org-chart__card:hover {
		background: var(--background-modifier-hover);
	}
	.orbit-org-chart__card:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}
	.orbit-org-chart__card--anchor {
		border-color: color-mix(in srgb, var(--interactive-accent) 45%, var(--background-modifier-border));
		background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
	}
	.orbit-org-chart__name {
		font-size: var(--font-ui-small);
		font-weight: 600;
		line-height: 1.3;
		word-break: break-word;
	}
	.orbit-org-chart__hint {
		font-size: calc(var(--font-ui-smaller) - 1px);
		color: var(--text-muted);
	}
</style>

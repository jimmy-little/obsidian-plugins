<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { buildHeatmapGrid, computeMonthLabels, dowAbbreviationsForRows } from "@obsidian-suite/heatmap";
	import type ReposePlugin from "../main";
	import { buildConsumptionIndex, thumbUrlsForDate, type ConsumptionIndex } from "../calendar/consumptionIndex";
	import ConsumptionDayThumbGrid from "./ConsumptionDayThumbGrid.svelte";
	import { bindVaultRefresh } from "./bindVaultRefresh";

	export let plugin: ReposePlugin;
	export let onDayClick: ((dateKey: string) => void) | undefined = undefined;

	const CELL_PX = 28;
	const GAP_PX = 4;
	const COL_STRIDE = CELL_PX + GAP_PX;
	const FIRST_DAY_OF_WEEK = 0;

	let listRev = 0;
	let index: ConsumptionIndex = buildConsumptionIndex(plugin.app, plugin.settings);

	$: {
		void listRev;
		index = buildConsumptionIndex(plugin.app, plugin.settings);
	}

	$: grid = buildHeatmapGrid(index.counts, {
		firstDayOfWeek: FIRST_DAY_OF_WEEK,
		intensity: "relative",
	});

	/** Newest week first (left) so recents are visible without horizontal scroll. */
	$: displayColumns = [...grid.columns].reverse();
	$: monthLabels = computeMonthLabels(grid);
	$: dowLabels = dowAbbreviationsForRows(FIRST_DAY_OF_WEEK);
	$: gridWidthPx = grid.columns.length * CELL_PX + Math.max(0, grid.columns.length - 1) * GAP_PX;

	function monthLabelLeft(columnIndex: number): number {
		return (grid.columns.length - 1 - columnIndex) * COL_STRIDE;
	}

	function handleDayClick(dateKey: string, inRange: boolean): void {
		if (!inRange || !onDayClick) return;
		onDayClick(dateKey);
	}

	function onDayKeydown(ev: KeyboardEvent, dateKey: string, inRange: boolean): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		handleDayClick(dateKey, inRange);
	}

	onMount(() => {
		return bindVaultRefresh(plugin, () => listRev++, { debounceMs: 250 });
	});
</script>

<section class="repose-dash__strip repose-dash__strip--heatmap" aria-labelledby="repose-dash-heatmap-title">
	<div class="repose-dash__section-head">
		<div>
			<h3 id="repose-dash-heatmap-title" class="repose-dash__section-title">Consumption</h3>
			<p class="repose-dash__section-sub">What you watched, read, and played — last 12 months</p>
		</div>
	</div>

	<div
		class="repose-heatmap-wrap"
		style="--repose-heatmap-cell: {CELL_PX}px; --repose-heatmap-gap: {GAP_PX}px; --repose-heatmap-cols: {grid.columns.length}"
	>
		<div class="repose-heatmap__top">
			<div class="repose-heatmap__corner" aria-hidden="true"></div>
			<div class="repose-heatmap__month-row" style="width: {gridWidthPx}px">
				{#each monthLabels as m (m.columnIndex + m.label)}
					<span class="repose-heatmap__month-label" style="left: {monthLabelLeft(m.columnIndex)}px">{m.label}</span>
				{/each}
			</div>
		</div>
		<div class="repose-heatmap__bottom">
			<div class="repose-heatmap__dow-col" aria-hidden="true">
				{#each dowLabels as label, i (i)}
					<span class="repose-heatmap__dow-label">{label}</span>
				{/each}
			</div>
			<div
				class="repose-heatmap__grid"
				role="img"
				aria-label="Media consumption from {grid.rangeStartKey} to {grid.rangeEndKey}, newest on the left"
			>
				{#each displayColumns as col, ci (ci)}
					<div class="repose-heatmap__week">
						{#each col as cell (cell.dateKey)}
							{@const thumbs = cell.inRange ? thumbUrlsForDate(index, cell.dateKey) : []}
							{@const count = cell.inRange ? (index.counts.get(cell.dateKey) ?? 0) : 0}
							<button
								type="button"
								class="repose-heatmap__day"
								class:repose-heatmap__day--out={!cell.inRange}
								class:repose-heatmap__day--empty={cell.inRange && count === 0}
								class:repose-heatmap__day--clickable={cell.inRange && !!onDayClick}
								disabled={!cell.inRange || !onDayClick}
								title={cell.inRange && count > 0 ? `${count} on ${cell.dateKey}` : cell.dateKey}
								aria-label={cell.inRange && count > 0
									? `${count} item${count === 1 ? "" : "s"} on ${cell.dateKey}`
									: cell.dateKey}
								on:click={() => handleDayClick(cell.dateKey, cell.inRange)}
								on:keydown={(ev) => onDayKeydown(ev, cell.dateKey, cell.inRange)}
							>
								{#if thumbs.length > 0}
									<ConsumptionDayThumbGrid urls={thumbs} />
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

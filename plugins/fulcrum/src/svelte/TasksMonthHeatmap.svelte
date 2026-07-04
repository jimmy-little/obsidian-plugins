<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision, settingsRevision, areaFilterState} from "../fulcrum/stores";
	import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {buildAreaLifeModeMap, taskPassesAreaFilter} from "../fulcrum/utils/areaFocusFilter";
	import {
		buildTaskDueCountsByDay,
		filterOpenTasksForTasksView,
		maxCountInMap,
	} from "../fulcrum/tasks/tasksViewModel";
	import {tasksViewFocusedIso} from "../fulcrum/tasks/tasksViewStore";
	import {handleTasksViewDateDrop, tasksViewDragOver} from "../fulcrum/tasks/tasksViewDnD";
	import FulcrumDateNavToolbar from "./shared/FulcrumDateNavToolbar.svelte";

	export let plugin: FulcrumHost;

	const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	let monthStart = startOfMonth(new Date());
	let dropIso: string | null = null;

	function startOfMonth(d: Date): Date {
		return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
	}

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}
	$: sRev = $settingsRevision;
	$: doneTask = (void sRev, parseDoneStatusSet(plugin.settings.taskDoneStatuses));
	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});
	$: openTasks = snapshot.tasks.filter(
		(t) =>
			!isDoneStatus(t.status, doneTask) &&
			taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap),
	);
	$: filteredTasks = filterOpenTasksForTasksView(openTasks, plugin.settings);
	$: counts = buildTaskDueCountsByDay(filteredTasks, monthStart);
	$: maxCount = maxCountInMap(counts);

	$: monthLabel = monthStart.toLocaleDateString(undefined, {month: "long", year: "numeric"});
	$: gridCells = buildMonthCells(monthStart);

	function buildMonthCells(start: Date): {iso: string | null; dayNum: number}[] {
		const y = start.getFullYear();
		const m = start.getMonth();
		const firstDow = new Date(y, m, 1).getDay();
		const lastDay = new Date(y, m + 1, 0).getDate();
		const cells: {iso: string | null; dayNum: number}[] = [];
		for (let i = 0; i < firstDow; i++) cells.push({iso: null, dayNum: 0});
		for (let d = 1; d <= lastDay; d++) {
			const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
			cells.push({iso, dayNum: d});
		}
		return cells;
	}

	function heatLevel(count: number): number {
		if (count <= 0 || maxCount <= 0) return 0;
		return Math.min(1, count / maxCount);
	}

	function monthPrev(): void {
		monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1, 12, 0, 0, 0);
	}

	function monthNext(): void {
		monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1, 12, 0, 0, 0);
	}

	function monthToday(): void {
		monthStart = startOfMonth(new Date());
	}

	function onDayClick(iso: string): void {
		tasksViewFocusedIso.set(iso);
	}

	async function onDayDrop(ev: DragEvent, iso: string): Promise<void> {
		ev.preventDefault();
		dropIso = null;
		if (!ev.dataTransfer) return;
		await handleTasksViewDateDrop(plugin, ev.dataTransfer, iso);
		tasksViewFocusedIso.set(iso);
	}

	function onDayDragOver(ev: DragEvent, iso: string): void {
		tasksViewDragOver(ev);
		if (ev.defaultPrevented) dropIso = iso;
	}

	function onDayDragLeave(iso: string): void {
		if (dropIso === iso) dropIso = null;
	}
</script>

<div class="fulcrum-tasks-month">
	<FulcrumDateNavToolbar
		title={monthLabel}
		prevAriaLabel="Previous month"
		nextAriaLabel="Next month"
		todayVariant="label"
		todayAriaLabel="This month"
		todayTitle="This month"
		onPrev={monthPrev}
		onNext={monthNext}
		onToday={monthToday}
		className="fulcrum-tasks-month__nav"
	/>
	<div class="fulcrum-tasks-month__weekdays" aria-hidden="true">
		{#each WEEKDAYS as wd}
			<span class="fulcrum-tasks-month__weekday">{wd}</span>
		{/each}
	</div>
	<div class="fulcrum-tasks-month__grid" role="grid" aria-label="Tasks due by day">
		{#each gridCells as cell, i (i)}
			{#if cell.iso}
				{@const iso = cell.iso}
				<button
					type="button"
					class="fulcrum-tasks-month__day"
					class:fulcrum-tasks-month__day--drop={dropIso === iso}
					style="--fulcrum-tasks-heat: {heatLevel(counts.get(iso) ?? 0)}"
					role="gridcell"
					on:click={() => onDayClick(iso)}
					on:dragover={(e) => onDayDragOver(e, iso)}
					on:dragleave={() => onDayDragLeave(iso)}
					on:drop={(e) => void onDayDrop(e, iso)}
				>
					<span class="fulcrum-tasks-month__day-num">{cell.dayNum}</span>
					{#if (counts.get(iso) ?? 0) > 0}
						<span class="fulcrum-tasks-month__day-count">{counts.get(iso)}</span>
					{/if}
				</button>
			{:else}
				<div class="fulcrum-tasks-month__day fulcrum-tasks-month__day--pad" aria-hidden="true"></div>
			{/if}
		{/each}
	</div>
</div>

<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision, settingsRevision, areaFilterState, viewProjectFilterPaths} from "../fulcrum/stores";
	import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {buildAreaLifeModeMap} from "../fulcrum/utils/areaFocusFilter";
	import {weekdayLabelsOrdered} from "../fulcrum/recurrence/recurrenceRuleBuilder";
	import {
		buildTaskDueCountsByDay,
		maxCountInMap,
	} from "../fulcrum/tasks/tasksViewModel";
	import {collectHorizonTasks} from "../fulcrum/tasks/horizonTasks";
	import {tasksViewFocusedIso} from "../fulcrum/tasks/tasksViewStore";
	import {handleTasksViewDateDrop, tasksViewDragOver} from "../fulcrum/tasks/tasksViewDnD";
	import {todayLocalISODate} from "../fulcrum/utils/dates";
	import FulcrumDateNavToolbar from "./shared/FulcrumDateNavToolbar.svelte";

	export let plugin: FulcrumHost;

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
	$: weekStart = (void sRev, plugin.settings.calendarFirstDayOfWeek);
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});
	$: selectedProjectPaths = $viewProjectFilterPaths;
	$: filteredTasks = collectHorizonTasks(
		snapshot,
		plugin.settings,
		areaFilter,
		lifeModeMap,
		doneTask,
		selectedProjectPaths,
	);
	$: counts = buildTaskDueCountsByDay(filteredTasks, monthStart);
	$: maxCount = maxCountInMap(counts);
	$: focusedIso = $tasksViewFocusedIso;
	$: todayIso = todayLocalISODate();

	$: if (focusedIso) {
		const d = new Date(`${focusedIso}T12:00:00`);
		if (!Number.isNaN(d.getTime())) {
			const target = startOfMonth(d);
			if (
				target.getFullYear() !== monthStart.getFullYear() ||
				target.getMonth() !== monthStart.getMonth()
			) {
				monthStart = target;
			}
		}
	}

	$: monthLabel = monthStart.toLocaleDateString(undefined, {month: "long", year: "numeric"});
	$: weekdayLabels = weekdayLabelsOrdered(weekStart).map((w) => w.label.slice(0, 3));
	$: gridCells = buildMonthCells(monthStart, weekStart);

	function buildMonthCells(
		start: Date,
		firstDayOfWeek: number,
	): {iso: string | null; dayNum: number}[] {
		const y = start.getFullYear();
		const m = start.getMonth();
		const firstDow = new Date(y, m, 1).getDay();
		const pad = (firstDow - firstDayOfWeek + 7) % 7;
		const lastDay = new Date(y, m + 1, 0).getDate();
		const cells: {iso: string | null; dayNum: number}[] = [];
		for (let i = 0; i < pad; i++) cells.push({iso: null, dayNum: 0});
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
		{#each weekdayLabels as wd}
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
					class:fulcrum-tasks-month__day--today={iso === todayIso}
					class:fulcrum-tasks-month__day--focused={iso === focusedIso}
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

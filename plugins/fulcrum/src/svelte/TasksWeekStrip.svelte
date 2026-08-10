<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision, settingsRevision, areaFilterState} from "../fulcrum/stores";
	import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {buildAreaLifeModeMap} from "../fulcrum/utils/areaFocusFilter";
	import {
		buildWeekStripBlocks,
		weekStripDropDateIso,
	} from "../fulcrum/tasks/tasksViewModel";
	import {collectHorizonTasks} from "../fulcrum/tasks/horizonTasks";
	import {tasksViewFocusedIso} from "../fulcrum/tasks/tasksViewStore";
	import {handleTasksViewDateDrop, tasksViewDragOver} from "../fulcrum/tasks/tasksViewDnD";

	export let plugin: FulcrumHost;

	let snapshot = plugin.vaultIndex.getSnapshot();
	let dropTargetKey: string | null = null;

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
	$: filteredTasks = collectHorizonTasks(
		snapshot,
		plugin.settings,
		areaFilter,
		lifeModeMap,
		doneTask,
	);
	$: blocks = buildWeekStripBlocks(filteredTasks);
	$: focusedIso = $tasksViewFocusedIso;

	function onBlockClick(block: (typeof blocks)[0]): void {
		if (block.dateIso) tasksViewFocusedIso.set(block.dateIso);
	}

	function onDragOver(ev: DragEvent, key: string): void {
		tasksViewDragOver(ev);
		if (ev.defaultPrevented) dropTargetKey = key;
	}

	function onDragLeave(key: string): void {
		if (dropTargetKey === key) dropTargetKey = null;
	}

	async function onDrop(ev: DragEvent, block: (typeof blocks)[0]): Promise<void> {
		ev.preventDefault();
		dropTargetKey = null;
		const iso = weekStripDropDateIso(block);
		if (!iso || !ev.dataTransfer) return;
		await handleTasksViewDateDrop(plugin, ev.dataTransfer, iso);
		if (block.dateIso) tasksViewFocusedIso.set(block.dateIso);
	}
</script>

<div class="fulcrum-tasks-week-strip" role="group" aria-label="Task counts by day">
	<div class="fulcrum-tasks-week-strip__names" aria-hidden="true">
		{#each blocks as block (block.key)}
			<span
				class="fulcrum-tasks-week-strip__name"
				class:fulcrum-tasks-week-strip__name--today={block.isToday}
				class:fulcrum-tasks-week-strip__name--focused={block.dateIso === focusedIso}
			>
				{block.dayName}
			</span>
		{/each}
	</div>
	<div class="fulcrum-tasks-week-strip__blocks">
		{#each blocks as block (block.key)}
			<button
				type="button"
				class="fulcrum-tasks-week-strip__block"
				class:fulcrum-tasks-week-strip__block--today={block.isToday}
				class:fulcrum-tasks-week-strip__block--focused={block.dateIso === focusedIso}
				class:fulcrum-tasks-week-strip__block--past={block.isPast}
				class:fulcrum-tasks-week-strip__block--future={block.isFuture}
				class:fulcrum-tasks-week-strip__block--drop={dropTargetKey === block.key}
				on:click={() => onBlockClick(block)}
				on:dragover={(e) => onDragOver(e, block.key)}
				on:dragleave={() => onDragLeave(block.key)}
				on:drop={(e) => void onDrop(e, block)}
			>
				<span class="fulcrum-tasks-week-strip__label">{block.label}</span>
				<span class="fulcrum-tasks-week-strip__count">{block.count}</span>
			</button>
		{/each}
	</div>
</div>

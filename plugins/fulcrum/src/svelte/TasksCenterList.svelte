<script lang="ts">
	import {onMount, tick} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TasksViewGroupBy, TasksViewColumnId} from "../fulcrum/settingsDefaults";
	import {indexRevision, settingsRevision, areaFilterState} from "../fulcrum/stores";
	import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {buildAreaLifeModeMap, meetingPassesAreaFilter, taskPassesAreaFilter} from "../fulcrum/utils/areaFocusFilter";
	import {
		TASKS_VIEW_COLUMN_LABELS,
		buildTasksViewSections,
		filterOpenTasksForTasksView,
		gridTemplateForColumns,
		tasksViewItemKey,
	} from "../fulcrum/tasks/tasksViewModel";
	import type {TasksViewSection} from "../fulcrum/tasks/tasksViewModel";
	import {tasksViewFocusedIso, tasksViewSelectedKey} from "../fulcrum/tasks/tasksViewStore";
	import {calendarTaskDragKey} from "../fulcrum/calendar/calendarTaskSchedule";
	import TasksListRow from "./TasksListRow.svelte";
	import TasksInfoRow from "./TasksInfoRow.svelte";
	import {handleTasksViewTaskDrop, tasksViewDragOver} from "../fulcrum/tasks/tasksViewDnD";
	import {FULCRUM_CALENDAR_TASK_MIME, findTaskByDragKey} from "../fulcrum/calendar/calendarTaskSchedule";
	import type {ForecastCalendarRow} from "../fulcrum/tasks/tasksViewModel";

	export let plugin: FulcrumHost;
	export let groupBy: TasksViewGroupBy;
	export let columns: TasksViewColumnId[];
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	/** System calendar rows merged into day sections (Phase 2). */
	export let forecastCalendarRows: ForecastCalendarRow[] = [];

	const COLLAPSED_LS = "fulcrum-tasks-collapsed";

	let snapshot = plugin.vaultIndex.getSnapshot();
	/** `true` = collapsed; omitted = use section default. */
	let collapsedByKey: Record<string, boolean> = {};
	let dropSectionKey: string | null = null;
	const sectionEls = new Map<string, HTMLElement>();

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
	$: filteredMeetings =
		groupBy === "day" && plugin.settings.forecastShowVaultMeetings
			? snapshot.meetings.filter((m) =>
					meetingPassesAreaFilter(m, snapshot, areaFilter, lifeModeMap),
				)
			: [];
	$: sections = buildTasksViewSections(filteredTasks, snapshot, plugin.settings, groupBy, {
		meetings: filteredMeetings,
		calendarEvents: forecastCalendarRows,
	});
	$: selectedKey = $tasksViewSelectedKey;
	$: gridCols = gridTemplateForColumns(columns);

	onMount(() => {
		try {
			const raw = localStorage.getItem(COLLAPSED_LS);
			if (!raw) return;
			const keys = JSON.parse(raw) as string[];
			const next: Record<string, boolean> = {};
			for (const k of keys) {
				if (k.startsWith("!")) next[k.slice(1)] = false;
				else next[k] = true;
			}
			collapsedByKey = next;
		} catch {
			/* ignore */
		}
	});

	function sectionCollapsed(key: string, section: TasksViewSection): boolean {
		return key in collapsedByKey
			? collapsedByKey[key]!
			: section.defaultExpanded === false;
	}

	function toggleSection(key: string, section: TasksViewSection): void {
		const next = {...collapsedByKey, [key]: !sectionCollapsed(key, section)};
		collapsedByKey = next;
		try {
			const stored = Object.entries(next).map(([k, v]) => (v ? k : `!${k}`));
			localStorage.setItem(COLLAPSED_LS, JSON.stringify(stored));
		} catch {
			/* ignore */
		}
	}

	function onSelectRow(key: string): void {
		tasksViewSelectedKey.set(key);
	}

	async function scrollToFocused(iso: string | null): Promise<void> {
		if (!iso || groupBy !== "day") return;
		await tick();
		const el = sectionEls.get(iso);
		el?.scrollIntoView({block: "nearest", behavior: "smooth"});
	}

	$: void scrollToFocused($tasksViewFocusedIso);

	function onSectionDragOver(ev: DragEvent, key: string): void {
		tasksViewDragOver(ev);
		if (ev.defaultPrevented) dropSectionKey = key;
	}

	async function onSectionDrop(ev: DragEvent, section: TasksViewSection): Promise<void> {
		ev.preventDefault();
		dropSectionKey = null;
		const raw = ev.dataTransfer?.getData(FULCRUM_CALENDAR_TASK_MIME);
		if (!raw) return;
		const task = findTaskByDragKey(snapshot.tasks, raw);
		if (!task) return;
		await handleTasksViewTaskDrop(plugin, task, section, groupBy);
	}

	function registerSection(node: HTMLElement, key: string): {destroy: () => void} {
		sectionEls.set(key, node);
		return {
			destroy() {
				sectionEls.delete(key);
			},
		};
	}
</script>

<div class="fulcrum-tasks-center">
	<div
		class="fulcrum-tasks-center__header-row"
		style={`grid-template-columns: ${gridCols}`}
		aria-hidden="true"
	>
		<span class="fulcrum-tasks-center__head-cell"></span>
		{#each columns as col (col)}
			<span class="fulcrum-tasks-center__head-cell">{TASKS_VIEW_COLUMN_LABELS[col]}</span>
		{/each}
	</div>

	{#if sections.length === 0}
		<p class="fulcrum-muted fulcrum-tasks-center__empty">No open tasks match your filters.</p>
	{:else}
		{#each sections as section (section.key)}
			{@const collapsed =
				section.key in collapsedByKey
					? collapsedByKey[section.key]
					: section.defaultExpanded === false}
			<section class="fulcrum-tasks-center__section" use:registerSection={section.key}>
				<button
					type="button"
					class="fulcrum-tasks-center__section-head"
					class:fulcrum-tasks-center__section-head--drop={dropSectionKey === section.key}
					style={`grid-template-columns: ${gridCols}`}
					aria-expanded={!collapsed}
					on:click={() => toggleSection(section.key, section)}
					on:dragover={(e) => onSectionDragOver(e, section.key)}
					on:dragleave={() => {
						if (dropSectionKey === section.key) dropSectionKey = null;
					}}
					on:drop={(e) => void onSectionDrop(e, section)}
				>
					<span
						class="fulcrum-tasks-center__section-chevron"
						class:fulcrum-tasks-center__section-chevron--collapsed={collapsed}
						aria-hidden="true"
					>▾</span>
					<span class="fulcrum-tasks-center__section-title">
						{section.label}
						<span class="fulcrum-muted"> ({section.tasks.length})</span>
					</span>
				</button>
				{#if !collapsed}
					<div class="fulcrum-tasks-center__rows">
						{#each section.items as row (tasksViewItemKey(row))}
							{#if row.kind === "task"}
								<TasksListRow
									{plugin}
									task={row.task}
									occurrenceDateIso={row.occurrenceDateIso}
									isGhostOccurrence={row.isGhostOccurrence ?? false}
									{columns}
									{doneTask}
									{hoverParentLeaf}
									selected={selectedKey === tasksViewItemKey(row)}
									on:select={(e) => onSelectRow(e.detail)}
								/>
							{:else}
								<TasksInfoRow {plugin} item={row} {columns} />
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	{/if}
</div>

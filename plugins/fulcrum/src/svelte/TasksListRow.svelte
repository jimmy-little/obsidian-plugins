<script lang="ts">
	import {createEventDispatcher} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TasksViewColumnId} from "../fulcrum/settingsDefaults";
	import type {IndexedTask} from "../fulcrum/types";
	import {
		dueChip,
		scheduledChip,
		taskStatusRingCss,
	} from "../fulcrum/utils/taskAgendaDisplay";
	import {isDoneStatus} from "../fulcrum/settingsDefaults";
	import {gridTemplateForColumns, taskDisplayTags, tasksViewItemKey} from "../fulcrum/tasks/tasksViewModel";
	import {occurrenceScheduledIso} from "../fulcrum/tasks/horizonRecurringOccurrences";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		calendarTaskDragKey,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import {setCalendarTaskDragActive} from "../fulcrum/stores";
	import {handleTaskStatusClick, openTaskNoteFromCard} from "../fulcrum/taskCardInteractions";

	export let plugin: FulcrumHost;
	export let task: IndexedTask;
	export let columns: TasksViewColumnId[];
	export let selected = false;
	export let doneTask: Set<string>;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	/** When set, this row is one calculated occurrence of a recurring task. */
	export let occurrenceDateIso: string | undefined = undefined;
	/** Future projected occurrence (not the current due instance). */
	export let isGhostOccurrence = false;

	const dispatch = createEventDispatcher<{select: string}>();

	function projectName(): string {
		if (!task.projectFile) return "";
		const p = plugin.vaultIndex
			.getSnapshot()
			.projects.find((x) => x.file.path === task.projectFile!.path);
		return p?.name ?? task.projectFile.basename.replace(/\.md$/i, "");
	}

	function selectRow(): void {
		dispatch(
			"select",
			tasksViewItemKey({kind: "task", task, occurrenceDateIso}),
		);
	}

	function onDragStart(ev: DragEvent): void {
		const key = calendarTaskDragKey(task);
		ev.dataTransfer?.setData(FULCRUM_CALENDAR_TASK_MIME, key);
		ev.dataTransfer!.effectAllowed = "move";
		setCalendarTaskDragActive(true);
	}

	function onDragEnd(): void {
		setCalendarTaskDragActive(false);
	}

	function onStatusClick(ev: MouseEvent): void {
		ev.stopPropagation();
		void handleTaskStatusClick(ev, plugin, task);
	}
	function onStatusKeydown(e: KeyboardEvent): void {
		if (e.key === "Enter") onStatusClick(e as unknown as MouseEvent);
	}

	function onRowDblClick(ev: MouseEvent): void {
		ev.stopPropagation();
		openTaskNoteFromCard(plugin, task, hoverParentLeaf);
	}

	$: rowGridStyle = `grid-template-columns: ${gridTemplateForColumns(columns)}`;
	$: statusRingStyle = taskStatusRingCss(task, doneTask);
	$: done = isDoneStatus(task.status, doneTask);
	$: displayScheduled = occurrenceDateIso
		? occurrenceScheduledIso(task, occurrenceDateIso)
		: task.scheduledDate;
	$: displayDue = occurrenceDateIso ?? task.dueDate;
	$: schedChip = scheduledChip(displayScheduled, done);
	$: dueChipVal = dueChip(displayDue, done);
	$: showRecur = !!task.recurrence?.trim() && !task.recurrenceParentPath;
</script>

<button
	type="button"
	class="fulcrum-tasks-row"
	class:fulcrum-tasks-row--selected={selected}
	class:fulcrum-tasks-row--ghost={isGhostOccurrence}
	class:fulcrum-tasks-row--inline={task.source === "inline"}
	style={rowGridStyle}
	on:click={selectRow}
	on:dblclick={onRowDblClick}
	draggable="true"
	on:dragstart={onDragStart}
	on:dragend={onDragEnd}
>
	<span
		class="fulcrum-tasks-row__status"
		role="button"
		tabindex="0"
		title="Status"
		style={statusRingStyle}
		on:click={onStatusClick}
		on:keydown={onStatusKeydown}
	></span>
	{#each columns as col (col)}
		{#if col === "title"}
			<span class="fulcrum-tasks-row__title" title={task.title}>
				{#if task.source === "inline"}
					<span class="fulcrum-tasks-row__inline-mark" aria-hidden="true">▸</span>
				{/if}
				{task.title}
				{#if showRecur}
					<span class="fulcrum-tasks-row__recur" title="Recurring">↻</span>
				{/if}
			</span>
		{:else if col === "project"}
			<span class="fulcrum-tasks-row__project fulcrum-muted">{projectName()}</span>
		{:else if col === "scheduled"}
			<span
				class="fulcrum-tasks-row__date"
				class:fulcrum-tasks-row__date--overdue={schedChip.kind === "past"}
				class:fulcrum-tasks-row__date--today={schedChip.kind === "today"}
			>
				{schedChip.text}
			</span>
		{:else if col === "due"}
			<span
				class="fulcrum-tasks-row__date"
				class:fulcrum-tasks-row__date--overdue={dueChipVal.kind === "overdue"}
				class:fulcrum-tasks-row__date--today={dueChipVal.kind === "today"}
			>
				{dueChipVal.text}
			</span>
		{:else if col === "tags"}
			<span class="fulcrum-tasks-row__tags">
				{taskDisplayTags(task, plugin.settings).join(", ")}
			</span>
		{:else if col === "status"}
			<span class="fulcrum-tasks-row__meta">{task.status}</span>
		{:else if col === "priority"}
			<span class="fulcrum-tasks-row__meta">{task.priority ?? ""}</span>
		{/if}
	{/each}
</button>

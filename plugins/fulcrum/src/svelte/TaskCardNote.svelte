<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask} from "../fulcrum/types";
	import {Platform, setIcon} from "obsidian";
	import {dueChip, scheduledChip, priorityAccentCss} from "../fulcrum/utils/taskAgendaDisplay";
	import {displayTagsForTask} from "../fulcrum/utils/taskDisplayTags";
	import {taskProjectAccentCss} from "../fulcrum/utils/taskCardAccent";
	import {showFulcrumTaskContextMenu} from "../fulcrum/taskContextMenu";
	import {
		handleTaskStatusClick,
		handleTaskCardBlankClick,
		openEditTaskDue,
		openEditTaskProject,
		openEditTaskScheduled,
		openEditTaskTags,
		openEditTaskTitle,
		stopChipClick,
	} from "../fulcrum/taskCardInteractions";
	import {inlineTaskDisplayTitle} from "../fulcrum/utils/inlineTasks";
	import {settingsRevision} from "../fulcrum/stores";
	import TaskCardTimerSlot from "./TaskCardTimerSlot.svelte";

	function bindSourceKindIcon(node: HTMLElement, source: IndexedTask["source"]) {
		setIcon(node, source === "inline" ? "list-todo" : "file-check");
		return {
			update(next: IndexedTask["source"]) {
				node.empty();
				setIcon(node, next === "inline" ? "list-todo" : "file-check");
			},
		};
	}

	export let plugin: FulcrumHost;
	export let task: IndexedTask;
	export let done: boolean;
	export let anchorLeaf: WorkspaceLeaf | undefined = undefined;
	export let showInlineTimer = false;

	$: s = plugin.settings;
	$: isInline = task.source === "inline";
	$: displayTitle = isInline ? inlineTaskDisplayTitle(task.title) : task.title;
	$: rev = $settingsRevision;
	$: due = dueChip(task.dueDate, done);
	$: sched = scheduledChip(task.scheduledDate, done);
	$: borderPri = priorityAccentCss(task.priority);
	$: accentCss = taskProjectAccentCss(plugin, task);
	$: showScheduled = (void rev, isInline ? s.inlineTaskShowScheduled : s.taskNoteCardShowScheduled);
	$: showDue = (void rev, isInline ? s.inlineTaskShowDue : s.taskNoteCardShowDue);
	$: showProject = (void rev, isInline ? s.inlineTaskShowProject : s.taskNoteCardShowProject);
	$: showTags = (void rev, isInline ? s.inlineTaskShowTags : s.taskNoteCardShowTags);
	$: showSubtasks = !isInline && (void rev, s.taskCardShowSubtaskCount) && (task.subtaskCount ?? 0) > 0;
	$: showRecur =
		!isInline && (void rev, s.taskCardShowRecurrenceIndicator) && !!task.recurrence?.trim();
	$: tags = displayTagsForTask(task, s);
	$: canToggle = Platform.isDesktop;
	$: sourceKindTitle = isInline ? "Inline task" : "Task note";

	$: rowClass = [
		"fulcrum-task-card",
		isInline ? "fulcrum-task-card--inline" : "fulcrum-task-card--task-note",
		done ? "fulcrum-task-card--completed" : "",
	]
		.filter(Boolean)
		.join(" ");

	function projectLabel(t: IndexedTask): string {
		if (!t.projectFile) return "No project";
		return t.projectFile.basename.replace(/\.md$/i, "");
	}

	function onContextMenu(ev: MouseEvent): void {
		showFulcrumTaskContextMenu(ev, plugin, task, anchorLeaf);
	}

	function onTitleClick(ev: MouseEvent): void {
		stopChipClick(ev);
		openEditTaskTitle(plugin, task);
	}

	function onTitleKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		openEditTaskTitle(plugin, task);
	}

	function onStatusClick(ev: MouseEvent): void {
		if (!canToggle) return;
		handleTaskStatusClick(ev, plugin, task);
	}

	function onStatusKeydown(ev: KeyboardEvent): void {
		if (!canToggle) return;
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		handleTaskStatusClick(ev as unknown as MouseEvent, plugin, task);
	}

	function onMetaKeydown(ev: KeyboardEvent, action: () => void): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		action();
	}

	function onCardBlankClick(ev: MouseEvent): void {
		handleTaskCardBlankClick(ev, plugin, task, anchorLeaf);
	}
</script>

<div
	role="group"
	aria-label={`Task: ${task.title}`}
	class={rowClass}
	data-source={task.source}
	style={`--fulcrum-task-border: ${accentCss};`}
	on:contextmenu={onContextMenu}
	on:click={onCardBlankClick}
>
	<div class="fulcrum-task-card__main-row">
		<div
			role="button"
			tabindex={canToggle ? 0 : -1}
			aria-label="Change status"
			class="fulcrum-task-card__status-dot"
			class:fulcrum-task-card__status-dot--done={done}
			class:fulcrum-task-card__status-dot--readonly={!canToggle}
			style={done ? undefined : `border-color: ${borderPri}`}
			title={canToggle ? "Change status" : "Open the note to edit (mobile)"}
			on:click|stopPropagation={onStatusClick}
			on:keydown|stopPropagation={onStatusKeydown}
		>
			{#if done}
				<span class="fulcrum-task-card__check-icon" aria-hidden="true">✓</span>
			{/if}
		</div>
		<div class="fulcrum-task-card__content">
			<div
				role="button"
				tabindex="0"
				class="fulcrum-task-card__title"
				on:click={onTitleClick}
				on:keydown={onTitleKeydown}
			>
				<span class="fulcrum-task-card__title-text">{displayTitle}</span>
				{#if showRecur}
					<span class="fulcrum-task-card__recur-icon" title="Recurring">↻</span>
				{/if}
				{#if showSubtasks}
					<span class="fulcrum-task-card__subtask-badge" title="Subtasks">{task.subtaskCount}</span>
				{/if}
			</div>
			<div class="fulcrum-task-card__metadata">
				<div class="fulcrum-task-card__metadata-chips">
					<span
						class="fulcrum-task-card__source-kind"
						title={sourceKindTitle}
						aria-label={sourceKindTitle}
					>
						<span
							class="fulcrum-task-card__source-kind-icon"
							use:bindSourceKindIcon={task.source}
							aria-hidden="true"
						></span>
					</span>
					{#if showDue}
							<span
								role="button"
								tabindex="0"
								class="fulcrum-task-card__meta-chip fulcrum-task-card__due"
								class:fulcrum-task-card__meta-chip--empty={!due.text}
								title={due.text ? "Edit due date" : "Set due date"}
								aria-label={due.text ? `Due: ${due.text}` : "Set due date"}
								on:click|stopPropagation={(e) => {
									stopChipClick(e);
									openEditTaskDue(plugin, task);
								}}
								on:keydown|stopPropagation={(e) =>
									onMetaKeydown(e, () => openEditTaskDue(plugin, task))}
							>
								<svg class="fulcrum-task-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true">
									<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
									<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
								</svg>
								{#if due.text}
									<span>{due.text}</span>
								{/if}
							</span>
						{/if}
						{#if showScheduled}
							<span
								role="button"
								tabindex="0"
								class="fulcrum-task-card__meta-chip fulcrum-task-card__scheduled"
								class:fulcrum-task-card__meta-chip--empty={!sched.text}
								title={sched.text ? "Edit scheduled date" : "Set scheduled date"}
								aria-label={sched.text ? `Scheduled: ${sched.text}` : "Set scheduled date"}
								on:click|stopPropagation={(e) => {
									stopChipClick(e);
									openEditTaskScheduled(plugin, task);
								}}
								on:keydown|stopPropagation={(e) =>
									onMetaKeydown(e, () => openEditTaskScheduled(plugin, task))}
							>
								<svg class="fulcrum-task-card__meta-icon" viewBox="0 0 24 24" aria-hidden="true">
									<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
									<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
									<circle cx="12" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="2" />
									<path d="M12 12v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
								</svg>
								{#if sched.text}
									<span>{sched.text}</span>
								{/if}
							</span>
						{/if}
						{#if showProject}
							<span
								role="button"
								tabindex="0"
								class="fulcrum-task-card__meta-chip fulcrum-task-card__project"
								title="Edit project"
								on:click|stopPropagation={(e) => {
									stopChipClick(e);
									openEditTaskProject(plugin, task);
								}}
								on:keydown|stopPropagation={(e) =>
									onMetaKeydown(e, () => openEditTaskProject(plugin, task))}
							>
								<span>{projectLabel(task)}</span>
							</span>
						{/if}
						{#if showTags}
							{#each tags as tag}
								<span
									role="button"
									tabindex="0"
									class="fulcrum-task-card__meta-chip fulcrum-task-card__tag"
									title="Edit tags"
									on:click|stopPropagation={(e) => {
										stopChipClick(e);
										openEditTaskTags(plugin, task);
									}}
									on:keydown|stopPropagation={(e) =>
										onMetaKeydown(e, () => openEditTaskTags(plugin, task))}
								>
									#{tag}
								</span>
							{/each}
							{#if tags.length === 0 && !isInline}
								<span
									role="button"
									tabindex="0"
									class="fulcrum-task-card__meta-chip fulcrum-task-card__tag fulcrum-task-card__tag--empty"
									title="Add tags"
									on:click|stopPropagation={(e) => {
										stopChipClick(e);
										openEditTaskTags(plugin, task);
									}}
									on:keydown|stopPropagation={(e) =>
										onMetaKeydown(e, () => openEditTaskTags(plugin, task))}
								>
									+ tags
								</span>
							{/if}
						{/if}
				</div>
			</div>
		</div>
		{#if showInlineTimer}
			<TaskCardTimerSlot {plugin} filePath={task.file.path} />
		{/if}
	</div>
</div>

<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {Platform, setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask} from "../fulcrum/types";
	import {dueChip, scheduledChip, taskStatusRingCss} from "../fulcrum/utils/taskAgendaDisplay";
	import {displayTagsForTask} from "../fulcrum/utils/taskDisplayTags";
	import {inlineTaskDisplayTitle, setInlineTaskChecked} from "../fulcrum/utils/inlineTasks";
	import {taskProjectAccentCss} from "../fulcrum/utils/taskCardAccent";
	import {convertInlineTaskToNote} from "../fulcrum/convertInlineTaskToNote";
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
	import {taskIsRecurring} from "../fulcrum/recurrence/recurrenceComplete";
	import {applyTaskStatusChange} from "../fulcrum/kanban/taskFieldUpdate";
	import {
		isDoneStatus,
		normalizeStatusKey,
		parseDoneStatusSet,
		parseTaskStatusChoices,
	} from "../fulcrum/settingsDefaults";
	import {settingsRevision} from "../fulcrum/stores";

	export let plugin: FulcrumHost;
	export let task: IndexedTask;
	export let done: boolean;
	export let anchorLeaf: WorkspaceLeaf | undefined = undefined;
	/** Full-width row layout for Fulcrum list panels. */
	export let variant: "default" | "row" = "default";
	/** Task note wikilink embed on a host checkbox line. */
	export let compact = false;
	export let embedHost: {file: import("obsidian").TFile; line: number} | undefined = undefined;

	$: s = plugin.settings;
	$: isTaskNoteEmbed = task.source === "taskNote" && embedHost != null;
	$: displayTitle =
		task.source === "taskNote" ? task.title : inlineTaskDisplayTitle(task.title);
	$: rev = $settingsRevision;
	$: due = dueChip(task.dueDate, done);
	$: sched = scheduledChip(task.scheduledDate, done);
	$: accentCss = taskProjectAccentCss(plugin, task);
	$: statusRingCss = taskStatusRingCss(task, done);
	$: showScheduled = (void rev,
		isTaskNoteEmbed ? s.taskNoteCardShowScheduled : s.inlineTaskShowScheduled);
	$: showDue = (void rev, isTaskNoteEmbed ? s.taskNoteCardShowDue : s.inlineTaskShowDue);
	$: showProject = (void rev,
		isTaskNoteEmbed ? s.taskNoteCardShowProject : s.inlineTaskShowProject);
	$: showTags = (void rev, isTaskNoteEmbed ? s.taskNoteCardShowTags : s.inlineTaskShowTags);
	$: tags = displayTagsForTask(task, s);
	$: canToggle = Platform.isDesktop;
	$: canConvertToNote =
		task.source === "inline" && task.line != null && variant !== "row";

	$: pillClass = [
		"fulcrum-task-inline-pill",
		done ? "fulcrum-task-inline-pill--completed" : "",
		variant === "row" ? "fulcrum-task-inline-pill--row" : "fulcrum-task-inline-pill--prose",
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

	function onBlankClick(ev: MouseEvent): void {
		handleTaskCardBlankClick(ev, plugin, task, anchorLeaf);
	}

	function onStatusKeydown(ev: KeyboardEvent): void {
		if (!canToggle) return;
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		onStatusClick(ev as unknown as MouseEvent);
	}

	async function syncEmbedHostCheckbox(checked: boolean): Promise<void> {
		if (!embedHost) return;
		const lines = (await plugin.app.vault.read(embedHost.file)).split("\n");
		const line = lines[embedHost.line];
		if (line === undefined) return;
		const next = setInlineTaskChecked(line, checked);
		if (!next || next === line) return;
		lines[embedHost.line] = next;
		await plugin.app.vault.modify(embedHost.file, lines.join("\n"));
	}

	function onStatusClick(ev: MouseEvent): void {
		if (!canToggle) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (isTaskNoteEmbed) {
			const statuses = parseTaskStatusChoices(plugin.settings);
			if (statuses.length === 2 && taskIsRecurring(task)) {
				handleTaskStatusClick(ev, plugin, task);
				return;
			}
			if (statuses.length === 2) {
				const current = (task.status ?? "").trim().toLowerCase();
				const next =
					statuses.find((st) => st.trim().toLowerCase() !== current) ?? statuses[0]!;
				const doneSet = parseDoneStatusSet(plugin.settings.taskDoneStatuses);
				const yamlDone = plugin.settings.taskNoteYamlStatusDone.trim().toLowerCase();
				void (async () => {
					const isDone =
						isDoneStatus(next, doneSet) ||
						(yamlDone.length > 0 && normalizeStatusKey(next) === yamlDone);
					plugin.vaultIndex.patchIndexedTask(task, {
						status: next,
						completedDate: isDone ? new Date().toISOString().slice(0, 10) : undefined,
					});
					try {
						await applyTaskStatusChange(plugin.app, task, plugin.settings, next);
						await syncEmbedHostCheckbox(isDone);
						plugin.vaultIndex.scheduleRebuild();
					} catch (e) {
						plugin.vaultIndex.scheduleRebuild();
						throw e;
					}
				})().catch(console.error);
				return;
			}
			handleTaskStatusClick(ev, plugin, task);
			return;
		}
		handleTaskStatusClick(ev, plugin, task);
	}

	$: canConvertToReminder =
		Platform.isMacOS && plugin.conduitCanSync() && task.source === "inline" && !done;

	function onConvertToReminderClick(ev: MouseEvent): void {
		stopChipClick(ev);
		void plugin.convertTaskToReminder(task).then(() => plugin.refreshIndex());
	}

	function onConvertToNoteClick(ev: MouseEvent): void {
		stopChipClick(ev);
		void convertInlineTaskToNote(plugin, task).then(() => plugin.refreshIndex());
	}

	function bindOpenNoteIcon(node: HTMLElement) {
		setIcon(node, "file-edit");
		return {
			destroy() {
				node.empty();
			},
		};
	}

	function bindConvertNoteIcon(node: HTMLElement) {
		setIcon(node, "file-check");
		return {
			destroy() {
				node.empty();
			},
		};
	}

	function bindConvertReminderIcon(node: HTMLElement) {
		setIcon(node, "bell");
		return {
			destroy() {
				node.empty();
			},
		};
	}
</script>

<div
	role="group"
	aria-label={`Task: ${displayTitle}`}
	class={pillClass}
	style={`--fulcrum-task-pill-accent: ${accentCss};`}
	on:contextmenu={onContextMenu}
	on:click={onBlankClick}
>
	<div
		role="button"
		tabindex={canToggle ? 0 : -1}
		aria-label="Change status"
		class="fulcrum-task-inline-pill__status"
		class:fulcrum-task-inline-pill__status--done={done}
		class:fulcrum-task-inline-pill__status--readonly={!canToggle}
		style={done ? undefined : `border-color: ${statusRingCss}`}
		title={canToggle ? "Change status" : "Open the note to edit (mobile)"}
		on:click|stopPropagation={onStatusClick}
		on:keydown|stopPropagation={onStatusKeydown}
	>
		{#if done}✓{/if}
	</div>

	<button
		type="button"
		class="fulcrum-task-inline-pill__title"
		class:fulcrum-task-inline-pill__title--done={done}
		title="Edit title"
		on:click|stopPropagation={(e) => {
			stopChipClick(e);
			openEditTaskTitle(plugin, task);
		}}
	>
		{displayTitle}
	</button>

	{#if showDue && due.text}
		<button
			type="button"
			class="fulcrum-task-inline-pill__meta fulcrum-task-inline-pill__due"
			title="Edit due date"
			on:click|stopPropagation={(e) => {
				stopChipClick(e);
				openEditTaskDue(plugin, task);
			}}
		>
			<svg class="fulcrum-task-inline-pill__icon" viewBox="0 0 24 24" aria-hidden="true">
				<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
				<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
			</svg>
			{due.text}
		</button>
	{/if}

	{#if showScheduled && sched.text}
		<button
			type="button"
			class="fulcrum-task-inline-pill__meta fulcrum-task-inline-pill__scheduled"
			title="Edit scheduled date"
			on:click|stopPropagation={(e) => {
				stopChipClick(e);
				openEditTaskScheduled(plugin, task);
			}}
		>
			<svg class="fulcrum-task-inline-pill__icon" viewBox="0 0 24 24" aria-hidden="true">
				<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
				<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
			</svg>
			{sched.text}
		</button>
	{/if}

	{#if showProject}
		<button
			type="button"
			class="fulcrum-task-inline-pill__meta fulcrum-task-inline-pill__project"
			title="Edit project"
			on:click|stopPropagation={(e) => {
				stopChipClick(e);
				openEditTaskProject(plugin, task);
			}}
		>
			{projectLabel(task)}
		</button>
	{/if}

	{#if showTags}
		{#each tags as tag}
			<button
				type="button"
				class="fulcrum-task-inline-pill__meta fulcrum-task-inline-pill__tag"
				title="Edit tags"
				on:click|stopPropagation={(e) => {
					stopChipClick(e);
					openEditTaskTags(plugin, task);
				}}
			>
				#{tag}
			</button>
		{/each}
	{/if}

	{#if canConvertToNote}
		<button
			type="button"
			class="fulcrum-task-inline-pill__to-note"
			title="Convert to task note"
			aria-label="Convert to task note"
			on:click={onConvertToNoteClick}
		>
			<span class="fulcrum-task-inline-pill__to-note-icon" use:bindConvertNoteIcon aria-hidden="true"></span>
		</button>
	{/if}
	{#if canConvertToReminder}
		<button
			type="button"
			class="fulcrum-task-inline-pill__to-reminder"
			title="Convert to Reminder"
			aria-label="Convert to Reminder"
			on:click={onConvertToReminderClick}
		>
			<span class="fulcrum-task-inline-pill__to-reminder-icon" use:bindConvertReminderIcon aria-hidden="true"></span>
		</button>
	{:else if task.source === "taskNote"}
		<button
			type="button"
			class="fulcrum-task-inline-pill__open-note"
			title="Open task note"
			aria-label="Open task note"
			on:click|stopPropagation={(e) => {
				stopChipClick(e);
				plugin.openIndexedTask(task, anchorLeaf);
			}}
		>
			<span class="fulcrum-task-inline-pill__open-note-icon" use:bindOpenNoteIcon aria-hidden="true"></span>
		</button>
	{/if}
</div>

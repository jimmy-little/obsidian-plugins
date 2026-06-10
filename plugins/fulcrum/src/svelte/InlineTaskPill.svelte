<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {Platform, setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask} from "../fulcrum/types";
	import {dueChip, scheduledChip} from "../fulcrum/utils/taskAgendaDisplay";
	import {displayTagsForTask} from "../fulcrum/utils/taskDisplayTags";
	import {inlineTaskDisplayTitle} from "../fulcrum/utils/inlineTasks";
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
	import {settingsRevision} from "../fulcrum/stores";
	import {toggleInlineTaskLine} from "../fulcrum/taskVaultToggle";

	export let plugin: FulcrumHost;
	export let task: IndexedTask;
	export let done: boolean;
	export let anchorLeaf: WorkspaceLeaf | undefined = undefined;
	/** Full-width row layout for Fulcrum list panels. */
	export let variant: "default" | "row" = "default";
	/** TaskNotes embed: status + title only; checkbox toggles host line. */
	export let compact = false;
	export let embedHost: {file: import("obsidian").TFile; line: number} | undefined = undefined;

	$: s = plugin.settings;
	$: displayTitle =
		task.source === "taskNote" ? task.title : inlineTaskDisplayTitle(task.title);
	$: rev = $settingsRevision;
	$: due = dueChip(task.dueDate, done);
	$: sched = scheduledChip(task.scheduledDate, done);
	$: accentCss = taskProjectAccentCss(plugin, task);
	$: showScheduled = (void rev, s.inlineTaskShowScheduled);
	$: showDue = (void rev, s.inlineTaskShowDue);
	$: showProject = (void rev, s.inlineTaskShowProject);
	$: showTags = (void rev, s.inlineTaskShowTags);
	$: tags = displayTagsForTask(task, s);
	$: canToggle = Platform.isDesktop;

	$: pillClass = [
		"fulcrum-task-inline-pill",
		done ? "fulcrum-task-inline-pill--completed" : "",
		variant === "row" ? "fulcrum-task-inline-pill--row" : "",
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

	function onStatusClick(ev: MouseEvent): void {
		if (!canToggle) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (embedHost) {
			void toggleInlineTaskLine(plugin.app, {
				file: embedHost.file,
				line: embedHost.line,
				source: "inline",
				title: "",
				status: "",
				projectFile: null,
				areaFile: null,
				tags: [],
				createdAtMs: embedHost.file.stat.ctime,
				trackedMinutes: 0,
			}).then(() => plugin.refreshIndex());
			return;
		}
		handleTaskStatusClick(ev, plugin, task);
	}

	function bindOpenNoteIcon(node: HTMLElement) {
		setIcon(node, "file-edit");
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

	{#if !compact && showDue && due.text}
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

	{#if !compact && showScheduled && sched.text}
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

	{#if !compact && showProject}
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

	{#if !compact && showTags}
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

	{#if !compact}
	<button
		type="button"
		class="fulcrum-task-inline-pill__open-note"
		title="Open in editor"
		aria-label="Open in editor"
		on:click|stopPropagation={(e) => {
			stopChipClick(e);
			plugin.openIndexedTask(task, anchorLeaf);
		}}
	>
		<span class="fulcrum-task-inline-pill__open-note-icon" use:bindOpenNoteIcon aria-hidden="true"></span>
	</button>
	{/if}
</div>

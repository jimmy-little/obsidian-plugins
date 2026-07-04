<script lang="ts">
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TasksViewColumnId} from "../fulcrum/settingsDefaults";
	import type {TasksViewItem} from "../fulcrum/tasks/tasksViewModel";
	import {
		formatMinutesLabel,
		gridTemplateForColumns,
	} from "../fulcrum/tasks/tasksViewModel";

	export let plugin: FulcrumHost;
	export let item: TasksViewItem;
	export let columns: TasksViewColumnId[];

	let iconEl: HTMLSpanElement | null = null;

	$: rowGridStyle = `grid-template-columns: ${gridTemplateForColumns(columns)}`;
	$: iconName = item.kind === "calendar" ? "calendar" : "users";
	$: if (iconEl) setIcon(iconEl, iconName);

	$: title =
		item.kind === "task"
			? item.task.title
			: item.kind === "meeting"
				? item.meeting.title?.trim() || item.meeting.file.basename.replace(/\.md$/i, "")
				: item.title;

	$: timeLabel =
		(item.kind === "meeting" || item.kind === "calendar") && item.startMinutes != null
			? formatMinutesLabel(item.startMinutes)
			: "";

	$: projectName = (() => {
		if (item.kind === "meeting" && item.meeting.projectFile) {
			const p = plugin.vaultIndex
				.getSnapshot()
				.projects.find((x) => x.file.path === item.meeting.projectFile!.path);
			return p?.name ?? item.meeting.projectFile.basename.replace(/\.md$/i, "");
		}
		return item.kind === "calendar" ? (item.calendarTitle ?? "") : "";
	})();

	function openMeetingNote(): void {
		if (item.kind !== "meeting") return;
		const m = item.meeting;
		void plugin.app.workspace.openLinkText(m.file.basename, m.file.path, undefined, {
			active: true,
		});
	}

	function onDblClick(ev: MouseEvent): void {
		ev.stopPropagation();
		if (item.kind === "meeting") openMeetingNote();
	}
</script>

<div
	class="fulcrum-tasks-info-row"
	class:fulcrum-tasks-info-row--calendar={item.kind === "calendar"}
	class:fulcrum-tasks-info-row--meeting={item.kind === "meeting"}
	style={rowGridStyle}
	on:dblclick={onDblClick}
	role="presentation"
>
	<span class="fulcrum-tasks-info-row__icon" bind:this={iconEl} aria-hidden="true"></span>
	{#each columns as col (col)}
		{#if col === "title"}
			<span class="fulcrum-tasks-info-row__title" title={title}>{title}</span>
		{:else if col === "project"}
			<span class="fulcrum-tasks-info-row__project fulcrum-muted">{projectName}</span>
		{:else if col === "scheduled"}
			<span class="fulcrum-tasks-info-row__time">{timeLabel}</span>
		{:else if col === "due"}
			<span class="fulcrum-tasks-info-row__meta"></span>
		{:else if col === "tags"}
			<span class="fulcrum-tasks-info-row__meta">
				{item.kind === "calendar" ? "Calendar" : "Meeting"}
			</span>
		{:else}
			<span class="fulcrum-tasks-info-row__meta"></span>
		{/if}
	{/each}
</div>

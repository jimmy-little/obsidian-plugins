<script lang="ts">
	import {onMount} from "svelte";
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TasksViewColumnId} from "../fulcrum/settingsDefaults";
	import type {TasksViewItem} from "../fulcrum/tasks/tasksViewModel";
	import {
		formatMinutesLabel,
		gridTemplateForColumns,
	} from "../fulcrum/tasks/tasksViewModel";
	import {occurrenceIsPast} from "../fulcrum/utils/worldClocks";
	import {meetingEffectiveMinutes} from "../fulcrum/utils/meetingEffectiveMinutes";

	export let plugin: FulcrumHost;
	export let item: TasksViewItem;
	export let columns: TasksViewColumnId[];

	let iconEl: HTMLSpanElement | null = null;
	let now = new Date();
	onMount(() => {
		const id = window.setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => window.clearInterval(id);
	});

	$: rowGridStyle = `grid-template-columns: ${gridTemplateForColumns(columns)}`;
	$: iconName =
		item.kind === "calendar" ? "calendar" : item.kind === "note" ? "file-text" : "users";
	$: if (iconEl) setIcon(iconEl, iconName);

	$: title =
		item.kind === "task"
			? item.task.title
			: item.kind === "meeting"
				? item.meeting.title?.trim() || item.meeting.file.basename.replace(/\.md$/i, "")
				: item.kind === "note"
					? item.note.entryTitle?.trim() || item.note.file.basename.replace(/\.md$/i, "")
					: item.title;

	$: timeLabel =
		(item.kind === "meeting" || item.kind === "calendar" || item.kind === "note") &&
		item.startMinutes != null
			? formatMinutesLabel(item.startMinutes)
			: "";

	$: subtitle = (() => {
		if (item.kind === "calendar") {
			return item.location?.trim() || "";
		}
		if (item.kind === "note") {
			return item.note.noteType?.trim() || "";
		}
		if (item.kind === "meeting" && item.meeting.projectFile) {
			const p = plugin.vaultIndex
				.getSnapshot()
				.projects.find((x) => x.file.path === item.meeting.projectFile!.path);
			return p?.name ?? item.meeting.projectFile.basename.replace(/\.md$/i, "");
		}
		return "";
	})();

	$: projectName = subtitle;

	$: isPast =
		(item.kind === "meeting" || item.kind === "calendar" || item.kind === "note") &&
		occurrenceIsPast(
			item.dateIso,
			item.startMinutes,
			item.kind === "calendar"
				? item.durationMinutes
				: item.kind === "meeting"
					? meetingEffectiveMinutes(item.meeting) || 30
					: null,
			now,
		);

	function openLinked(): void {
		if (item.kind === "meeting") {
			void plugin.openLinkedNoteFromFulcrum(item.meeting.file.path);
			return;
		}
		if (item.kind === "note") {
			void plugin.openLinkedNoteFromFulcrum(item.note.file.path);
		}
	}

	function onDblClick(ev: MouseEvent): void {
		ev.stopPropagation();
		openLinked();
	}
</script>

<div
	class="fulcrum-tasks-info-row"
	class:fulcrum-tasks-info-row--calendar={item.kind === "calendar"}
	class:fulcrum-tasks-info-row--meeting={item.kind === "meeting"}
	class:fulcrum-tasks-info-row--note={item.kind === "note"}
	class:fulcrum-tasks-info-row--past={isPast}
	style={rowGridStyle}
	on:dblclick={onDblClick}
	role="presentation"
>
	<span class="fulcrum-tasks-info-row__icon" bind:this={iconEl} aria-hidden="true"></span>
	{#each columns as col (col)}
		{#if col === "title"}
			<span class="fulcrum-tasks-info-row__text">
				<span class="fulcrum-tasks-info-row__title" title={title}>{title}</span>
				{#if subtitle}
					<span class="fulcrum-tasks-info-row__sub" title={subtitle}>{subtitle}</span>
				{/if}
			</span>
		{:else if col === "project"}
			<span class="fulcrum-tasks-info-row__project fulcrum-muted">{item.kind === "calendar" ? (item.calendarTitle ?? "") : projectName}</span>
		{:else if col === "scheduled"}
			<span class="fulcrum-tasks-info-row__time">{timeLabel}</span>
		{:else if col === "due"}
			<span class="fulcrum-tasks-info-row__meta"></span>
		{:else if col === "tags"}
			<span class="fulcrum-tasks-info-row__meta">
				{item.kind === "calendar" ? "Calendar" : item.kind === "note" ? "Note" : "Meeting"}
			</span>
		{:else}
			<span class="fulcrum-tasks-info-row__meta"></span>
		{/if}
	{/each}
</div>

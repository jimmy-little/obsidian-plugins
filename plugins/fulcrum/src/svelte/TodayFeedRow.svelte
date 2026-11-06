<script lang="ts">
	import {Notice, Platform, setIcon, type WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TodayFeedItem} from "../fulcrum/today/todayFeed";
	import {formatMinutesLabel} from "../fulcrum/tasks/tasksViewModel";
	import {todayFeedTimeLabel} from "../fulcrum/today/todayFeed";
	import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";
	import {taskIsBlocked, taskIsInProgress} from "../fulcrum/utils/taskStatusDisplay";
	import {
		handleTaskStatusClick,
		handleTaskTimerToggleClick,
		openTaskNoteFromCard,
	} from "../fulcrum/taskCardInteractions";
	import {showFulcrumTaskContextMenu} from "../fulcrum/taskContextMenu";
	import {showJiraRowContextMenu} from "../fulcrum/jira/jiraContextMenu";
	import {setCalendarTaskDragActive, timerRevision} from "../fulcrum/stores";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		calendarTaskDragKey,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import {
		acceptsTodayTimeDrop,
		FULCRUM_JIRA_DRAG_MIME,
		FULCRUM_NOTE_DRAG_MIME,
		handleTodayTimeDrop,
		jiraDragKey,
		noteDragKey,
	} from "../fulcrum/today/todayDragDrop";
	import TaskCardTimerSlot from "./TaskCardTimerSlot.svelte";

	export let plugin: FulcrumHost;
	export let item: TodayFeedItem;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let colorByProject: Map<string, string> = new Map();
	/** Timeline rows keep the clock column so icons share one vertical line. */
	export let showClock = true;
	/** Focal day — required to resolve a drop onto this row into an exact datetime. */
	export let dateIso: string | undefined = undefined;
	/** Jira "Show dismissed" list: renders muted, with no special treatment otherwise. */
	export let dimmed = false;

	$: done = item.done === true;
	$: inProgress =
		item.kind === "task" && item.task != null && !done && taskIsInProgress(item.task, plugin.settings);
	$: blocked =
		item.kind === "task" && item.task != null && !done && !inProgress && taskIsBlocked(item.task, plugin.settings);
	$: timeLabel = item.startMinutes != null ? formatMinutesLabel(item.startMinutes) : "";
	$: timeMeta = todayFeedTimeLabel(item);
	$: accent = feedAccent(item, colorByProject);
	$: trackablePath = trackableFilePath(item);
	$: timerActive =
		!!trackablePath &&
		(void $timerRevision,
		plugin.timer.listActiveTimersInMemory().some((row) => row.filePath === trackablePath));
	$: canOpen =
		item.kind === "task" ||
		item.kind === "planner" ||
		item.externalUrl != null ||
		(item.filePath != null && item.filePath.length > 0);
	$: canToggleStatus = Platform.isDesktop && item.kind === "task" && item.task != null;

	function feedAccent(row: TodayFeedItem, colors: Map<string, string>): string | null {
		if (row.kind === "calendar" && row.calendarColor?.trim()) {
			return resolveProjectAccentCss(row.calendarColor);
		}
		if (row.projectPath) {
			const raw = colors.get(row.projectPath);
			if (raw?.trim()) return resolveProjectAccentCss(raw);
		}
		return null;
	}

	function trackableFilePath(row: TodayFeedItem): string | null {
		if (row.kind !== "task" && row.kind !== "note" && row.kind !== "meeting") return null;
		const path = row.filePath ?? row.task?.file.path;
		return path?.trim() ? path : null;
	}

	function feedIconName(row: TodayFeedItem): string {
		switch (row.kind) {
			case "meeting":
				return "users";
			case "calendar":
				return "calendar";
			case "note":
				return "sticky-note";
			case "planner":
				return "clock";
			case "daily":
				return "book-open";
			case "jiraTicket":
				return "ticket";
			case "jiraComment":
				return "message-square";
			default:
				return "dot";
		}
	}

	function bindFeedIcon(node: HTMLElement, row: TodayFeedItem) {
		setIcon(node, feedIconName(row));
		return {
			update(next: TodayFeedItem) {
				setIcon(node, feedIconName(next));
			},
			destroy() {
				node.empty();
			},
		};
	}

	function bindPlayStopIcon(node: HTMLElement, active: boolean) {
		setIcon(node, active ? "square" : "play");
		return {
			update(next: boolean) {
				node.empty();
				setIcon(node, next ? "square" : "play");
			},
		};
	}

	/** Open = circle, In progress = circle-arrow-right, Blocked = circle-alert. Coloring unchanged. */
	function bindStatusIcon(node: HTMLElement, iconName: string) {
		setIcon(node, iconName);
		return {
			update(next: string) {
				node.empty();
				setIcon(node, next);
			},
			destroy() {
				node.empty();
			},
		};
	}

	function openItem(): void {
		if (item.externalUrl) {
			window.open(item.externalUrl, "_blank", "noopener,noreferrer");
			return;
		}
		if (item.kind === "task" && item.task) {
			openTaskNoteFromCard(plugin, item.task, hoverParentLeaf);
			return;
		}
		if (item.kind === "planner" && item.planner) {
			plugin.openPlannerEvent(item.planner, hoverParentLeaf);
			return;
		}
		if (item.filePath) plugin.openLinkedNoteFromFulcrum(item.filePath, hoverParentLeaf);
	}

	function onBodyClick(): void {
		if (!canOpen) return;
		openItem();
	}

	function onStatusClick(ev: MouseEvent): void {
		ev.stopPropagation();
		if (!canToggleStatus || !item.task) return;
		void handleTaskStatusClick(ev, plugin, item.task);
	}

	function onStatusKeydown(e: KeyboardEvent): void {
		if (e.key !== "Enter" && e.key !== " ") return;
		e.preventDefault();
		onStatusClick(e as unknown as MouseEvent);
	}

	async function onTimerToggle(ev: MouseEvent): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();
		if (item.kind === "task" && item.task) {
			handleTaskTimerToggleClick(ev, plugin, item.task);
			return;
		}
		const path = trackablePath;
		if (!path) return;
		if (timerActive) {
			await plugin.stopTimerInNote(path);
			return;
		}
		const projectName = item.projectPath
			? item.projectPath.split("/").pop()?.replace(/\.md$/i, "") ?? null
			: null;
		try {
			await plugin.startTimerInNote(path, {projectName, noteTitle: item.title});
			plugin.bumpTimerRevision();
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not start timer.");
		}
	}

	function onTimerKeydown(e: KeyboardEvent): void {
		if (e.key !== "Enter" && e.key !== " ") return;
		e.preventDefault();
		void onTimerToggle(e as unknown as MouseEvent);
	}

	function onContextMenu(ev: MouseEvent): void {
		if (item.kind === "task" && item.task) {
			showFulcrumTaskContextMenu(ev, plugin, item.task, hoverParentLeaf);
			return;
		}
		if ((item.kind === "jiraTicket" || item.kind === "jiraComment") && item.issueKey) {
			const dismissInfo = item.timestampIso ? {key: item.key, timestampIso: item.timestampIso} : undefined;
			showJiraRowContextMenu(ev, plugin, item.issueKey, item.externalUrl, hoverParentLeaf, dismissInfo);
		}
	}

	$: draggableKind =
		(item.kind === "task" && item.task != null) ||
		(item.kind === "note" && item.note != null) ||
		((item.kind === "jiraTicket" || item.kind === "jiraComment") && item.issueKey != null);

	function onDragStart(ev: DragEvent): void {
		if (item.kind === "task" && item.task) {
			const key = calendarTaskDragKey(item.task);
			ev.dataTransfer?.setData(FULCRUM_CALENDAR_TASK_MIME, key);
			if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
			setCalendarTaskDragActive(true);
			return;
		}
		if (item.kind === "note" && item.note) {
			ev.dataTransfer?.setData(FULCRUM_NOTE_DRAG_MIME, noteDragKey(item.note));
			if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
			return;
		}
		if ((item.kind === "jiraTicket" || item.kind === "jiraComment") && item.issueKey) {
			ev.dataTransfer?.setData(FULCRUM_JIRA_DRAG_MIME, jiraDragKey(item.issueKey));
			if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
		}
	}

	function onDragEnd(): void {
		setCalendarTaskDragActive(false);
	}

	/** Every row in the timeline (a real item or an hourly filler) is a drop target for an exact time. */
	let dropHover = false;

	function onTimeDragOver(ev: DragEvent): void {
		if (item.startMinutes == null || dateIso == null || !acceptsTodayTimeDrop(ev.dataTransfer?.types)) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
		dropHover = true;
	}

	function onTimeDragLeave(): void {
		dropHover = false;
	}

	async function onTimeDrop(ev: DragEvent): Promise<void> {
		dropHover = false;
		if (item.startMinutes == null || dateIso == null || !acceptsTodayTimeDrop(ev.dataTransfer?.types)) return;
		ev.preventDefault();
		await handleTodayTimeDrop(ev, plugin, dateIso, item.startMinutes, hoverParentLeaf);
	}
</script>

<div
	class="fulcrum-today__feed-row"
	class:fulcrum-today__feed-row--clockless={!showClock}
	class:fulcrum-today__feed-row--dismissed={dimmed}
	class:fulcrum-today__feed-row--done={done}
	class:fulcrum-today__feed-row--ghost={item.isGhostOccurrence === true}
	class:fulcrum-today__feed-row--marker={item.kind === "hourMarker"}
	class:fulcrum-today__feed-row--drop={dropHover}
	style={accent ? `--fulcrum-today-accent: ${accent}` : undefined}
	role="group"
	aria-label={item.kind === "hourMarker" ? timeLabel : item.title}
	draggable={draggableKind ? "true" : "false"}
	on:dragstart={onDragStart}
	on:dragend={onDragEnd}
	on:dragover={onTimeDragOver}
	on:dragleave={onTimeDragLeave}
	on:drop={onTimeDrop}
	on:contextmenu={onContextMenu}
>
	{#if showClock}
		<span class="fulcrum-today__feed-time">{timeLabel}</span>
	{/if}
	{#if item.kind !== "hourMarker"}
		{#if item.kind === "task"}
			<button
				type="button"
				class="fulcrum-today__feed-status"
				class:fulcrum-today__feed-status--done={done}
				class:fulcrum-today__feed-status--in-progress={inProgress}
				class:fulcrum-today__feed-status--blocked={blocked}
				aria-label={done ? "Completed" : "Change status"}
				title={canToggleStatus ? "Change status" : "Status"}
				on:click={onStatusClick}
				on:keydown={onStatusKeydown}
			>
				{#if done}
					<span class="fulcrum-today__feed-check" aria-hidden="true">✓</span>
				{:else if inProgress}
					<span class="fulcrum-today__feed-progress" use:bindStatusIcon={"circle-arrow-right"} aria-hidden="true"
					></span>
				{:else if blocked}
					<span class="fulcrum-today__feed-progress" use:bindStatusIcon={"circle-alert"} aria-hidden="true"></span>
				{:else}
					<span class="fulcrum-today__feed-progress" use:bindStatusIcon={"circle"} aria-hidden="true"></span>
				{/if}
			</button>
		{:else}
			<span class="fulcrum-today__feed-icon" use:bindFeedIcon={item} aria-hidden="true"></span>
		{/if}
		{#if canOpen}
			<button type="button" class="fulcrum-today__feed-body" on:click={onBodyClick}>
				<span class="fulcrum-today__feed-title" class:fulcrum-today__feed-title--done={done}>{item.title}</span>
				{#if item.subtitle}
					<span class="fulcrum-today__feed-sub" class:fulcrum-today__feed-sub--quote={item.subtitleMultiline}
						>{item.subtitle}</span
					>
				{/if}
			</button>
		{:else}
			<div class="fulcrum-today__feed-body fulcrum-today__feed-body--static">
				<span class="fulcrum-today__feed-title" class:fulcrum-today__feed-title--done={done}>{item.title}</span>
				{#if item.subtitle}
					<span class="fulcrum-today__feed-sub" class:fulcrum-today__feed-sub--quote={item.subtitleMultiline}
						>{item.subtitle}</span
					>
				{/if}
			</div>
		{/if}
		<span class="fulcrum-today__feed-meta">
			{#if timeMeta}
				<span class="fulcrum-today__feed-duration">{timeMeta}</span>
			{/if}
			{#if timerActive && trackablePath}
				<TaskCardTimerSlot {plugin} filePath={trackablePath} placement="row" />
			{/if}
			{#if trackablePath}
				<span
					role="button"
					tabindex="0"
					class="fulcrum-task-card__start-timer fulcrum-today__feed-play"
					class:fulcrum-task-card__start-timer--active={timerActive}
					title={timerActive ? "Stop timer" : "Start timer"}
					aria-label={timerActive ? "Stop timer" : "Start timer"}
					on:click={onTimerToggle}
					on:keydown={onTimerKeydown}
				>
					<span
						class="fulcrum-task-card__start-timer-icon"
						use:bindPlayStopIcon={timerActive}
						aria-hidden="true"
					></span>
				</span>
			{/if}
		</span>
	{/if}
</div>

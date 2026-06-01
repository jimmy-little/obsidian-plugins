<script lang="ts">
	import {onMount} from "svelte";
	import {Notice} from "obsidian";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask} from "../fulcrum/types";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {
		buildAreaWorkRelatedMap,
		meetingPassesWorkFilter,
		taskPassesWorkFilter,
	} from "../fulcrum/utils/workRelatedProjectFilter";
	import {parseList} from "../fulcrum/settingsDefaults";
	import type {CalendarTaskScheduleField} from "../fulcrum/settingsDefaults";
	import {
		gridDates,
		addDays,
		toISODate,
		formatMonthYear,
		formatWeekRange,
		formatDayShort,
		formatDayNum,
		gridStartDate,
		daysInView,
		isWorkWeekDay,
		timeGridNowLineTopPercent,
		type CalendarViewMode,
	} from "../fulcrum/utils/calendarGrid";
	import {todayLocalISODate} from "../fulcrum/utils/dates";
	import {
		taskToCalendarEvent,
		meetingToCalendarEvent,
		projectColorMap,
		type CalendarEvent,
	} from "../fulcrum/utils/calendarEvents";
	import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";
	import {buildTimerCalendarOverlay} from "../fulcrum/utils/timerCalendarOverlay";
	import {applyTaskScheduleOnDate} from "../fulcrum/kanban/taskFieldUpdate";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		calendarTaskDragKey,
		findTaskByDragKey,
		promptTaskScheduleField,
		waitForMetadataCache,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	/** Bumps on an interval so the “now” line position stays current. */
	let nowLineTick = 0;
	onMount(() => {
		const id = window.setInterval(() => {
			nowLineTick += 1;
		}, 90_000);
		return () => window.clearInterval(id);
	});

	$: nowLineTopPct = (void nowLineTick, timeGridNowLineTopPercent());

	let focalDate = new Date();
	focalDate.setHours(0, 0, 0, 0);

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: viewMode = (void sRev, plugin.settings.calendarViewMode) as CalendarViewMode;
	$: doneTask = new Set(parseList(plugin.settings.taskDoneStatuses));
	$: weekStart = (void sRev, plugin.settings.calendarFirstDayOfWeek);
	$: timerLayers = (void sRev, plugin.settings.timer);
	$: scheduleDateMode = (void sRev, plugin.settings.calendarTaskScheduleField);

	let timerOverlayEvents: import("../fulcrum/utils/calendarEvents").CalendarEvent[] = [];
	let timerOverlayLoadId = 0;

	let draggedTaskKey: string | null = null;
	let dragOverDate: string | null = null;

	async function toggleTimerLayer(
		key: "calendarShowTasks" | "calendarShowMeetings" | "calendarShowLogged" | "calendarShowPlanned",
	): Promise<void> {
		await plugin.patchSettings({
			timer: {
				...plugin.settings.timer,
				[key]: !plugin.settings.timer[key],
			},
		});
	}

	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
	});
	$: onlyWork = $workRelatedOnly;

	$: dates = gridDates(focalDate, viewMode, weekStart);
	$: startDate = gridStartDate(focalDate, viewMode, weekStart);
	$: dayCount = daysInView(viewMode);

	$: {
		void rev;
		void dates;
		void timerLayers.calendarShowLogged;
		void timerLayers.calendarShowPlanned;
		const id = ++timerOverlayLoadId;
		const end = addDays(startDate, Math.max(dayCount - 1, 0));
		void (async (): Promise<void> => {
			if (!timerLayers.calendarShowLogged && !timerLayers.calendarShowPlanned) {
				if (id === timerOverlayLoadId) timerOverlayEvents = [];
				return;
			}
			const overlay = await buildTimerCalendarOverlay(
				plugin.timer,
				startDate,
				end,
				{
					showLogged: timerLayers.calendarShowLogged,
					showPlanned: timerLayers.calendarShowPlanned,
				},
				(path) => plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf),
			);
			if (id === timerOverlayLoadId) timerOverlayEvents = overlay;
		})();
	}

	/** Tasks with scheduled or due date */
	$: datedTasks = snapshot.tasks.filter((t) => {
		const sched = t.scheduledDate?.slice(0, 10);
		const due = t.dueDate?.slice(0, 10);
		return (
			(sched || due) &&
			!doneTask.has(t.status) &&
			taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap)
		);
	});

	/** Open tasks with no due or scheduled date (respects vault task index settings). */
	$: unscheduledTasks = snapshot.tasks
		.filter((t) => {
			if (doneTask.has(t.status)) return false;
			if (!taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap)) return false;
			const sched = t.scheduledDate?.slice(0, 10);
			const due = t.dueDate?.slice(0, 10);
			return !sched && !due;
		})
		.sort((a, b) => a.title.localeCompare(b.title, undefined, {sensitivity: "base"}));

	$: projectColors = projectColorMap(snapshot.projects);

	/** Unified calendar events (tasks + meetings + timer overlay) */
	$: allCalendarEvents = ((): import("../fulcrum/utils/calendarEvents").CalendarEvent[] => {
		const out: import("../fulcrum/utils/calendarEvents").CalendarEvent[] = [];
		if (timerLayers.calendarShowTasks) {
			for (const t of datedTasks) {
				for (const e of taskToCalendarEvent(
					t,
					() => plugin.openIndexedTask(t, hoverParentLeaf),
					projectColors,
				)) {
					out.push(e);
				}
			}
		}
		if (timerLayers.calendarShowMeetings) {
			for (const m of snapshot.meetings) {
				if (!meetingPassesWorkFilter(m, snapshot, onlyWork, areaWorkMap)) continue;
				const e = meetingToCalendarEvent(
					m,
					() => plugin.openLinkedNoteFromFulcrum(m.file.path, hoverParentLeaf),
					projectColors,
				);
				if (e) out.push(e);
			}
		}
		out.push(...timerOverlayEvents);
		return out;
	})();

	$: eventsByDate = (() => {
		const m = new Map<string, {allDay: CalendarEvent[]; timed: CalendarEvent[]}>();
		for (const e of allCalendarEvents) {
			const cur = m.get(e.dateIso) ?? {allDay: [], timed: []};
			if (e.startMinutes == null) cur.allDay.push(e);
			else cur.timed.push(e);
			m.set(e.dateIso, cur);
		}
		for (const [, v] of m) {
			v.timed.sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
		}
		return m;
	})();

	function eventsForDate(iso: string): {allDay: CalendarEvent[]; timed: CalendarEvent[]} {
		return eventsByDate.get(iso) ?? {allDay: [], timed: []};
	}

	function calendarEventKey(e: CalendarEvent): string {
		if (e.task) return `task:${e.task.file.path}:${e.task.line ?? ""}:${e.dateIso}`;
		if (e.meeting) return `meeting:${e.meeting.file.path}:${e.dateIso}`;
		if (e.planner) return `planner:${e.planner.file.path}:${e.planner.line}`;
		return `${e.kind}:${e.title}:${e.dateIso}:${e.startMinutes ?? "a"}`;
	}

	function onTaskDragStart(ev: DragEvent, task: IndexedTask): void {
		const key = calendarTaskDragKey(task);
		draggedTaskKey = key;
		ev.dataTransfer?.setData(FULCRUM_CALENDAR_TASK_MIME, key);
		if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
	}

	function onTaskDragEnd(): void {
		draggedTaskKey = null;
		dragOverDate = null;
	}

	function onDropZoneDragOver(ev: DragEvent, iso: string): void {
		const types = ev.dataTransfer?.types ?? [];
		if (!draggedTaskKey && !types.includes(FULCRUM_CALENDAR_TASK_MIME)) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
		dragOverDate = iso;
	}

	function onDropZoneDragLeave(iso: string): void {
		if (dragOverDate === iso) dragOverDate = null;
	}

	async function onScheduleModeChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as CalendarTaskScheduleField;
		await plugin.patchSettings({calendarTaskScheduleField: v});
	}

	async function onDropZoneDrop(ev: DragEvent, iso: string): Promise<void> {
		ev.preventDefault();
		dragOverDate = null;
		const key = ev.dataTransfer?.getData(FULCRUM_CALENDAR_TASK_MIME) || draggedTaskKey;
		draggedTaskKey = null;
		if (!key) return;
		const task = findTaskByDragKey(snapshot.tasks, key);
		if (!task) {
			new Notice("Task not found — try again after the index refreshes.");
			return;
		}
		let field: "due" | "scheduled";
		if (scheduleDateMode === "ask") {
			const picked = await promptTaskScheduleField(plugin.app);
			if (!picked) return;
			field = picked;
		} else {
			field = scheduleDateMode;
		}
		try {
			await applyTaskScheduleOnDate(plugin.app, task, plugin.settings, iso, field);
			await waitForMetadataCache(plugin.app, task.file);
			await plugin.vaultIndex.rebuild();
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not schedule task.");
		}
	}

	function dropTargetClass(iso: string): string {
		return dragOverDate === iso ? "fulcrum-calendar__drop-target--active" : "";
	}

	async function onViewModeChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as CalendarViewMode;
		await plugin.patchSettings({calendarViewMode: v});
	}

	function goPrev(): void {
		if (viewMode === "month") {
			focalDate = new Date(focalDate.getFullYear(), focalDate.getMonth() - 1, 1);
		} else {
			focalDate = addDays(focalDate, -dayCount);
		}
	}

	function goNext(): void {
		if (viewMode === "month") {
			focalDate = new Date(focalDate.getFullYear(), focalDate.getMonth() + 1, 1);
		} else {
			focalDate = addDays(focalDate, dayCount);
		}
	}

	function goToday(): void {
		focalDate = new Date();
		focalDate.setHours(0, 0, 0, 0);
	}

	$: titleText =
		viewMode === "month"
			? formatMonthYear(focalDate)
			: formatWeekRange(startDate, dayCount);

	$: isMonthView = viewMode === "month";
	$: showTimeGrid = !isMonthView;

	$: weekdayHeaders = isMonthView
		? (() => {
				const out: {label: string; date: Date}[] = [];
				for (let i = 0; i < 7; i++) {
					const d = addDays(startDate, i);
					out.push({label: formatDayShort(d), date: d});
				}
				return out;
			})()
		: dates.slice(0, Math.min(dayCount, 7)).map(({date}) => ({
				label: `${formatDayShort(date)} ${formatDayNum(date)}`,
				date,
			}));
</script>

<div
	class="fulcrum-calendar"
	class:fulcrum-calendar--dragging-task={!!draggedTaskKey}
	data-fulcrum-calendar-root
>
	<div class="fulcrum-calendar__toolbar">
		<button type="button" class="fulcrum-calendar__nav-btn" aria-label="Previous" on:click={goPrev}>
			‹
		</button>
		<button type="button" class="fulcrum-calendar__nav-btn" aria-label="Next" on:click={goNext}>
			›
		</button>
		<h2 class="fulcrum-calendar__title">{titleText}</h2>
		<button type="button" class="fulcrum-calendar__today" on:click={goToday}>
			Today
		</button>
		<label class="fulcrum-calendar__view-mode">
			<span class="fulcrum-calendar__view-mode-label">View</span>
			<select
				class="dropdown fulcrum-calendar__view-select"
				aria-label="Calendar view mode"
				value={viewMode}
				on:change={(e) => void onViewModeChange(e)}
			>
				<option value="month">Month</option>
				<option value="workWeek">Work week</option>
				<option value="week">Week</option>
				<option value="threeDay">3 days</option>
				<option value="day">Day</option>
			</select>
		</label>
	</div>

	<div class="fulcrum-calendar__layers" role="group" aria-label="Calendar layers">
		<button
			type="button"
			class="fulcrum-calendar__layer"
			class:fulcrum-calendar__layer--on={timerLayers.calendarShowTasks}
			on:click={() => toggleTimerLayer("calendarShowTasks")}
		>Tasks</button>
		<button
			type="button"
			class="fulcrum-calendar__layer"
			class:fulcrum-calendar__layer--on={timerLayers.calendarShowMeetings}
			on:click={() => toggleTimerLayer("calendarShowMeetings")}
		>Meetings</button>
		<button
			type="button"
			class="fulcrum-calendar__layer"
			class:fulcrum-calendar__layer--on={timerLayers.calendarShowLogged}
			on:click={() => toggleTimerLayer("calendarShowLogged")}
		>Logged</button>
		<button
			type="button"
			class="fulcrum-calendar__layer"
			class:fulcrum-calendar__layer--on={timerLayers.calendarShowPlanned}
			on:click={() => toggleTimerLayer("calendarShowPlanned")}
		>Planned</button>
	</div>

	<div class="fulcrum-calendar__scroll">
	{#if isMonthView}
		<div class="fulcrum-calendar__month" role="grid" aria-label="Month calendar">
			<div class="fulcrum-calendar__month-header" role="row">
				{#each weekdayHeaders as {label}}
					<div class="fulcrum-calendar__month-cell fulcrum-calendar__month-cell--head" role="columnheader">
						{label}
					</div>
				{/each}
			</div>
			<div class="fulcrum-calendar__month-body">
				{#each Array(Math.ceil(dates.length / 7)) as _, rowIndex}
					<div class="fulcrum-calendar__month-row" role="row">
						{#each Array(7) as _, colIndex}
							{@const idx = rowIndex * 7 + colIndex}
							{@const cell = dates[idx]}
							{#if cell}
								{@const iso = toISODate(cell.date)}
								{@const {allDay, timed} = eventsForDate(iso)}
								{@const dayEvents = [...allDay, ...timed]}
								{@const hasEvents = dayEvents.length > 0}
								<div
									class="fulcrum-calendar__day-cell {dropTargetClass(iso)}"
									class:fulcrum-calendar__day-cell--other-month={!cell.isCurrentMonth}
									class:fulcrum-calendar__day-cell--has-events={hasEvents}
									role="gridcell"
									data-date={iso}
									data-drop-target=""
									on:dragover={(e) => onDropZoneDragOver(e, iso)}
									on:dragleave={() => onDropZoneDragLeave(iso)}
									on:drop={(e) => void onDropZoneDrop(e, iso)}
								>
									<span class="fulcrum-calendar__day-num">{formatDayNum(cell.date)}</span>
									<div class="fulcrum-calendar__day-events">
										{#each dayEvents.slice(0, 5) as e (calendarEventKey(e))}
											<button
												type="button"
												class="fulcrum-calendar__event fulcrum-calendar__event--{e.kind}"
												style={e.accentCss ? `--fulcrum-event-accent: ${e.accentCss}` : undefined}
												data-fulcrum-calendar-event
												on:click={(ev) => { ev.preventDefault(); e.open(); }}
											>
												<span class="fulcrum-calendar__event-icon" aria-hidden="true">
													{#if e.kind === "task" || e.kind === "logged"}
														<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
													{:else if e.kind === "planned" || e.kind === "planner"}
														<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
													{:else}
														<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
													{/if}
												</span>
												<span class="fulcrum-calendar__event-title">{e.title}</span>
											</button>
										{/each}
										{#if dayEvents.length > 5}
											<span class="fulcrum-calendar__more">
												+{dayEvents.length - 5} more
											</span>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		{@const dayCols = weekdayHeaders.filter(({date}) => viewMode !== "workWeek" || isWorkWeekDay(date))}
		<div
			class="fulcrum-calendar__time-grid"
			role="grid"
			style="--fulcrum-cal-cols: {dayCols.length}"
		>
			<div class="fulcrum-calendar__time-grid-header">
				<div class="fulcrum-calendar__time-grid-spacer"></div>
				{#each dayCols as {label, date}}
					<div class="fulcrum-calendar__time-grid-col-head" data-date={toISODate(date)}>
						{label}
					</div>
				{/each}
			</div>
			<div class="fulcrum-calendar__allday-row">
				<div class="fulcrum-calendar__time-grid-hour">All day</div>
				{#each dayCols as {date}}
					{@const iso = toISODate(date)}
					{@const {allDay} = eventsForDate(iso)}
					<div
						class="fulcrum-calendar__allday-cell {dropTargetClass(iso)}"
						data-date={iso}
						data-drop-target=""
						on:dragover={(e) => onDropZoneDragOver(e, iso)}
						on:dragleave={() => onDropZoneDragLeave(iso)}
						on:drop={(e) => void onDropZoneDrop(e, iso)}
					>
						{#each allDay as e (e.task ? `${e.task.file.path}:${e.task.line ?? ""}` : (e.meeting?.file.path ?? ""))}
							<button
								type="button"
								class="fulcrum-calendar__event fulcrum-calendar__event--{e.kind}"
								style={e.accentCss ? `--fulcrum-event-accent: ${e.accentCss}` : undefined}
								data-fulcrum-calendar-event
								on:click={(ev) => { ev.preventDefault(); e.open(); }}
							>
								<span class="fulcrum-calendar__event-icon" aria-hidden="true">
									{#if e.kind === "task"}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
									{/if}
								</span>
								<span class="fulcrum-calendar__event-title">{e.title}</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>
			<div class="fulcrum-calendar__time-grid-body">
				<div class="fulcrum-calendar__time-grid-hour-col">
					{#each Array(24) as _, hour}
						<div class="fulcrum-calendar__time-grid-hour">
							{hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
						</div>
					{/each}
				</div>
				{#each dayCols as {date}}
					{@const iso = toISODate(date)}
					{@const {timed} = eventsForDate(iso)}
					<div class="fulcrum-calendar__time-grid-day-col">
						<div class="fulcrum-calendar__time-slots">
							{#each Array(24) as _, hour}
								<div
									class="fulcrum-calendar__time-slot {dropTargetClass(iso)}"
									data-date={iso}
									data-hour={hour}
									data-drop-target=""
									on:dragover={(e) => onDropZoneDragOver(e, iso)}
									on:dragleave={() => onDropZoneDragLeave(iso)}
									on:drop={(e) => void onDropZoneDrop(e, iso)}
								></div>
							{/each}
						</div>
						<div class="fulcrum-calendar__day-events-overlay">
							{#each timed as e (e.task ? `${e.task.file.path}:${e.task.line ?? ""}:${e.startMinutes}` : `${e.meeting?.file.path ?? ""}:${e.startMinutes}`)}
								{@const totalMinutes = 24 * 60}
								{@const topPct = ((e.startMinutes ?? 0) / totalMinutes) * 100}
								{@const heightPct = ((e.durationMinutes ?? 30) / totalMinutes) * 100}
								<button
									type="button"
									class="fulcrum-calendar__timed-event fulcrum-calendar__timed-event--{e.kind}"
									style="top: {topPct}%; height: {heightPct}%;{e.accentCss ? ` --fulcrum-event-accent: ${e.accentCss};` : ""}"
									data-fulcrum-calendar-event
									on:click={(ev) => { ev.preventDefault(); e.open(); }}
								>
									<span class="fulcrum-calendar__timed-event-icon" aria-hidden="true">
										{#if e.kind === "task"}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
										{/if}
									</span>
									<span class="fulcrum-calendar__timed-event-title">{e.title}</span>
								</button>
							{/each}
							{#if iso === todayLocalISODate()}
								<div
									class="fulcrum-calendar__now-line"
									style="top: {nowLineTopPct}%"
									aria-hidden="true"
								></div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<section class="fulcrum-calendar__unscheduled" aria-label="Unscheduled tasks">
		<div class="fulcrum-calendar__unscheduled-head">
			<h3 class="fulcrum-calendar__unscheduled-title">Unscheduled tasks</h3>
			<label class="fulcrum-calendar__schedule-mode">
				<span class="fulcrum-calendar__schedule-mode-label">Set date as</span>
				<select
					class="dropdown fulcrum-calendar__schedule-mode-select"
					aria-label="Date field when scheduling tasks"
					value={scheduleDateMode}
					on:change={(e) => void onScheduleModeChange(e)}
				>
					<option value="due">Due</option>
					<option value="scheduled">Scheduled</option>
					<option value="ask">Ask each time</option>
				</select>
			</label>
		</div>
		{#if unscheduledTasks.length === 0}
			<p class="fulcrum-calendar__unscheduled-empty fulcrum-muted">No open tasks without a due or scheduled date.</p>
		{:else}
			<div class="fulcrum-calendar__unscheduled-list" role="list">
				{#each unscheduledTasks as task (calendarTaskDragKey(task))}
					{@const accent =
						task.projectFile && projectColors.get(task.projectFile.path)
							? resolveProjectAccentCss(projectColors.get(task.projectFile.path))
							: null}
					<div
						class="fulcrum-calendar__unscheduled-card"
						class:fulcrum-calendar__unscheduled-card--dragging={draggedTaskKey === calendarTaskDragKey(task)}
						role="listitem"
						draggable="true"
						on:dragstart={(e) => onTaskDragStart(e, task)}
						on:dragend={onTaskDragEnd}
					>
						<span class="fulcrum-calendar__unscheduled-grip" aria-hidden="true">⋮⋮</span>
						<button
							type="button"
							class="fulcrum-calendar__unscheduled-body"
							style={accent ? `--fulcrum-event-accent: ${accent}` : undefined}
							on:click={() => plugin.openIndexedTask(task, hoverParentLeaf)}
						>
							<span class="fulcrum-calendar__unscheduled-title-text">{task.title}</span>
							{#if task.projectFile}
								<span class="fulcrum-calendar__unscheduled-project">
									{task.projectFile.basename.replace(/\.md$/i, "")}
								</span>
							{/if}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>
	</div>
</div>

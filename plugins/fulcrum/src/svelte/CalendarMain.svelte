<script lang="ts">
	import {onMount} from "svelte";
	import {Notice, TFile} from "obsidian";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {
		calendarTaskDragActive,
		indexRevision,
		setCalendarTaskDragActive,
		settingsRevision,
		areaFilterState,
	} from "../fulcrum/stores";
	import {
		buildAreaLifeModeMap,
		meetingPassesAreaFilter,
		taskPassesAreaFilter,
	} from "../fulcrum/utils/areaFocusFilter";
	import {isDoneStatus, parseDoneStatusSet, parseList} from "../fulcrum/settingsDefaults";
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
	import {occurrenceIsPast} from "../fulcrum/utils/worldClocks";
	import {
		taskToCalendarEvent,
		taskOccurrenceToCalendarEvents,
		meetingToCalendarEvent,
		atomicNoteToCalendarEvent,
		projectColorMap,
		calendarEventKey,
		type CalendarEvent,
	} from "../fulcrum/utils/calendarEvents";
	import {isRecurringParentTask, horizonRecurringOccurrenceDates} from "../fulcrum/tasks/horizonRecurringOccurrences";
	import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";
	import {fetchBridgeCalendarEvents} from "../conduit/bridgeCalendar";
	import {
		preferNotesInCalendarEvents,
		filterExternalCalendarEventsAgainstMeetings,
	} from "../fulcrum/utils/calendarOccurrenceDedupe";
	import {
		applyCalendarEventToSlot,
		calendarEventDragPayload,
		findCalendarEventByPayload,
		FULCRUM_CALENDAR_EVENT_MIME,
	} from "../fulcrum/calendar/calendarDropApply";
	import type {CalendarDropSlot} from "../fulcrum/calendar/calendarDropSlot";
	import {showFulcrumTaskContextMenu} from "../fulcrum/taskContextMenu";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		findTaskByDragKey,
		resolveTaskScheduleFieldSetting,
		waitForNextFileResolved,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import {taskDisplayTitle} from "../fulcrum/utils/inlineTasks";
	import TaskToolbarActions from "./TaskToolbarActions.svelte";
	import GanttMain from "./GanttMain.svelte";
	import FulcrumDateNavToolbar from "./shared/FulcrumDateNavToolbar.svelte";
	import FulcrumViewToolbar from "./shared/FulcrumViewToolbar.svelte";
	import CalendarEventChip from "./CalendarEventChip.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let filterProjectPath: string | undefined = undefined;
	export let projectAtomicNotes: import("../fulcrum/types").AtomicNoteRow[] = [];
	export let embedded = false;

	/** Main calendar shell only: schedule grid vs project/task gantt. */
	let calendarPane: "schedule" | "gantt" = "schedule";

	/** Bumps on an interval so the “now” line position stays current. */
	let nowLineTick = 0;
	onMount(() => {
		const id = window.setInterval(() => {
			nowLineTick += 1;
		}, 90_000);
		return () => window.clearInterval(id);
	});

	$: nowLineTopPct = (void nowLineTick, timeGridNowLineTopPercent());
	$: calendarNow = (void nowLineTick, new Date());

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
	$: doneTask = parseDoneStatusSet(plugin.settings.taskDoneStatuses);
	$: weekStart = (void sRev, plugin.settings.calendarFirstDayOfWeek);
	$: timerLayers = (void sRev, plugin.settings.timer);
	$: scheduleDateMode = (void sRev, plugin.settings.calendarTaskScheduleField);

	let externalCalendarEvents: import("../fulcrum/utils/calendarEvents").CalendarEvent[] = [];
	let externalCalendarLoadId = 0;
	let vaultAtomicNotes: import("../fulcrum/types").AtomicNoteRow[] = [];
	let vaultNotesLoadId = 0;

	let dragOverSlot: CalendarDropSlot | null = null;
	let calendarEventDragActive = false;
	$: taskDragActive = $calendarTaskDragActive;
	$: scheduleDragActive = taskDragActive || calendarEventDragActive;

	function isCalendarScheduleDrag(ev: DragEvent): boolean {
		if (scheduleDragActive) return true;
		const types = ev.dataTransfer?.types;
		if (!types) return false;
		const list = Array.from(types);
		return (
			list.includes(FULCRUM_CALENDAR_TASK_MIME) ||
			list.includes(FULCRUM_CALENDAR_EVENT_MIME)
		);
	}

	function clearScheduleDragState(): void {
		dragOverSlot = null;
		calendarEventDragActive = false;
		setCalendarTaskDragActive(false);
	}

	function onCalendarEventDragStart(ev: DragEvent, e: CalendarEvent): void {
		if (!ev.dataTransfer) return;
		ev.dataTransfer.setData(FULCRUM_CALENDAR_EVENT_MIME, calendarEventDragPayload(e));
		ev.dataTransfer.effectAllowed = "move";
		calendarEventDragActive = true;
	}

	function onCalendarEventDragEnd(): void {
		clearScheduleDragState();
	}

	async function toggleTimerLayer(
		key: "calendarShowTasks" | "calendarShowMeetings" | "calendarShowEvents",
	): Promise<void> {
		await plugin.patchSettings({
			timer: {
				...plugin.settings.timer,
				[key]: !plugin.settings.timer[key],
			},
		});
	}

	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});

	$: dates = gridDates(focalDate, viewMode, weekStart);
	$: startDate = gridStartDate(focalDate, viewMode, weekStart);
	$: dayCount = daysInView(viewMode);
	$: todayIso = todayLocalISODate();

	/** Tasks with scheduled or due date */
	$: datedTasks = snapshot.tasks.filter((t) => {
		const sched = t.scheduledDate?.slice(0, 10);
		const due = t.dueDate?.slice(0, 10);
		return (
			(sched || due) &&
			!isDoneStatus(t.status, doneTask) &&
			taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap, {includeUnlinked: true}) &&
			(!filterProjectPath || t.projectFile?.path === filterProjectPath)
		);
	});

	$: projectColors = projectColorMap(snapshot.projects);

	$: noteAccentCss = filterProjectPath
		? resolveProjectAccentCss(projectColors.get(filterProjectPath))
		: null;

	$: {
		void rev;
		void sRev;
		if (filterProjectPath) {
			vaultAtomicNotes = [];
		} else {
			const id = ++vaultNotesLoadId;
			void plugin.vaultIndex.getAllAtomicNotes(plugin.settings).then((rows) => {
				if (id === vaultNotesLoadId) vaultAtomicNotes = rows;
			}).catch(() => {
				if (id === vaultNotesLoadId) vaultAtomicNotes = [];
			});
		}
	}

	$: notesForCalendar = filterProjectPath ? projectAtomicNotes : vaultAtomicNotes;

	$: {
		void rev;
		void dates;
		void plugin.settings.remindersCalendarIds;
		void plugin.settings.forecastCalendarIds;
		void plugin.settings.conduitEnabled;
		void timerLayers.calendarShowEvents;
		const id = ++externalCalendarLoadId;
		const from = toISODate(startDate);
		const to = toISODate(addDays(startDate, Math.max(dayCount - 1, 0)));
		void (async (): Promise<void> => {
			if (!timerLayers.calendarShowEvents) {
				if (id === externalCalendarLoadId) externalCalendarEvents = [];
				return;
			}
			try {
				const rows = await fetchBridgeCalendarEvents(plugin.settings, from, to);
				if (id === externalCalendarLoadId) externalCalendarEvents = rows;
			} catch {
				if (id === externalCalendarLoadId) externalCalendarEvents = [];
			}
		})();
	}

	/** Unified calendar events (tasks + meetings + optional Bridge calendar events) */
	$: allCalendarEvents = ((): import("../fulcrum/utils/calendarEvents").CalendarEvent[] => {
		void timerLayers.calendarShowTasks;
		void timerLayers.calendarShowMeetings;
		void timerLayers.calendarShowEvents;
		void filterProjectPath;
		void projectAtomicNotes;
		void notesForCalendar;
		void noteAccentCss;
		void externalCalendarEvents;
		const out: import("../fulcrum/utils/calendarEvents").CalendarEvent[] = [];
		if (timerLayers.calendarShowTasks) {
			for (const t of datedTasks) {
				const open = () => plugin.openIndexedTask(t, hoverParentLeaf);
				if (isRecurringParentTask(t)) {
					for (const [idx, iso] of horizonRecurringOccurrenceDates(t, todayIso).entries()) {
						out.push(
							...taskOccurrenceToCalendarEvents(
								t,
								iso,
								idx > 0,
								open,
								projectColors,
							),
						);
					}
				} else {
					for (const e of taskToCalendarEvent(t, open, projectColors)) {
						out.push(e);
					}
				}
			}
		}
		if (timerLayers.calendarShowMeetings) {
			for (const m of snapshot.meetings) {
				if (!meetingPassesAreaFilter(m, snapshot, areaFilter, lifeModeMap)) continue;
				if (filterProjectPath && m.projectFile?.path !== filterProjectPath) continue;
				const e = meetingToCalendarEvent(
					m,
					() => plugin.openLinkedNoteFromFulcrum(m.file.path, hoverParentLeaf),
					projectColors,
				);
				if (e) out.push(e);
			}
		}
		const notesToShow = notesForCalendar.filter((n) => {
			if (filterProjectPath && n.projectFile?.path !== filterProjectPath) return false;
			if (!n.projectFile) return true;
			const fakeMeeting = {file: n.file, projectFile: n.projectFile, title: n.entryTitle};
			return meetingPassesAreaFilter(fakeMeeting, snapshot, areaFilter, lifeModeMap);
		});
		for (const n of notesToShow) {
			const e = atomicNoteToCalendarEvent(
				n,
				() => plugin.openLinkedNoteFromFulcrum(n.file.path, hoverParentLeaf),
				n.projectFile?.path
					? resolveProjectAccentCss(projectColors.get(n.projectFile.path))
					: noteAccentCss,
			);
			if (e) out.push(e);
		}
		if (timerLayers.calendarShowEvents && !filterProjectPath) {
			const meetingsForDedupe = snapshot.meetings.filter((m) =>
				meetingPassesAreaFilter(m, snapshot, areaFilter, lifeModeMap),
			);
			out.push(
				...filterExternalCalendarEventsAgainstMeetings(
					externalCalendarEvents,
					meetingsForDedupe,
				),
			);
		}
		return preferNotesInCalendarEvents(out);
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

	/** Forces grid `{@const}` blocks to re-run when layers, filters, or events change. */
	$: calendarRenderKey = [
		sRev,
		rev,
		JSON.stringify(areaFilter),
		viewMode,
		toISODate(startDate),
		dayCount,
		timerLayers.calendarShowTasks ? "T" : "",
		timerLayers.calendarShowMeetings ? "M" : "",
		timerLayers.calendarShowEvents ? "E" : "",
		allCalendarEvents.length,
		externalCalendarEvents.length,
		projectAtomicNotes.length,
		filterProjectPath ?? "",
		todayIso,
	].join("|");

	function eventsForDate(iso: string): {allDay: CalendarEvent[]; timed: CalendarEvent[]} {
		return eventsByDate.get(iso) ?? {allDay: [], timed: []};
	}

	function onDropZoneDragOver(ev: DragEvent, iso: string, hour: number | null = null): void {
		if (!isCalendarScheduleDrag(ev)) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
		dragOverSlot = {dateIso: iso, hour};
	}

	function onDropZoneDragLeave(
		ev: DragEvent,
		iso: string,
		hour: number | null = null,
	): void {
		const rel = ev.relatedTarget as Node | null;
		const zone = ev.currentTarget as HTMLElement;
		if (rel && zone.contains(rel)) return;
		if (
			dragOverSlot?.dateIso === iso &&
			(dragOverSlot.hour ?? null) === hour
		) {
			dragOverSlot = null;
		}
	}

	async function resolveTaskScheduleField(): Promise<"due" | "scheduled" | null> {
		return resolveTaskScheduleFieldSetting(plugin.app, scheduleDateMode);
	}

	function onTaskEventContextMenu(ev: MouseEvent, e: CalendarEvent): void {
		if (e.kind !== "task" || !e.task) return;
		showFulcrumTaskContextMenu(ev, plugin, e.task, hoverParentLeaf);
	}

	async function onDropZoneDrop(
		ev: DragEvent,
		iso: string,
		hour: number | null = null,
	): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();
		const slot: CalendarDropSlot = {dateIso: iso, hour};
		clearScheduleDragState();

		const eventKey = ev.dataTransfer?.getData(FULCRUM_CALENDAR_EVENT_MIME);
		if (eventKey) {
			const event = findCalendarEventByPayload(allCalendarEvents, eventKey);
			if (!event) {
				new Notice("Calendar item not found — refresh and try again.");
				return;
			}
			let taskField: "due" | "scheduled" | undefined;
			if (event.kind === "task") {
				const picked = await resolveTaskScheduleField();
				if (!picked) return;
				taskField = picked;
			}
			const timerFile = event.timerNotePath
				? plugin.app.vault.getAbstractFileByPath(event.timerNotePath)
				: null;
			const file =
				event.task?.file ??
				event.meeting?.file ??
				(timerFile instanceof TFile ? timerFile : null) ??
				event.planned?.file;
			try {
				const resolved = file
					? waitForNextFileResolved(plugin.app, file)
					: Promise.resolve();
				await applyCalendarEventToSlot(plugin, event, slot, taskField);
				await resolved;
				await plugin.vaultIndex.rebuild();
				if (event.kind === "logged" || event.kind === "planned") {
					plugin.timer.invalidateQuickStartCachesForIntegration();
				}
			} catch (e) {
				console.error(e);
				const msg = e instanceof Error ? e.message : String(e);
				new Notice(msg.length < 120 ? msg : "Could not reschedule.");
			}
			return;
		}

		const key = ev.dataTransfer?.getData(FULCRUM_CALENDAR_TASK_MIME);
		if (!key) return;
		const task = findTaskByDragKey(snapshot.tasks, key);
		if (!task) {
			new Notice("Task not found — try again after the index refreshes.");
			return;
		}
		const field = await resolveTaskScheduleField();
		if (!field) return;
		const needsTasksLayer = !timerLayers.calendarShowTasks;
		try {
			const resolved = waitForNextFileResolved(plugin.app, task.file);
			await applyCalendarEventToSlot(
				plugin,
				{
					kind: "task",
					dateIso: iso,
					startMinutes: hour != null ? hour * 60 : null,
					durationMinutes: null,
					title: taskDisplayTitle(task),
					accentCss: null,
					open: () => plugin.openIndexedTask(task, hoverParentLeaf),
					task,
				},
				slot,
				field,
			);
			await resolved;
			if (needsTasksLayer) {
				await plugin.patchSettings({
					timer: {...plugin.settings.timer, calendarShowTasks: true},
				});
			}
			await plugin.vaultIndex.rebuild();
			if (task.source === "inline") {
				await new Promise((r) => requestAnimationFrame(() => r(undefined)));
				await plugin.vaultIndex.rebuild();
			}
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not schedule task.");
		}
	}

	function dropTargetClass(iso: string, hour: number | null = null): string {
		const active =
			dragOverSlot?.dateIso === iso && (dragOverSlot.hour ?? null) === hour;
		return [
			active ? "fulcrum-calendar__drop-target--active" : "",
			scheduleDragActive ? "fulcrum-calendar__drop-target--droppable" : "",
		]
			.filter(Boolean)
			.join(" ");
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

<svelte:window
	on:dragend={clearScheduleDragState}
	on:drop={clearScheduleDragState}
/>

<div
	class="fulcrum-calendar"
	class:fulcrum-calendar--task-drag-active={scheduleDragActive}
	class:fulcrum-calendar--sidebar-task-drag={taskDragActive}
	class:fulcrum-calendar--gantt-pane={calendarPane === "gantt" && !embedded}
	data-fulcrum-calendar-root
>
	{#if !embedded}
		<div class="fulcrum-calendar__pane-bar" role="tablist" aria-label="Calendar mode">
			<button
				type="button"
				class="fulcrum-calendar__pane-btn"
				class:fulcrum-calendar__pane-btn--active={calendarPane === "schedule"}
				role="tab"
				aria-selected={calendarPane === "schedule"}
				on:click={() => (calendarPane = "schedule")}
			>
				Schedule
			</button>
			<button
				type="button"
				class="fulcrum-calendar__pane-btn"
				class:fulcrum-calendar__pane-btn--active={calendarPane === "gantt"}
				role="tab"
				aria-selected={calendarPane === "gantt"}
				on:click={() => (calendarPane = "gantt")}
			>
				Gantt
			</button>
		</div>
	{/if}

	{#if calendarPane === "gantt" && !embedded}
		<GanttMain {plugin} {hoverParentLeaf} variant="full" embedded={true} />
	{:else}
	<FulcrumViewToolbar ariaLabel="Calendar navigation">
		<svelte:fragment slot="primary">
			<FulcrumDateNavToolbar
				title={titleText}
				onPrev={goPrev}
				onNext={goNext}
				onToday={goToday}
			>
				<label slot="trailing" class="fulcrum-calendar__view-mode">
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
			</FulcrumDateNavToolbar>
		</svelte:fragment>
		<svelte:fragment slot="actions">
			{#if !embedded}
				<TaskToolbarActions {plugin} />
			{/if}
		</svelte:fragment>
	</FulcrumViewToolbar>

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
			class:fulcrum-calendar__layer--on={timerLayers.calendarShowEvents}
			on:click={() => toggleTimerLayer("calendarShowEvents")}
		>Calendar Events</button>
	</div>

	<div class="fulcrum-calendar__scroll">
	{#key calendarRenderKey}
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
									class:fulcrum-calendar__day-cell--today={iso === todayIso}
									role="gridcell"
									data-date={iso}
									data-drop-target=""
									on:dragover={(e) => onDropZoneDragOver(e, iso)}
									on:dragleave={(e) => onDropZoneDragLeave(e, iso)}
									on:drop={(e) => void onDropZoneDrop(e, iso)}
								>
									<span class="fulcrum-calendar__day-num">{formatDayNum(cell.date)}</span>
									<div class="fulcrum-calendar__day-events">
										{#each dayEvents.slice(0, 5) as e (calendarEventKey(e))}
											<CalendarEventChip
												event={e}
												now={calendarNow}
												onDragStart={onCalendarEventDragStart}
												onDragEnd={onCalendarEventDragEnd}
												onContextMenu={onTaskEventContextMenu}
											/>
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
					{@const headIso = toISODate(date)}
					<div
						class="fulcrum-calendar__time-grid-col-head"
						class:fulcrum-calendar__time-grid-col-head--today={headIso === todayIso}
						data-date={headIso}
					>
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
						class:fulcrum-calendar__allday-cell--today={iso === todayIso}
						data-date={iso}
						data-drop-target=""
						on:dragover={(e) => onDropZoneDragOver(e, iso)}
						on:dragleave={(e) => onDropZoneDragLeave(e, iso)}
						on:drop={(e) => void onDropZoneDrop(e, iso)}
					>
						{#each allDay as e (calendarEventKey(e))}
							<CalendarEventChip
								event={e}
								now={calendarNow}
								onDragStart={onCalendarEventDragStart}
								onDragEnd={onCalendarEventDragEnd}
								onContextMenu={onTaskEventContextMenu}
							/>
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
					<div
						class="fulcrum-calendar__time-grid-day-col"
						class:fulcrum-calendar__time-grid-day-col--today={iso === todayIso}
					>
						<div class="fulcrum-calendar__time-slots">
							{#each Array(24) as _, hour}
								<div
									class="fulcrum-calendar__time-slot {dropTargetClass(iso, hour)}"
									data-date={iso}
									data-hour={hour}
									data-drop-target=""
									on:dragover={(e) => onDropZoneDragOver(e, iso, hour)}
									on:dragleave={(e) => onDropZoneDragLeave(e, iso, hour)}
									on:drop={(e) => void onDropZoneDrop(e, iso, hour)}
								></div>
							{/each}
						</div>
						<div class="fulcrum-calendar__day-events-overlay">
							{#each timed as e (calendarEventKey(e))}
								{@const totalMinutes = 24 * 60}
								{@const topPct = ((e.startMinutes ?? 0) / totalMinutes) * 100}
								{@const heightPct = ((e.durationMinutes ?? 30) / totalMinutes) * 100}
								{@const eventPast = occurrenceIsPast(
									e.dateIso,
									e.startMinutes,
									e.durationMinutes,
									calendarNow,
								)}
								<button
									type="button"
									class="fulcrum-calendar__timed-event fulcrum-calendar__timed-event--{e.kind}"
									class:fulcrum-calendar__timed-event--ghost={e.isGhostOccurrence}
									class:fulcrum-calendar__timed-event--past={eventPast}
									style="top: {topPct}%; height: {heightPct}%;{e.accentCss ? ` --fulcrum-event-accent: ${e.accentCss};` : ""}"
									data-fulcrum-calendar-event
									title="{e.title}{e.location ? ` · ${e.location}` : ""}"
									draggable="true"
									on:dragstart={(ev) => { ev.stopPropagation(); onCalendarEventDragStart(ev, e); }}
									on:dragend={onCalendarEventDragEnd}
									on:click={(ev) => { ev.preventDefault(); e.open(); }}
									on:contextmenu={(ev) => onTaskEventContextMenu(ev, e)}
								>
									<span class="fulcrum-calendar__timed-event-icon" aria-hidden="true">
										{#if e.kind === "task"}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
										{:else if e.kind === "note"}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
										{/if}
									</span>
									<span class="fulcrum-calendar__timed-event-title">
										{e.title}{#if e.location}<span class="fulcrum-calendar__timed-event-location"> · {e.location}</span>{/if}
									</span>
								</button>
							{/each}
							{#if iso === todayIso}
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
	{/key}
	</div>
	{/if}
</div>

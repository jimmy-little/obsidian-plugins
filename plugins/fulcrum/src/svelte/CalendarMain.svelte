<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedMeeting, IndexedTask} from "../fulcrum/types";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {
		buildAreaWorkRelatedMap,
		meetingPassesWorkFilter,
		taskPassesWorkFilter,
	} from "../fulcrum/utils/workRelatedProjectFilter";
	import {parseList} from "../fulcrum/settingsDefaults";
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

	$: projectColors = projectColorMap(snapshot.projects);

	/** Unified calendar events (tasks + meetings) */
	$: allCalendarEvents = ((): CalendarEvent[] => {
		const out: CalendarEvent[] = [];
		for (const t of datedTasks) {
			for (const e of taskToCalendarEvent(
				t,
				() => plugin.openIndexedTask(t, hoverParentLeaf),
				projectColors,
			)) {
				out.push(e);
			}
		}
		for (const m of snapshot.meetings) {
			if (!meetingPassesWorkFilter(m, snapshot, onlyWork, areaWorkMap)) continue;
			const e = meetingToCalendarEvent(
				m,
				() => plugin.openLinkedNoteFromFulcrum(m.file.path, hoverParentLeaf),
				projectColors,
			);
			if (e) out.push(e);
		}
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

	/** For month view: legacy tasks/meetings by date (no CalendarEvent wrapper) */
	$: tasksByDate = (() => {
		const m = new Map<string, IndexedTask[]>();
		for (const t of datedTasks) {
			const sched = t.scheduledDate?.slice(0, 10);
			const due = t.dueDate?.slice(0, 10);
			for (const key of [sched, due].filter(Boolean) as string[]) {
				const cur = m.get(key) ?? [];
				if (!cur.includes(t)) cur.push(t);
				m.set(key, cur);
			}
		}
		return m;
	})();

	$: meetingsByDate = (() => {
		const m = new Map<string, IndexedMeeting[]>();
		for (const mt of snapshot.meetings) {
			if (!meetingPassesWorkFilter(mt, snapshot, onlyWork, areaWorkMap)) continue;
			const key = mt.date?.slice(0, 10) ?? "";
			if (!key) continue;
			const cur = m.get(key) ?? [];
			cur.push(mt);
			m.set(key, cur);
		}
		return m;
	})();

	function legacyEventsForDate(iso: string): {tasks: IndexedTask[]; meetings: IndexedMeeting[]} {
		return {
			tasks: tasksByDate.get(iso) ?? [],
			meetings: meetingsByDate.get(iso) ?? [],
		};
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

<div class="fulcrum-calendar" data-fulcrum-calendar-root>
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
								{@const {tasks, meetings} = legacyEventsForDate(iso)}
								{@const hasEvents = tasks.length > 0 || meetings.length > 0}
								<div
									class="fulcrum-calendar__day-cell"
									class:fulcrum-calendar__day-cell--other-month={!cell.isCurrentMonth}
									class:fulcrum-calendar__day-cell--has-events={hasEvents}
									role="gridcell"
									data-date={iso}
									data-drop-target=""
								>
									<span class="fulcrum-calendar__day-num">{formatDayNum(cell.date)}</span>
									<div class="fulcrum-calendar__day-events">
										{#each tasks.slice(0, 3) as t (t.file.path + (t.line ?? ""))}
											{@const accent = t.projectFile && projectColors.get(t.projectFile.path) ? resolveProjectAccentCss(projectColors.get(t.projectFile.path)) : null}
											<button
												type="button"
												class="fulcrum-calendar__event fulcrum-calendar__event--task"
												style={accent ? `--fulcrum-event-accent: ${accent}` : undefined}
												data-fulcrum-calendar-event
												data-task-path={t.file.path}
												data-task-line={t.line ?? ""}
												data-draggable-placeholder=""
												on:click={() => plugin.openIndexedTask(t, hoverParentLeaf)}
											>
												<span class="fulcrum-calendar__event-icon" aria-hidden="true">
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
												</span>
												{t.title}
											</button>
										{/each}
										{#each meetings.slice(0, 2) as m (m.file.path)}
											{@const accent = m.projectFile && projectColors.get(m.projectFile.path) ? resolveProjectAccentCss(projectColors.get(m.projectFile.path)) : null}
											<button
												type="button"
												class="fulcrum-calendar__event fulcrum-calendar__event--meeting"
												style={accent ? `--fulcrum-event-accent: ${accent}` : undefined}
												data-fulcrum-calendar-event
												data-meeting-path={m.file.path}
												data-draggable-placeholder=""
												on:click={() => plugin.openLinkedNoteFromFulcrum(m.file.path, hoverParentLeaf)}
											>
												<span class="fulcrum-calendar__event-icon" aria-hidden="true">
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
												</span>
												{m.title ?? "Meeting"}
											</button>
										{/each}
										{#if tasks.length + meetings.length > 5}
											<span class="fulcrum-calendar__more">
												+{tasks.length + meetings.length - 5} more
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
					<div class="fulcrum-calendar__allday-cell" data-date={iso} data-drop-target="">
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
								{e.title}
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
								<div class="fulcrum-calendar__time-slot" data-date={iso} data-hour={hour} data-drop-target=""></div>
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
</div>

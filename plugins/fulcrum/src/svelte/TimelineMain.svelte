<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import FulcrumDateNavToolbar from "./shared/FulcrumDateNavToolbar.svelte";
	import FulcrumGlobalFilterStrip from "./shared/FulcrumGlobalFilterStrip.svelte";
	import {areaFilterState, indexRevision, settingsRevision} from "../fulcrum/stores";
	import {
		buildAreaLifeModeMap,
		meetingPassesAreaFilter,
		taskPassesAreaFilter,
	} from "../fulcrum/utils/areaFocusFilter";
	import {isDoneStatus, parseDoneStatusSet, parseList} from "../fulcrum/settingsDefaults";
	import {addDaysIso, todayLocalISODate} from "../fulcrum/utils/dates";
	import {
		formatDayNum,
		formatDayShort,
		formatTimelineHourLabel,
		layoutTimedBlockInWindow,
		resolveTimelineDisplayWindow,
		timeGridNowLineTopPercentInWindow,
	} from "../fulcrum/utils/calendarGrid";
	import {
		taskToCalendarEvent,
		meetingToCalendarEvent,
		plannerEventToCalendarEvent,
		projectColorMap,
		type CalendarEvent,
	} from "../fulcrum/utils/calendarEvents";
	import {buildTimerCalendarOverlay} from "../fulcrum/utils/timerCalendarOverlay";
	import {showFulcrumTaskContextMenu} from "../fulcrum/taskContextMenu";
	import TimelineActiveTimerBlock from "./TimelineActiveTimerBlock.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	/** YYYY-MM-DD */
	export let focalDateIso: string;
	export let onFocalIsoChange: (iso: string) => void;

	let nowLineTick = 0;
	onMount(() => {
		const id = window.setInterval(() => {
			nowLineTick += 1;
		}, 90_000);
		return () => window.clearInterval(id);
	});

	$: timelineWindow = (void $settingsRevision, resolveTimelineDisplayWindow(
		plugin.settings.timelineStartOfDay,
		plugin.settings.timelineHoursToDisplay,
	));

	$: nowLineTopPct = (void nowLineTick, timeGridNowLineTopPercentInWindow(timelineWindow));

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: doneTask = (void $settingsRevision, parseDoneStatusSet(plugin.settings.taskDoneStatuses));
	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});

	/** Single day shown; used to keep completed tasks that still “belong” on this day. */
	$: iso = focalDateIso.slice(0, 10);

	/**
	 * Like the main calendar for open tasks, but keep done tasks when their blocks
	 * (scheduled / due / actual time) still fall on `iso` so the day reference stays accurate.
	 */
	$: datedTasks = snapshot.tasks.filter((t) => {
		if (
			!taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap, {
				includeUnlinked: true,
			})
		) {
			return false;
		}
		const sched = t.scheduledDate?.slice(0, 10);
		const due = t.dueDate?.slice(0, 10);
		const hasSchedOrDue = !!(sched || due);
		const hasActualBlock = !!(t.startTime?.trim() && t.endTime?.trim());
		if (!hasSchedOrDue && !hasActualBlock) return false;

		if (!isDoneStatus(t.status, doneTask)) {
			return hasSchedOrDue;
		}
		const ev = taskToCalendarEvent(t, () => {}, new Map<string, string>());
		return ev.some((e) => e.dateIso === iso);
	});

	$: projectColors = projectColorMap(snapshot.projects);

	$: plannerDefaultDur = (void $settingsRevision, plugin.settings.plannerDefaultDurationMinutes);

	$: timerLayers = (void $settingsRevision, plugin.settings.timer);

	let timerOverlayEvents: CalendarEvent[] = [];
	let timerOverlayLoadId = 0;

	$: {
		void rev;
		void iso;
		void timerLayers.calendarShowLogged;
		void timerLayers.calendarShowPlanned;
		const id = ++timerOverlayLoadId;
		const dayStart = new Date(iso + "T00:00:00");
		const dayEnd = new Date(iso + "T23:59:59");
		void (async (): Promise<void> => {
			if (!timerLayers.calendarShowLogged && !timerLayers.calendarShowPlanned) {
				if (id === timerOverlayLoadId) timerOverlayEvents = [];
				return;
			}
			const overlay = await buildTimerCalendarOverlay(
				plugin.timer,
				dayStart,
				dayEnd,
				{
					showLogged: timerLayers.calendarShowLogged,
					showPlanned: timerLayers.calendarShowPlanned,
				},
				(path) => plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf),
			);
			if (id === timerOverlayLoadId) timerOverlayEvents = overlay;
		})();
	}

	$: staticTimerEvents = timerOverlayEvents.filter((e) => !e.isActiveTimer);
	$: activeTimerEvents = timerOverlayEvents.filter((e) => e.isActiveTimer && e.dateIso === iso);

	$: allCalendarEvents = ((): CalendarEvent[] => {
		const out: CalendarEvent[] = [];
		const plannerLineKeys = new Set<string>();

		for (const p of snapshot.plannerEvents ?? []) {
			if (p.dateIso !== iso) continue;
			plannerLineKeys.add(`${p.file.path}:${p.line}`);
			out.push(
				plannerEventToCalendarEvent(
					p,
					() => plugin.openPlannerEvent(p, hoverParentLeaf),
					plannerDefaultDur,
					projectColors,
				),
			);
		}

		for (const t of datedTasks) {
			const lineKey =
				t.line != null ? `${t.file.path}:${t.line}` : null;
			for (const e of taskToCalendarEvent(
				t,
				() => plugin.openIndexedTask(t, hoverParentLeaf),
				projectColors,
			)) {
				if (e.dateIso !== iso) continue;
				if (lineKey && plannerLineKeys.has(lineKey)) continue;
				out.push(e);
			}
		}
		for (const m of snapshot.meetings) {
			if (!meetingPassesAreaFilter(m, snapshot, areaFilter, lifeModeMap)) continue;
			const e = meetingToCalendarEvent(
				m,
				() => plugin.openLinkedNoteFromFulcrum(m.file.path, hoverParentLeaf),
				projectColors,
			);
			if (e && e.dateIso === iso) out.push(e);
		}
		for (const e of staticTimerEvents) {
			if (e.dateIso === iso) out.push(e);
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

	$: ({allDay, timed} = eventsByDate.get(iso) ?? {allDay: [], timed: []});

	$: titleText = (() => {
		const d = new Date(iso + "T12:00:00");
		if (Number.isNaN(d.getTime())) return iso;
		return `${formatDayShort(d)} ${formatDayNum(d)} · ${new Intl.DateTimeFormat("en-US", {
			month: "short",
			year: "numeric",
		}).format(d)}`;
	})();

	$: isToday = iso === todayLocalISODate();

	function goPrev(): void {
		onFocalIsoChange(addDaysIso(iso, -1));
	}

	function goNext(): void {
		onFocalIsoChange(addDaysIso(iso, 1));
	}

	function timedEventKey(e: CalendarEvent): string {
		if (e.planner) return `${e.planner.file.path}:${e.planner.line}:${e.startMinutes}`;
		if (e.task) return `${e.task.file.path}:${e.task.line ?? ""}:${e.startMinutes}`;
		if (e.timerEntryId) return `timer:${e.timerEntryId}:${e.startMinutes}`;
		return `${e.meeting?.file.path ?? e.kind}:${e.startMinutes}`;
	}

	function onTaskEventContextMenu(ev: MouseEvent, e: CalendarEvent): void {
		if (e.kind !== "task" || !e.task) return;
		showFulcrumTaskContextMenu(ev, plugin, e.task, hoverParentLeaf);
	}

	function goToday(): void {
		onFocalIsoChange(todayLocalISODate());
	}

	$: plannerEnabled = (void $settingsRevision, plugin.settings.timelineDailyPlannerEnabled);

	let addingBlock = false;
	async function addTimeBlock(): Promise<void> {
		if (addingBlock || !plannerEnabled) return;
		addingBlock = true;
		try {
			await plugin.appendTimeBlockToDailyNote(iso, hoverParentLeaf);
		} finally {
			addingBlock = false;
		}
	}
</script>

<div class="fulcrum-timeline fulcrum-standalone-with-filter" data-fulcrum-timeline-root>
	<div class="fulcrum-standalone-with-filter__main">
	<div class="fulcrum-timeline__toolbar-row">
		<FulcrumDateNavToolbar
			className="fulcrum-timeline__toolbar"
			title={titleText}
			titleClass={isToday ? "fulcrum-timeline__title fulcrum-timeline__title--today" : "fulcrum-timeline__title"}
			prevAriaLabel="Previous day"
			nextAriaLabel="Next day"
			onPrev={goPrev}
			onNext={goNext}
			onToday={goToday}
		/>
		{#if plannerEnabled}
			<button
				type="button"
				class="fulcrum-timeline__add-block"
				disabled={addingBlock}
				aria-label="Add time block"
				on:click={addTimeBlock}
			>
				<svg
					class="fulcrum-timeline__add-block-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>
				<span>Add time block</span>
			</button>
		{/if}
	</div>

	<div
		class="fulcrum-calendar__time-grid"
		role="grid"
		aria-label="Day timeline"
		style="--fulcrum-cal-cols: 1; --fulcrum-cal-hours: {timelineWindow.hourCount}"
	>
		<div class="fulcrum-calendar__time-grid-header">
			<div class="fulcrum-calendar__time-grid-spacer"></div>
			<div class="fulcrum-calendar__time-grid-col-head" data-date={iso}></div>
		</div>
		<div class="fulcrum-calendar__allday-row">
			<div class="fulcrum-calendar__time-grid-hour">All day</div>
			<div class="fulcrum-calendar__allday-cell" data-date={iso}>
				{#each allDay as e (e.planner ? `${e.planner.file.path}:${e.planner.line}` : e.task ? `${e.task.file.path}:${e.task.line ?? ""}` : (e.meeting?.file.path ?? ""))}
					<button
						type="button"
						class="fulcrum-calendar__event fulcrum-calendar__event--{e.kind}"
						class:fulcrum-calendar__event--completed={(e.kind === "task" &&
							e.task &&
							isDoneStatus(e.task.status, doneTask)) ||
							(e.kind === "planner" && e.planner?.status === "done")}
						style={e.accentCss ? `--fulcrum-event-accent: ${e.accentCss}` : undefined}
						data-fulcrum-calendar-event
						on:click={(ev) => {
							ev.preventDefault();
							e.open();
						}}
						on:contextmenu={(ev) => onTaskEventContextMenu(ev, e)}
					>
						<span class="fulcrum-calendar__event-icon" aria-hidden="true">
							{#if e.kind === "task"}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
							{:else if e.kind === "planner"}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
							{/if}
						</span>
						{e.title}
					</button>
				{/each}
			</div>
		</div>
		<div class="fulcrum-calendar__time-grid-body">
			<div class="fulcrum-calendar__time-grid-hour-col">
				{#each timelineWindow.rowStartMinutes as rowStart}
					<div class="fulcrum-calendar__time-grid-hour">
						{formatTimelineHourLabel(rowStart)}
					</div>
				{/each}
			</div>
			<div class="fulcrum-calendar__time-grid-day-col">
				<div class="fulcrum-calendar__time-slots">
					{#each timelineWindow.rowStartMinutes as rowStart}
						<div
							class="fulcrum-calendar__time-slot"
							data-date={iso}
							data-hour={Math.floor(rowStart / 60)}
						></div>
					{/each}
				</div>
				<div class="fulcrum-calendar__day-events-overlay">
					{#each timed as e (timedEventKey(e))}
						{@const layout =
							e.startMinutes != null
								? layoutTimedBlockInWindow(
										e.startMinutes,
										e.durationMinutes ?? 30,
										timelineWindow,
									)
								: null}
						{#if layout}
						<button
							type="button"
							class="fulcrum-calendar__timed-event fulcrum-calendar__timed-event--{e.kind}"
							class:fulcrum-calendar__timed-event--completed={(e.kind === "task" &&
								e.task &&
								isDoneStatus(e.task.status, doneTask)) ||
								(e.kind === "planner" && e.planner?.status === "done")}
							style="top: {layout.topPct}%; height: {layout.heightPct}%;{e.accentCss ? ` --fulcrum-event-accent: ${e.accentCss};` : ""}"
							data-fulcrum-calendar-event
							on:click={(ev) => {
								ev.preventDefault();
								e.open();
							}}
							on:contextmenu={(ev) => onTaskEventContextMenu(ev, e)}
						>
							<span class="fulcrum-calendar__timed-event-icon" aria-hidden="true">
								{#if e.kind === "task"}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
								{:else if e.kind === "planner"}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
								{:else if e.kind === "logged" || e.kind === "planned"}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
								{:else}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
								{/if}
							</span>
							<span class="fulcrum-calendar__timed-event-title">{e.title}</span>
						</button>
						{/if}
					{/each}
					{#each activeTimerEvents as e (e.timerEntryId)}
						{#if e.startMinutes != null && e.timerStartMs != null}
							<TimelineActiveTimerBlock
								startMinutes={e.startMinutes}
								startTimeMs={e.timerStartMs}
								title={e.title}
								accentCss={e.accentCss}
								windowStartMinutes={timelineWindow.startMinutes}
								windowTotalMinutes={timelineWindow.totalMinutes}
								onOpen={e.open}
							/>
						{/if}
					{/each}
					{#if isToday && nowLineTopPct != null}
						<div
							class="fulcrum-calendar__now-line"
							style="top: {nowLineTopPct}%"
							aria-hidden="true"
						></div>
					{/if}
				</div>
			</div>
		</div>
	</div>
	</div>
	<FulcrumGlobalFilterStrip {plugin} />
</div>

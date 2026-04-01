<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {
		buildAreaWorkRelatedMap,
		meetingPassesWorkFilter,
		taskPassesWorkFilter,
	} from "../fulcrum/utils/workRelatedProjectFilter";
	import {parseList} from "../fulcrum/settingsDefaults";
	import {addDaysIso, todayLocalISODate} from "../fulcrum/utils/dates";
	import {
		formatDayNum,
		formatDayShort,
		timeGridNowLineTopPercent,
	} from "../fulcrum/utils/calendarGrid";
	import {
		taskToCalendarEvent,
		meetingToCalendarEvent,
		projectColorMap,
		type CalendarEvent,
	} from "../fulcrum/utils/calendarEvents";

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

	$: nowLineTopPct = (void nowLineTick, timeGridNowLineTopPercent());

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: doneTask = (void $settingsRevision, new Set(parseList(plugin.settings.taskDoneStatuses)));
	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas);
	$: onlyWork = $workRelatedOnly;

	/** Single day shown; used to keep completed tasks that still “belong” on this day. */
	$: iso = focalDateIso.slice(0, 10);

	/**
	 * Like the main calendar for open tasks, but keep done tasks when their blocks
	 * (scheduled / due / actual time) still fall on `iso` so the day reference stays accurate.
	 */
	$: datedTasks = snapshot.tasks.filter((t) => {
		if (!taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap)) return false;
		const sched = t.scheduledDate?.slice(0, 10);
		const due = t.dueDate?.slice(0, 10);
		const hasSchedOrDue = !!(sched || due);
		const hasActualBlock = !!(t.startTime?.trim() && t.endTime?.trim());
		if (!hasSchedOrDue && !hasActualBlock) return false;

		if (!doneTask.has(t.status)) {
			return hasSchedOrDue;
		}
		const ev = taskToCalendarEvent(t, () => {}, new Map<string, string>());
		return ev.some((e) => e.dateIso === iso);
	});

	$: projectColors = projectColorMap(snapshot.projects);

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

	function goToday(): void {
		onFocalIsoChange(todayLocalISODate());
	}
</script>

<div class="fulcrum-timeline" data-fulcrum-timeline-root>
	<div class="fulcrum-timeline__toolbar fulcrum-calendar__toolbar">
		<button type="button" class="fulcrum-calendar__nav-btn" aria-label="Previous day" on:click={goPrev}>
			‹
		</button>
		<button type="button" class="fulcrum-calendar__nav-btn" aria-label="Next day" on:click={goNext}>
			›
		</button>
		<h2 class="fulcrum-timeline__title fulcrum-calendar__title" class:fulcrum-timeline__title--today={isToday}>
			{titleText}
		</h2>
		<button type="button" class="fulcrum-calendar__today" on:click={goToday}>Today</button>
	</div>

	<div
		class="fulcrum-calendar__time-grid"
		role="grid"
		aria-label="Day timeline"
		style="--fulcrum-cal-cols: 1"
	>
		<div class="fulcrum-calendar__time-grid-header">
			<div class="fulcrum-calendar__time-grid-spacer"></div>
			<div class="fulcrum-calendar__time-grid-col-head" data-date={iso}></div>
		</div>
		<div class="fulcrum-calendar__allday-row">
			<div class="fulcrum-calendar__time-grid-hour">All day</div>
			<div class="fulcrum-calendar__allday-cell" data-date={iso}>
				{#each allDay as e (e.task ? `${e.task.file.path}:${e.task.line ?? ""}` : (e.meeting?.file.path ?? ""))}
					<button
						type="button"
						class="fulcrum-calendar__event fulcrum-calendar__event--{e.kind}"
						class:fulcrum-calendar__event--completed={e.kind === "task" &&
							e.task &&
							doneTask.has(e.task.status)}
						style={e.accentCss ? `--fulcrum-event-accent: ${e.accentCss}` : undefined}
						data-fulcrum-calendar-event
						on:click={(ev) => {
							ev.preventDefault();
							e.open();
						}}
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
		</div>
		<div class="fulcrum-calendar__time-grid-body">
			<div class="fulcrum-calendar__time-grid-hour-col">
				{#each Array(24) as _, hour}
					<div class="fulcrum-calendar__time-grid-hour">
						{hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
					</div>
				{/each}
			</div>
			<div class="fulcrum-calendar__time-grid-day-col">
				<div class="fulcrum-calendar__time-slots">
					{#each Array(24) as _, hour}
						<div class="fulcrum-calendar__time-slot" data-date={iso} data-hour={hour}></div>
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
							class:fulcrum-calendar__timed-event--completed={e.kind === "task" &&
								e.task &&
								doneTask.has(e.task.status)}
							style="top: {topPct}%; height: {heightPct}%;{e.accentCss ? ` --fulcrum-event-accent: ${e.accentCss};` : ""}"
							data-fulcrum-calendar-event
							on:click={(ev) => {
								ev.preventDefault();
								e.open();
							}}
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
					{#if isToday}
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

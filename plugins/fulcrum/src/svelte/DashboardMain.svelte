<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {Menu} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {ProjectLogActivityEntry} from "../fulcrum/projectNote";
	import type {IndexedMeeting, ProjectRollup} from "../fulcrum/types";
	import {areaFilterState, indexRevision, settingsRevision, calendarTaskDragActive, setCalendarTaskDragActive} from "../fulcrum/stores";
	import {
		buildAreaLifeModeMap,
		filterProjectsByAreaFocus,
		meetingPassesAreaFilter,
		taskPassesAreaFilter,
	} from "../fulcrum/utils/areaFocusFilter";
	import {
		isDoneStatus,
		isProjectDone,
		parseDoneStatusSet,
		parseTaskStatusChoices,
		DASHBOARD_ACTIVITY_MAX_DAYS,
		DASHBOARD_ACTIVITY_MAX_ROWS,
	} from "../fulcrum/settingsDefaults";
	import type {IndexedProject} from "../fulcrum/types";
	import {
		buildProjectSidebarCounts,
		bucketDashboardAttentionProjects,
		projectReviewIsOverdue,
	} from "../fulcrum/utils/projectSidebarCounts";
	import {
		todayLocalISODate,
		isDueToday,
		isOverdue,
		dayStartMs,
		formatTrackedMinutesShort,
	} from "../fulcrum/utils/dates";
	import {
		toISODate,
		formatDayShort,
		dashboardMeetingGridDates,
		loadDashboardWeekSpan,
		saveDashboardWeekSpan,
		loadDashboardWeekAnchor,
		saveDashboardWeekAnchor,
		loadDashboardWeekShowTasks,
		saveDashboardWeekShowTasks,
		type DashboardWeekSpan,
		type DashboardWeekAnchor,
	} from "../fulcrum/utils/calendarGrid";
	import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";
	import {
		buildAggregatedActivityRows,
		type ActivityRowModel,
	} from "../fulcrum/utils/projectActivity";
	import {
		calendarEventKey,
		projectColorMap,
		taskDueDateToCalendarEvent,
		type CalendarEvent,
	} from "../fulcrum/utils/calendarEvents";
	import {handleTasksViewDateDrop, tasksViewDragOver} from "../fulcrum/tasks/tasksViewDnD";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		calendarTaskDragKey,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import {showFulcrumTaskContextMenu} from "../fulcrum/taskContextMenu";
	import TaskCard from "./TaskCard.svelte";
	import CalendarEventChip from "./CalendarEventChip.svelte";
	import {loadActivityFeedPreviews} from "../fulcrum/loadActivityFeedPreviews";
	import ActivityRow from "./ActivityRow.svelte";
	import ProjectListRow from "./ProjectListRow.svelte";
	import TaskSectionHead from "./TaskSectionHead.svelte";
	import GanttMain from "./GanttMain.svelte";
	import FulcrumDateNavToolbar from "./shared/FulcrumDateNavToolbar.svelte";
	import DashboardActiveTimers from "./DashboardActiveTimers.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = parseDoneStatusSet(plugin.settings.taskDoneStatuses);

	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});

	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);

	/** Active projects that qualify for any attention bucket; split by priority (review → tasks → meetings). */
	$: attentionBuckets = (void sRev, (() => {
		const settings = plugin.settings;
		const candidates = filterProjectsByAreaFocus(
			snapshot.projects.filter((p) => !isProjectDone(p, settings)),
			areaFilter,
			lifeModeMap,
		);
		const withSignals = candidates.filter((p) => {
			const c = projectCounts.get(p.file.path);
			const openTasks = c?.openTasks ?? 0;
			const upcomingMeetings = c?.upcomingMeetings ?? 0;
			return projectReviewIsOverdue(p) || openTasks > 0 || upcomingMeetings > 0;
		});
		return bucketDashboardAttentionProjects(withSignals, projectCounts);
	})());

	$: attentionAny =
		attentionBuckets.needsReview.length +
			attentionBuckets.openActionItems.length +
			attentionBuckets.upcomingMeetings.length >
		0;

	$: tasksDueToday = snapshot.tasks.filter(
		(t) =>
			t.projectFile &&
			!isDoneStatus(t.status, doneTask) &&
			isDueToday(t.dueDate, false) &&
			taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap),
	);
	$: overdueTasks = snapshot.tasks.filter(
		(t) =>
			t.projectFile &&
			!isDoneStatus(t.status, doneTask) &&
			isOverdue(t.dueDate, false) &&
			taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap),
	);
	$: meetingsToday = snapshot.meetings.filter(
		(m) =>
			m.date?.slice(0, 10) === todayLocalISODate() &&
			meetingPassesAreaFilter(m, snapshot, areaFilter, lifeModeMap),
	);
	$: completedThisWeek = snapshot.tasks.filter((t) => {
		if (!taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap)) return false;
		if (!isDoneStatus(t.status, doneTask) || !t.completedDate) return false;
		const c = Date.parse(t.completedDate.slice(0, 10));
		if (Number.isNaN(c)) return false;
		const weekAgo = dayStartMs(new Date(Date.now() - 7 * 86400000));
		return c >= weekAgo;
	});

	/** 0 = anchor week containing today; ±1 = adjacent periods. */
	let weekOffset = 0;
	let weekSpan: DashboardWeekSpan = loadDashboardWeekSpan();
	let weekAnchor: DashboardWeekAnchor = loadDashboardWeekAnchor();
	let weekShowTasks = loadDashboardWeekShowTasks();
	let weekDropTargetIso: string | null = null;
	$: taskDragActive = $calendarTaskDragActive;

	$: meetingGridDays = ((): {iso: string; dayLabel: string; dayNum: string}[] => {
		void sRev;
		void weekOffset;
		void weekSpan;
		void weekAnchor;
		return dashboardMeetingGridDates({
			span: weekSpan,
			anchor: weekAnchor,
			weekOffset,
		}).map((d) => ({
			iso: toISODate(d),
			dayLabel: formatDayShort(d),
			dayNum: String(d.getDate()),
		}));
	})();

	$: meetingsByDate = ((): Map<string, IndexedMeeting[]> => {
		if (meetingGridDays.length === 0) return new Map();
		const startIso = meetingGridDays[0]!.iso;
		const endIso = meetingGridDays[meetingGridDays.length - 1]!.iso;
		const m = new Map<string, IndexedMeeting[]>();
		for (const mt of snapshot.meetings) {
			if (!meetingPassesAreaFilter(mt, snapshot, areaFilter, lifeModeMap)) continue;
			const key = mt.date?.slice(0, 10) ?? "";
			if (!key || key.length < 10) continue;
			if (key < startIso || key > endIso) continue;
			const cur = m.get(key) ?? [];
			cur.push(mt);
			m.set(key, cur);
		}
		for (const [, arr] of m) {
			arr.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
		}
		return m;
	})();

	$: projectColors = projectColorMap(snapshot.projects);

	/** Due-dated open tasks for the visible week, untimed first then by time. */
	$: dueTasksByDate = ((): Map<string, {untimed: CalendarEvent[]; timed: CalendarEvent[]}> => {
		const out = new Map<string, {untimed: CalendarEvent[]; timed: CalendarEvent[]}>();
		if (!weekShowTasks || meetingGridDays.length === 0) return out;
		const startIso = meetingGridDays[0]!.iso;
		const endIso = meetingGridDays[meetingGridDays.length - 1]!.iso;
		for (const t of snapshot.tasks) {
			if (isDoneStatus(t.status, doneTask)) continue;
			if (!taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap)) continue;
			const dueKey = t.dueDate?.slice(0, 10) ?? "";
			if (!dueKey || dueKey.length < 10) continue;
			if (dueKey < startIso || dueKey > endIso) continue;
			const ev = taskDueDateToCalendarEvent(
				t,
				() => plugin.openIndexedTask(t, hoverParentLeaf),
				projectColors,
			);
			if (!ev) continue;
			const bucket = out.get(dueKey) ?? {untimed: [], timed: []};
			if (ev.startMinutes == null) bucket.untimed.push(ev);
			else bucket.timed.push(ev);
			out.set(dueKey, bucket);
		}
		for (const bucket of out.values()) {
			bucket.timed.sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
		}
		return out;
	})();

	function dueTasksForDay(iso: string): {untimed: CalendarEvent[]; timed: CalendarEvent[]} {
		return dueTasksByDate.get(iso) ?? {untimed: [], timed: []};
	}

	$: todayTasks = snapshot.tasks
		.filter(
			(t) =>
				t.projectFile &&
				!isDoneStatus(t.status, doneTask) &&
				isDueToday(t.dueDate, false) &&
				taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap),
		)
		.slice(0, 20);

	$: pastDueTasks = overdueTasks.slice(0, 30);

	let aggregatedActivity: ActivityRowModel[] = [];
	let aggregatedActivityLoadId = 0;

	$: {
		void rev;
		void sRev;
		void areaFilter;
		void lifeModeMap;
		const active = filterProjectsByAreaFocus(
			plugin.vaultIndex.getActiveProjects(plugin.settings),
			areaFilter,
			lifeModeMap,
		);
		const loadId = ++aggregatedActivityLoadId;
		const load = async (): Promise<void> => {
			const inputs = await Promise.all(
				active.map(async (p) => {
					const rollup = await plugin.vaultIndex.getProjectRollup(
						p.file.path,
						plugin.settings,
					);
					if (!rollup) return null;
					const logEntries = await plugin.loadProjectLogActivity(p.file.path);
					return {rollup, logEntries};
				}),
			);
			if (loadId !== aggregatedActivityLoadId) return;
			const valid = inputs.filter(
				(x): x is {rollup: ProjectRollup; logEntries: ProjectLogActivityEntry[]} =>
					x != null,
			);
			const days = Math.min(
				DASHBOARD_ACTIVITY_MAX_DAYS,
				Math.max(1, plugin.settings.globalActivityDisplayDays ?? DASHBOARD_ACTIVITY_MAX_DAYS),
			);
			aggregatedActivity = buildAggregatedActivityRows(valid, {
				doneTask,
				openPath: openFile,
				openTask: (t) => plugin.openIndexedTask(t, hoverParentLeaf),
				openProject: (path) => openFile(path),
				formatTracked: formatTrackedMinutesShort,
				lastNDaysMs: days * 86400000,
			}).slice(0, DASHBOARD_ACTIVITY_MAX_ROWS);
		};
		void load();
	}

	let dashActivityPreviews: Record<string, string> = {};

	$: dashActivityFeedKey =
		aggregatedActivity.length > 0
			? `${rev}\u0000${aggregatedActivity.map((r) => r.id).join("\u0000")}\u0000${plugin.settings.atomicNoteEntryField}`
			: "";

	$: if (dashActivityFeedKey) {
		const key = dashActivityFeedKey;
		const rows = aggregatedActivity;
		const vault = plugin.app.vault;
		const entryField = plugin.settings.atomicNoteEntryField;
		void loadActivityFeedPreviews(vault, rows, entryField, 10).then((m) => {
			if (key !== dashActivityFeedKey) return;
			dashActivityPreviews = m;
		});
	} else {
		dashActivityPreviews = {};
	}

	function openFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	function openProjectSummary(path: string): void {
		void plugin.openProjectSummary(path);
	}

	/** Short time label for calendar event blocks (local). */
	function meetingTimeLabel(m: IndexedMeeting): string {
		const raw = m.date?.trim() ?? "";
		if (raw.length > 10) {
			const ms = Date.parse(raw);
			if (!Number.isNaN(ms)) {
				return new Intl.DateTimeFormat(undefined, {
					hour: "numeric",
					minute: "2-digit",
				}).format(ms);
			}
		}
		return "";
	}

	function meetingAccent(m: IndexedMeeting): string {
		const path = m.projectFile?.path;
		if (!path) return resolveProjectAccentCss(undefined);
		const proj = snapshot.projects.find((p) => p.file.path === path);
		return resolveProjectAccentCss(proj?.color);
	}

	function dashboardWeekPrev(): void {
		weekOffset -= 1;
	}

	function dashboardWeekThis(): void {
		weekOffset = 0;
	}

	function dashboardWeekNext(): void {
		weekOffset += 1;
	}

	function toggleDashboardWeekTasks(): void {
		weekShowTasks = !weekShowTasks;
		saveDashboardWeekShowTasks(weekShowTasks);
	}

	function onWeekDayDragOver(ev: DragEvent, iso: string): void {
		tasksViewDragOver(ev);
		if (ev.defaultPrevented) weekDropTargetIso = iso;
	}

	function onWeekDayDragLeave(ev: DragEvent, iso: string): void {
		const rel = ev.relatedTarget as Node | null;
		const zone = ev.currentTarget as HTMLElement;
		if (rel && zone.contains(rel)) return;
		if (weekDropTargetIso === iso) weekDropTargetIso = null;
	}

	async function onWeekDayDrop(ev: DragEvent, iso: string): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();
		weekDropTargetIso = null;
		if (!ev.dataTransfer) return;
		const ok = await handleTasksViewDateDrop(plugin, ev.dataTransfer, iso);
		if (ok && !weekShowTasks) {
			weekShowTasks = true;
			saveDashboardWeekShowTasks(true);
		}
	}

	function onWeekTaskContextMenu(ev: MouseEvent, e: CalendarEvent): void {
		if (e.kind !== "task" || !e.task) return;
		showFulcrumTaskContextMenu(ev, plugin, e.task, hoverParentLeaf);
	}

	function onWeekTaskDragStart(ev: DragEvent, e: CalendarEvent): void {
		if (!e.task || !ev.dataTransfer) return;
		ev.dataTransfer.setData(FULCRUM_CALENDAR_TASK_MIME, calendarTaskDragKey(e.task));
		ev.dataTransfer.effectAllowed = "move";
		setCalendarTaskDragActive(true);
	}

	function onWeekTaskDragEnd(): void {
		setCalendarTaskDragActive(false);
	}

	function openDashboardWeekMenu(ev: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("Work Week");
			item.setChecked(weekSpan === "workWeek");
			item.onClick(() => {
				weekSpan = "workWeek";
				saveDashboardWeekSpan(weekSpan);
			});
		});
		menu.addItem((item) => {
			item.setTitle("Full Week");
			item.setChecked(weekSpan === "fullWeek");
			item.onClick(() => {
				weekSpan = "fullWeek";
				saveDashboardWeekSpan(weekSpan);
			});
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Start on Monday");
			item.setChecked(weekAnchor === "startMonday");
			item.onClick(() => {
				weekAnchor = "startMonday";
				saveDashboardWeekAnchor(weekAnchor);
			});
		});
		menu.addItem((item) => {
			item.setTitle("Start Today");
			item.setChecked(weekAnchor === "startToday");
			item.onClick(() => {
				weekAnchor = "startToday";
				saveDashboardWeekAnchor(weekAnchor);
			});
		});
		menu.showAtMouseEvent(ev);
	}
</script>

<section class="fulcrum-section">
	<h2>Today</h2>
	<div class="fulcrum-hero-row fulcrum-hero-row--quad">
		<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
			<div class="fulcrum-mega-stat__value">{tasksDueToday.length}</div>
			<div class="fulcrum-mega-stat__label">Tasks due</div>
		</div>
		<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
			<div class="fulcrum-mega-stat__value">{overdueTasks.length}</div>
			<div class="fulcrum-mega-stat__label">Overdue</div>
		</div>
		<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
			<div class="fulcrum-mega-stat__value">{meetingsToday.length}</div>
			<div class="fulcrum-mega-stat__label">Meetings today</div>
		</div>
		<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
			<div class="fulcrum-mega-stat__value">{completedThisWeek.length}</div>
			<div class="fulcrum-mega-stat__label">Completed (7d)</div>
		</div>
	</div>
</section>

<DashboardActiveTimers {plugin} />

<section class="fulcrum-section">
	<div
		class="fulcrum-dashboard-meetings-scroll"
		class:fulcrum-dashboard-meetings--task-drag-active={taskDragActive}
	>
		<div class="fulcrum-dashboard-meetings-week">
			<div class="fulcrum-dashboard-meetings-nav" role="toolbar" aria-label="Week navigation">
				<div class="fulcrum-dashboard-meetings-nav__lead" aria-hidden="true"></div>
				<div class="fulcrum-dashboard-meetings-nav__controls">
					<FulcrumDateNavToolbar
						title=""
						prevAriaLabel="Previous week"
						nextAriaLabel="Next week"
						todayVariant="dot"
						todayAriaLabel="This week"
						todayTitle="This week"
						onPrev={dashboardWeekPrev}
						onNext={dashboardWeekNext}
						onToday={dashboardWeekThis}
						className="fulcrum-dashboard-meetings-nav__toolbar"
					>
						<div slot="trailing" class="fulcrum-dashboard-meetings-nav__trailing">
							<button
								type="button"
								class="fulcrum-calendar__layer fulcrum-dashboard-meetings-nav__tasks-toggle"
								class:fulcrum-calendar__layer--on={weekShowTasks}
								aria-pressed={weekShowTasks}
								aria-label={weekShowTasks ? "Hide tasks on week grid" : "Show tasks on week grid"}
								title={weekShowTasks ? "Hide tasks" : "Show tasks"}
								on:click={toggleDashboardWeekTasks}
							>
								Tasks
							</button>
							<button
								type="button"
								class="fulcrum-dashboard-meetings-nav__btn fulcrum-dashboard-meetings-nav__btn--more"
								aria-label="Week display options"
								title="Week display options"
								on:click={openDashboardWeekMenu}
							>
								⋯
							</button>
						</div>
					</FulcrumDateNavToolbar>
				</div>
			</div>
			<div
				class="fulcrum-dashboard-meetings-grid"
				role="grid"
				aria-label="Meetings by day"
				style={`--fulcrum-dashboard-meeting-cols: ${meetingGridDays.length}`}
			>
			{#each meetingGridDays as {iso, dayLabel, dayNum}}
				{@const dayMeetings = meetingsByDate.get(iso) ?? []}
				{@const dayTasks = dueTasksForDay(iso)}
				{@const hasContent =
					dayMeetings.length > 0 ||
					(weekShowTasks && (dayTasks.untimed.length > 0 || dayTasks.timed.length > 0))}
				{@const isToday = iso === todayLocalISODate()}
				<div
					class="fulcrum-dashboard-meetings__day-col"
					class:fulcrum-dashboard-meetings__day-col--today={isToday}
					class:fulcrum-calendar__drop-target--droppable={taskDragActive}
					class:fulcrum-calendar__drop-target--active={weekDropTargetIso === iso}
					role="gridcell"
					data-date={iso}
					data-drop-target=""
					on:dragover={(e) => onWeekDayDragOver(e, iso)}
					on:dragleave={(e) => onWeekDayDragLeave(e, iso)}
					on:drop={(e) => void onWeekDayDrop(e, iso)}
				>
					<div class="fulcrum-dashboard-meetings__day-head">
						<span class="fulcrum-dashboard-meetings__day-name">{dayLabel}</span>
						<span class="fulcrum-dashboard-meetings__day-num">{dayNum}</span>
					</div>
					<div class="fulcrum-dashboard-meetings__day-events">
						{#if !hasContent}
							<span class="fulcrum-muted fulcrum-dashboard-meetings__empty">—</span>
						{:else}
							{#if weekShowTasks}
								{#each dayTasks.untimed as e (calendarEventKey(e))}
									<CalendarEventChip
										event={e}
										onDragStart={onWeekTaskDragStart}
										onDragEnd={onWeekTaskDragEnd}
										onContextMenu={onWeekTaskContextMenu}
									/>
								{/each}
								{#each dayTasks.timed as e (calendarEventKey(e))}
									<CalendarEventChip
										event={e}
										onDragStart={onWeekTaskDragStart}
										onDragEnd={onWeekTaskDragEnd}
										onContextMenu={onWeekTaskContextMenu}
									/>
								{/each}
							{/if}
							{#each dayMeetings as m (m.file.path)}
								{@const tlabel = meetingTimeLabel(m)}
								{@const accent = meetingAccent(m)}
								<button
									type="button"
									class="fulcrum-dashboard-meetings__event"
									style={`--fulcrum-cal-event-accent: ${accent}`}
									on:click={() => openFile(m.file.path)}
								>
									<span class="fulcrum-dashboard-meetings__event-title">
										{m.title?.trim() || m.file.basename.replace(/\.md$/i, "")}
									</span>
									<span class="fulcrum-dashboard-meetings__event-time">
										{tlabel || "All day"}
									</span>
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/each}
			</div>
		</div>
	</div>
</section>

<section class="fulcrum-section">
	<TaskSectionHead title="Today's Tasks" {plugin} />
	{#if todayTasks.length === 0}
		<p class="fulcrum-muted">Nothing due today in indexed tasks.</p>
	{:else}
		<ul class="fulcrum-task-list fulcrum-task-agenda-list fulcrum-task-agenda-list--compact">
			{#each todayTasks as t}
				<li>
					<TaskCard
						plugin={plugin}
						task={t}
						done={isDoneStatus(t.status, doneTask)}
						anchorLeaf={hoverParentLeaf}
						compact={true}
						enableDrag={true}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="fulcrum-section">
	<TaskSectionHead title="Past Due Tasks" {plugin} />
	{#if pastDueTasks.length === 0}
		<p class="fulcrum-muted">No past-due tasks in the index.</p>
	{:else}
		<ul class="fulcrum-task-list fulcrum-task-agenda-list fulcrum-task-agenda-list--compact">
			{#each pastDueTasks as t}
				<li>
					<TaskCard
						plugin={plugin}
						task={t}
						done={isDoneStatus(t.status, doneTask)}
						anchorLeaf={hoverParentLeaf}
						compact={true}
						enableDrag={true}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="fulcrum-section">
	<h2>Needs attention</h2>
	{#if !attentionAny}
		<p class="fulcrum-muted">
			No active projects with an overdue review, open tasks, or meetings in the next 7 days.
		</p>
	{:else}
		<div class="fulcrum-dashboard-attention-groups">
			<div class="fulcrum-dashboard-attention-group">
				<h3 class="fulcrum-dashboard-attention-group__title">Needs review</h3>
				{#if attentionBuckets.needsReview.length === 0}
					<p class="fulcrum-muted fulcrum-dashboard-attention-group__empty">None right now.</p>
				{:else}
					<div class="fulcrum-dashboard-attention-grid">
						{#each attentionBuckets.needsReview as p (p.file.path)}
							<div class="fulcrum-dashboard-attention__cell">
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{p}
									tile={true}
									selectedPath={null}
									onSelectProject={openProjectSummary}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								/>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="fulcrum-dashboard-attention-group">
				<h3 class="fulcrum-dashboard-attention-group__title">Open action items</h3>
				{#if attentionBuckets.openActionItems.length === 0}
					<p class="fulcrum-muted fulcrum-dashboard-attention-group__empty">None right now.</p>
				{:else}
					<div class="fulcrum-dashboard-attention-grid">
						{#each attentionBuckets.openActionItems as p (p.file.path)}
							<div class="fulcrum-dashboard-attention__cell">
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{p}
									tile={true}
									selectedPath={null}
									onSelectProject={openProjectSummary}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								/>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="fulcrum-dashboard-attention-group">
				<h3 class="fulcrum-dashboard-attention-group__title">Upcoming meetings</h3>
				{#if attentionBuckets.upcomingMeetings.length === 0}
					<p class="fulcrum-muted fulcrum-dashboard-attention-group__empty">None right now.</p>
				{:else}
					<div class="fulcrum-dashboard-attention-grid">
						{#each attentionBuckets.upcomingMeetings as p (p.file.path)}
							<div class="fulcrum-dashboard-attention__cell">
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{p}
									tile={true}
									selectedPath={null}
									onSelectProject={openProjectSummary}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								/>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>

<section class="fulcrum-section fulcrum-section--gantt">
	<h2>Project timeline</h2>
	<div class="fulcrum-dashboard-gantt">
		<GanttMain
			{plugin}
			{hoverParentLeaf}
			variant="compact"
			embedded={true}
			includeTasks={false}
			onlyDatedItems={true}
			excludeOngoingProjects={true}
			requireBoundedProjectDates={true}
		/>
	</div>
</section>

<section class="fulcrum-section">
	<h2>Activity</h2>
	{#if aggregatedActivity.length === 0}
		<p class="fulcrum-muted">No activity in the configured period across active projects.</p>
	{:else}
		<ul class="fulcrum-activity-list fulcrum-activity-list--timeline">
			{#each aggregatedActivity as row (row.id)}
				<li>
					<ActivityRow
						variant="timeline"
						title={row.title}
						chips={row.chips}
						kind={row.kind}
						task={row.task}
						timelineEmoji={row.timelineEmoji}
						whenClick={row.open}
						{plugin}
						hoverParentLeaf={hoverParentLeaf}
						hoverPath={row.hoverPath}
						suppressHoverPreview={true}
						accentColorCss={row.accentColorCss}
						bodyPreview={row.hoverPath ? dashActivityPreviews[row.hoverPath] : undefined}
						previewAccentCss={row.accentColorCss}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

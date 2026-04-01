<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {ProjectLogActivityEntry} from "../fulcrum/projectNote";
	import type {IndexedMeeting, ProjectRollup} from "../fulcrum/types";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {
		buildAreaWorkRelatedMap,
		filterProjectsWorkRelated,
		meetingPassesWorkFilter,
		taskPassesWorkFilter,
	} from "../fulcrum/utils/workRelatedProjectFilter";
	import {
		parseList,
		DASHBOARD_ACTIVITY_MAX_DAYS,
		DASHBOARD_ACTIVITY_MAX_ROWS,
	} from "../fulcrum/settingsDefaults";
	import type {IndexedProject} from "../fulcrum/types";
	import {buildProjectSidebarCounts, projectReviewIsOverdue} from "../fulcrum/utils/projectSidebarCounts";
	import {
		todayLocalISODate,
		isDueToday,
		isOverdue,
		isDateInUpcomingDays,
		dayStartMs,
	} from "../fulcrum/utils/dates";
	import {formatTrackedMinutesShort} from "../fulcrum/utils/dates";
	import {addDays, toISODate, formatDayShort} from "../fulcrum/utils/calendarGrid";
	import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";
	import {
		buildAggregatedActivityRows,
		type ActivityRowModel,
	} from "../fulcrum/utils/projectActivity";
	import TaskCard from "./TaskCard.svelte";
	import {loadActivityFeedPreviews} from "../fulcrum/loadActivityFeedPreviews";
	import ActivityRow from "./ActivityRow.svelte";
	import ProjectListRow from "./ProjectListRow.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = new Set(parseList(plugin.settings.taskDoneStatuses));
	$: doneProject = (void sRev, new Set(parseList(plugin.settings.projectDoneStatuses)));

	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
	});
	$: onlyWork = $workRelatedOnly;

	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);

	/** Active projects with open tasks, upcoming meetings (7d), or overdue review — same signals as the sidebar. */
	$: attentionProjects = ((): IndexedProject[] => {
		const out: IndexedProject[] = [];
		const candidates = filterProjectsWorkRelated(
			snapshot.projects.filter((p) => !doneProject.has((p.status ?? "").trim().toLowerCase())),
			onlyWork,
			areaWorkMap,
		);
		for (const p of candidates) {
			const overdue = projectReviewIsOverdue(p);
			const c = projectCounts.get(p.file.path);
			const openTasks = c?.openTasks ?? 0;
			const upcomingMeetings = c?.upcomingMeetings ?? 0;
			if (!overdue && openTasks === 0 && upcomingMeetings === 0) continue;
			out.push(p);
		}
		out.sort((a, b) => a.name.localeCompare(b.name));
		return out;
	})();

	$: tasksDueToday = snapshot.tasks.filter(
		(t) =>
			!doneTask.has(t.status) &&
			isDueToday(t.dueDate, false) &&
			taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap),
	);
	$: overdueTasks = snapshot.tasks.filter(
		(t) =>
			!doneTask.has(t.status) &&
			isOverdue(t.dueDate, false) &&
			taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap),
	);
	$: meetingsToday = snapshot.meetings.filter(
		(m) =>
			m.date?.slice(0, 10) === todayLocalISODate() &&
			meetingPassesWorkFilter(m, snapshot, onlyWork, areaWorkMap),
	);
	$: completedThisWeek = snapshot.tasks.filter((t) => {
		if (!taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap)) return false;
		if (!doneTask.has(t.status) || !t.completedDate) return false;
		const c = Date.parse(t.completedDate.slice(0, 10));
		if (Number.isNaN(c)) return false;
		const weekAgo = dayStartMs(new Date(Date.now() - 7 * 86400000));
		return c >= weekAgo;
	});

	/** 7 days starting today for the meetings calendar grid */
	$: meetingGridDays = (() => {
		const out: {iso: string; dayLabel: string; dayNum: string}[] = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		for (let i = 0; i < 7; i++) {
			const d = addDays(today, i);
			out.push({
				iso: toISODate(d),
				dayLabel: formatDayShort(d),
				dayNum: String(d.getDate()),
			});
		}
		return out;
	})();

	$: meetingsByDate = ((): Map<string, IndexedMeeting[]> => {
		const m = new Map<string, IndexedMeeting[]>();
		for (const mt of snapshot.meetings) {
			if (!meetingPassesWorkFilter(mt, snapshot, onlyWork, areaWorkMap)) continue;
			const key = mt.date?.slice(0, 10) ?? "";
			if (!key) continue;
			if (!isDateInUpcomingDays(mt.date, 7)) continue;
			const cur = m.get(key) ?? [];
			cur.push(mt);
			m.set(key, cur);
		}
		for (const [, arr] of m) {
			arr.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
		}
		return m;
	})();

	$: todayTasks = snapshot.tasks
		.filter(
			(t) =>
				!doneTask.has(t.status) &&
				isDueToday(t.dueDate, false) &&
				taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap),
		)
		.slice(0, 20);

	let aggregatedActivity: ActivityRowModel[] = [];

	$: {
		void rev;
		void sRev;
		void onlyWork;
		void areaWorkMap;
		const active = filterProjectsWorkRelated(
			plugin.vaultIndex.getActiveProjects(plugin.settings),
			onlyWork,
			areaWorkMap,
		);
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

<section class="fulcrum-section">
	<h2>Upcoming</h2>
	<div class="fulcrum-dashboard-meetings-scroll">
		<div class="fulcrum-dashboard-meetings-grid" role="grid" aria-label="Meetings by day">
			{#each meetingGridDays as {iso, dayLabel, dayNum}}
				{@const dayMeetings = meetingsByDate.get(iso) ?? []}
				{@const isToday = iso === todayLocalISODate()}
				<div
					class="fulcrum-dashboard-meetings__day-col"
					class:fulcrum-dashboard-meetings__day-col--today={isToday}
					role="gridcell"
				>
					<div class="fulcrum-dashboard-meetings__day-head">
						<span class="fulcrum-dashboard-meetings__day-name">{dayLabel}</span>
						<span class="fulcrum-dashboard-meetings__day-num">{dayNum}</span>
					</div>
					<div class="fulcrum-dashboard-meetings__day-events">
						{#if dayMeetings.length === 0}
							<span class="fulcrum-muted fulcrum-dashboard-meetings__empty">—</span>
						{:else}
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
</section>

<section class="fulcrum-section">
	<h2>Today’s tasks</h2>
	{#if todayTasks.length === 0}
		<p class="fulcrum-muted">Nothing due today in indexed tasks.</p>
	{:else}
		<ul class="fulcrum-task-list fulcrum-task-agenda-list">
			{#each todayTasks as t}
				<li>
					<TaskCard
						plugin={plugin}
						task={t}
						done={doneTask.has(t.status)}
						showProjectLink={true}
						anchorLeaf={hoverParentLeaf}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="fulcrum-section">
	<h2>Needs attention</h2>
	{#if attentionProjects.length === 0}
		<p class="fulcrum-muted">
			No active projects with open tasks, meetings in the next 7 days, or an overdue review.
		</p>
	{:else}
		<div class="fulcrum-dashboard-attention-grid">
			{#each attentionProjects as p (p.file.path)}
				<div class="fulcrum-dashboard-attention__cell">
					<ProjectListRow
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

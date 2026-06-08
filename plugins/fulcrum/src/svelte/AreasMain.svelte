<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedArea, IndexedMeeting, IndexedProject} from "../fulcrum/types";
	import {areaFilterState, indexRevision, settingsRevision} from "../fulcrum/stores";
	import {
		areaPathEnabled,
		buildAreaLifeModeMap,
		filterProjectsByAreaFocus,
		resolveIndexedAreaLifeMode,
	} from "../fulcrum/utils/areaFocusFilter";
	import {isDoneStatus, parseDoneStatusSet, parseList} from "../fulcrum/settingsDefaults";
	import {buildProjectSidebarCounts} from "../fulcrum/utils/projectSidebarCounts";
	import {sortIndexedProjects} from "../fulcrum/utils/projectListSort";
	import {
		buildAreaNextUpSegments,
		incompleteProjectTasks,
		sortMsForMeeting,
	} from "../fulcrum/utils/projectActivity";
	import {
		formatTrackedMinutesShort,
		isISODateTodayOrFuture,
	} from "../fulcrum/utils/dates";
	import ProjectListRow from "./ProjectListRow.svelte";
	import NextUpMeetingCard from "./NextUpMeetingCard.svelte";
	import TaskCard from "./TaskCard.svelte";
	import TaskSectionHead from "./TaskSectionHead.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let onSelectProject: (path: string) => void;

	type AreaSection = {
		path: string;
		label: string;
		icon?: string;
		indexed: IndexedArea;
		projects: IndexedProject[];
	};

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = (void sRev, parseDoneStatusSet(plugin.settings.taskDoneStatuses));
	$: doneProject = (void sRev, new Set(parseList(plugin.settings.projectDoneStatuses)));

	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});
	$: activeProjects = filterProjectsByAreaFocus(
		snapshot.projects.filter((p) => !doneProject.has((p.status ?? "").trim().toLowerCase())),
		areaFilter,
		lifeModeMap,
	);

	$: areaSections = ((): AreaSection[] => {
		const out: AreaSection[] = [];
		for (const a of snapshot.areas) {
			const lm = resolveIndexedAreaLifeMode(a, plugin.settings);
			if (!areaPathEnabled(a.file.path, lm, areaFilter)) continue;
			const projects = activeProjects.filter((p) =>
				p.areaFiles.some((af) => af.path === a.file.path),
			);
			out.push({
				path: a.file.path,
				label: a.name,
				icon: a.icon,
				indexed: a,
				projects: sortIndexedProjects(
					projects,
					plugin.settings.projectSidebarSortBy,
					plugin.settings.projectSidebarSortDir,
				),
			});
		}
		out.sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: "base"}));
		return out;
	})();

	$: unassignedProjects = sortIndexedProjects(
		activeProjects.filter((p) => p.areaFiles.length === 0),
		plugin.settings.projectSidebarSortBy,
		plugin.settings.projectSidebarSortDir,
	);

	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);

	function projectsInArea(path: string): Set<string> {
		return new Set(
			activeProjects
				.filter((p) => p.areaFiles.some((af) => af.path === path))
				.map((p) => p.file.path),
		);
	}

	function areaMeetings(projectPaths: Set<string>): IndexedMeeting[] {
		return snapshot.meetings.filter(
			(m) => m.projectFile && projectPaths.has(m.projectFile.path),
		);
	}

	function areaTasks(path: string, projectPaths: Set<string>): ReturnType<typeof incompleteProjectTasks> {
		const rollup = snapshot.tasks.filter((t) => {
			const inProject = Boolean(t.projectFile && projectPaths.has(t.projectFile.path));
			const onTaskNote = t.areaFile?.path === path;
			return inProject || onTaskNote;
		});
		return incompleteProjectTasks(rollup, doneTask);
	}

	function openTasksSorted(tasks: ReturnType<typeof incompleteProjectTasks>) {
		const priorityRank: Record<string, number> = {high: 3, medium: 2, low: 1};
		return [...tasks].sort((a, b) => {
			const ad = a.dueDate ?? "\uffff";
			const bd = b.dueDate ?? "\uffff";
			if (ad !== bd) return ad.localeCompare(bd);
			return (priorityRank[b.priority ?? ""] ?? 0) - (priorityRank[a.priority ?? ""] ?? 0);
		});
	}

	function kpiForProjects(projects: IndexedProject[]): {
		openTasks: number;
		upcomingMeetings: number;
		trackedMinutes: number;
	} {
		let openTasks = 0;
		let upcomingMeetings = 0;
		let trackedMinutes = 0;
		const paths = new Set(projects.map((p) => p.file.path));
		for (const p of projects) {
			openTasks += projectCounts.get(p.file.path)?.openTasks ?? 0;
			upcomingMeetings += projectCounts.get(p.file.path)?.upcomingMeetings ?? 0;
		}
		for (const t of snapshot.tasks) {
			if (t.projectFile && paths.has(t.projectFile.path)) {
				trackedMinutes += t.trackedMinutes ?? 0;
			}
		}
		return {openTasks, upcomingMeetings, trackedMinutes};
	}

	function openPath(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}
</script>

<div class="fulcrum-area-dashboard">
	{#if snapshot.areas.length === 0}
		<p class="fulcrum-muted fulcrum-area-dashboard__empty">
			No areas yet. Index notes with your area type in frontmatter (see settings), and link projects to area
			notes using the configured area field.
		</p>
	{:else if areaSections.length === 0 && unassignedProjects.length === 0}
		<p class="fulcrum-muted fulcrum-area-dashboard__empty">
			No areas match the current filter. Adjust the Areas panel above.
		</p>
	{:else}
		{#each areaSections as section (section.path)}
			{@const projectPaths = projectsInArea(section.path)}
			{@const meetingsAll = areaMeetings(projectPaths)}
			{@const tasksForRollup = areaTasks(section.path, projectPaths)}
			{@const openAreaTasks = openTasksSorted(tasksForRollup)}
			{@const nextUp = buildAreaNextUpSegments(tasksForRollup, meetingsAll, doneTask, 14)}
			{@const kpi = kpiForProjects(section.projects)}
			{@const upcomingMeetingsSorted = [...meetingsAll]
				.filter((m) => m.date && isISODateTodayOrFuture(m.date))
				.sort((a, b) => sortMsForMeeting(a) - sortMsForMeeting(b))}

			<section class="fulcrum-area-dashboard__block">
				<div class="fulcrum-area-dashboard__intro">
					<div class="fulcrum-area-dashboard__intro-text">
						<h2 class="fulcrum-area-dashboard__title">
							{#if section.icon}
								<span class="fulcrum-area-dashboard__tab-icon" aria-hidden="true"
									>{section.icon}</span
								>
							{/if}
							{section.label}
						</h2>
						{#if section.indexed.description?.trim()}
							<p class="fulcrum-area-dashboard__desc">{section.indexed.description}</p>
						{/if}
					</div>
					<button
						type="button"
						class="mod-cta"
						on:click={() => openPath(section.indexed.file.path)}
					>
						Open area note
					</button>
				</div>

				<div class="fulcrum-hero-row fulcrum-hero-row--quad fulcrum-area-dashboard__kpis">
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">{section.projects.length}</div>
						<div class="fulcrum-mega-stat__label">Projects</div>
					</div>
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">{kpi.openTasks}</div>
						<div class="fulcrum-mega-stat__label">Open tasks</div>
					</div>
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">{kpi.upcomingMeetings}</div>
						<div class="fulcrum-mega-stat__label">Meetings (7d)</div>
					</div>
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">
							{formatTrackedMinutesShort(kpi.trackedMinutes) || "0m"}
						</div>
						<div class="fulcrum-mega-stat__label">Task time tracked</div>
					</div>
				</div>

				<div class="fulcrum-section fulcrum-area-dashboard__subsection">
					<h3>Projects</h3>
					{#if section.projects.length === 0}
						<p class="fulcrum-muted">No active projects in this area.</p>
					{:else}
						<div class="fulcrum-area-dashboard__project-grid">
							{#each section.projects as p (p.file.path)}
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{p}
									selectedPath={null}
									onSelectProject={onSelectProject}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
									tile={true}
								/>
							{/each}
						</div>
					{/if}
				</div>

				{#if nextUp.meetings.length > 0 || nextUp.items.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h3>Next up</h3>
						{#if nextUp.meetings.length > 0}
							<div class="fulcrum-next-up-meetings-row" role="list" aria-label="Upcoming meetings">
								{#each nextUp.meetings as m (m.file.path)}
									<div class="fulcrum-next-up-meetings-row__cell" role="listitem">
										<NextUpMeetingCard meeting={m} onOpen={openPath} />
									</div>
								{/each}
							</div>
						{/if}
						{#if nextUp.items.length > 0}
							<ul
								class="fulcrum-activity-list fulcrum-activity-list--timeline fulcrum-next-up-list"
								class:fulcrum-next-up-list--with-meetings-above={nextUp.meetings.length > 0}
							>
								{#each nextUp.items as item}
									<li>
										{#if item.kind === "task" && item.task}
											<TaskCard
												{plugin}
												task={item.task}
												done={false}
												anchorLeaf={hoverParentLeaf}
												showInlineTimer={true}
											/>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				{#if openAreaTasks.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<TaskSectionHead title="Open tasks" {plugin} />
						<ul class="fulcrum-activity-list">
							{#each openAreaTasks as t (t.file.path + ":" + (t.line ?? 0) + ":" + t.title)}
								<li>
									<TaskCard
										{plugin}
										task={t}
										done={false}
										anchorLeaf={hoverParentLeaf}
										showInlineTimer={true}
									/>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if upcomingMeetingsSorted.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h3>Upcoming meetings</h3>
						<div class="fulcrum-next-up-meetings-row" role="list" aria-label="Area meetings">
							{#each upcomingMeetingsSorted as m (m.file.path)}
								<div class="fulcrum-next-up-meetings-row__cell" role="listitem">
									<NextUpMeetingCard meeting={m} onOpen={openPath} />
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/each}

		{#if unassignedProjects.length > 0}
			{@const unassignedPaths = new Set(unassignedProjects.map((p) => p.file.path))}
			{@const unassignedMeetings = areaMeetings(unassignedPaths)}
			{@const unassignedTasks = openTasksSorted(
				incompleteProjectTasks(
					snapshot.tasks.filter(
						(t) => t.projectFile && unassignedPaths.has(t.projectFile.path),
					),
					doneTask,
				),
			)}
			{@const unassignedKpi = kpiForProjects(unassignedProjects)}

			<section class="fulcrum-area-dashboard__block">
				<div class="fulcrum-area-dashboard__intro">
					<div class="fulcrum-area-dashboard__intro-text">
						<h2 class="fulcrum-area-dashboard__title">Unassigned</h2>
						<p class="fulcrum-muted fulcrum-area-dashboard__desc">
							Active projects not linked to any area note.
						</p>
					</div>
				</div>

				<div class="fulcrum-hero-row fulcrum-hero-row--quad fulcrum-area-dashboard__kpis">
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">{unassignedProjects.length}</div>
						<div class="fulcrum-mega-stat__label">Projects</div>
					</div>
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">{unassignedKpi.openTasks}</div>
						<div class="fulcrum-mega-stat__label">Open tasks</div>
					</div>
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">{unassignedKpi.upcomingMeetings}</div>
						<div class="fulcrum-mega-stat__label">Meetings (7d)</div>
					</div>
					<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
						<div class="fulcrum-mega-stat__value">
							{formatTrackedMinutesShort(unassignedKpi.trackedMinutes) || "0m"}
						</div>
						<div class="fulcrum-mega-stat__label">Task time tracked</div>
					</div>
				</div>

				<div class="fulcrum-section fulcrum-area-dashboard__subsection">
					<h3>Projects</h3>
					<div class="fulcrum-area-dashboard__project-grid">
						{#each unassignedProjects as p (p.file.path)}
							<ProjectListRow
								{plugin}
								{hoverParentLeaf}
								{p}
								selectedPath={null}
								onSelectProject={onSelectProject}
								openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
								upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								tile={true}
							/>
						{/each}
					</div>
				</div>

				{#if unassignedTasks.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<TaskSectionHead title="Open tasks" {plugin} />
						<ul class="fulcrum-activity-list">
							{#each unassignedTasks as t (t.file.path + ":" + (t.line ?? 0) + ":" + t.title)}
								<li>
									<TaskCard
										{plugin}
										task={t}
										done={false}
										anchorLeaf={hoverParentLeaf}
										showInlineTimer={true}
									/>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if unassignedMeetings.filter((m) => m.date && isISODateTodayOrFuture(m.date)).length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h3>Upcoming meetings</h3>
						<div class="fulcrum-next-up-meetings-row" role="list">
							{#each unassignedMeetings.filter((m) => m.date && isISODateTodayOrFuture(m.date)) as m (m.file.path)}
								<div class="fulcrum-next-up-meetings-row__cell" role="listitem">
									<NextUpMeetingCard meeting={m} onOpen={openPath} />
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>

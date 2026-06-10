<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedArea, IndexedMeeting, IndexedProject} from "../fulcrum/types";
	import {areaFilterState, indexRevision, settingsRevision} from "../fulcrum/stores";
	import {
		areaPathEnabled,
		buildAreaLifeModeMap,
		filterProjectsByAreaFocus,
		resolveIndexedAreaLifeMode,
	} from "../fulcrum/utils/areaFocusFilter";
	import {isDoneStatus, isProjectDone, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {buildProjectSidebarCounts} from "../fulcrum/utils/projectSidebarCounts";
	import {sortIndexedProjects} from "../fulcrum/utils/projectListSort";
	import {
		buildAreaNextUpSegments,
		incompleteProjectTasks,
	} from "../fulcrum/utils/projectActivity";
	import {formatTrackedMinutesShort} from "../fulcrum/utils/dates";
	import ProjectListRow from "./ProjectListRow.svelte";
	import NextUpMeetingCard from "./NextUpMeetingCard.svelte";
	import TaskCard from "./TaskCard.svelte";
	import GanttMain from "./GanttMain.svelte";

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

	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});
	$: activeProjects = (void sRev, filterProjectsByAreaFocus(
		snapshot.projects.filter((p) => !isProjectDone(p, plugin.settings)),
		areaFilter,
		lifeModeMap,
	));

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

	function openNoteIcon(el: HTMLElement): { destroy(): void } {
		setIcon(el, "square-arrow-out-up-right");
		return { destroy() {} };
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

			<section class="fulcrum-area-dashboard__block">
				<div class="fulcrum-area-dashboard__intro">
					<div class="fulcrum-area-dashboard__intro-text">
						<div class="fulcrum-area-dashboard__title-row">
							<h2 class="fulcrum-area-dashboard__title">
								{#if section.icon}
									<span class="fulcrum-area-dashboard__tab-icon" aria-hidden="true"
										>{section.icon}</span
									>
								{/if}
								{section.label}
							</h2>
							<button
								type="button"
								class="fulcrum-area-dashboard__open-note"
								title="Open area note"
								aria-label="Open area note"
								on:click={() => openPath(section.indexed.file.path)}
							>
								<span class="fulcrum-area-dashboard__open-note-icon" use:openNoteIcon aria-hidden="true"></span>
							</button>
						</div>
						{#if section.indexed.description?.trim()}
							<p class="fulcrum-area-dashboard__desc">{section.indexed.description}</p>
						{/if}
					</div>
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

				{#if nextUp.meetings.length > 0 || nextUp.items.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h2 class="fulcrum-area-dashboard__section-title">Next up</h2>
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

				<div class="fulcrum-section fulcrum-area-dashboard__subsection fulcrum-section--gantt">
					<h2 class="fulcrum-area-dashboard__section-title">Timeline</h2>
					<div class="fulcrum-dashboard-gantt fulcrum-area-dashboard__gantt">
						<GanttMain
							{plugin}
							{hoverParentLeaf}
							filterAreaPath={section.path}
							{onSelectProject}
							variant="compact"
							embedded={true}
							includeTasks={false}
							onlyDatedItems={true}
						/>
					</div>
				</div>

				<div class="fulcrum-section fulcrum-area-dashboard__subsection">
					<h2 class="fulcrum-area-dashboard__section-title">Projects</h2>
					{#if section.projects.length === 0}
						<p class="fulcrum-muted">No active projects in this area.</p>
					{:else}
						<div class="fulcrum-area-dashboard__project-grid">
							{#each section.projects as p (p.file.path)}
								<div class="fulcrum-area-dashboard__project-cell">
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
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#if openAreaTasks.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h2 class="fulcrum-area-dashboard__section-title">Open tasks</h2>
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
			</section>
		{/each}

		{#if unassignedProjects.length > 0}
			{@const unassignedPaths = new Set(unassignedProjects.map((p) => p.file.path))}
			{@const unassignedMeetings = areaMeetings(unassignedPaths)}
			{@const unassignedTasksRollup = snapshot.tasks.filter(
				(t) => t.projectFile && unassignedPaths.has(t.projectFile.path),
			)}
			{@const unassignedTasks = openTasksSorted(
				incompleteProjectTasks(unassignedTasksRollup, doneTask),
			)}
			{@const unassignedNextUp = buildAreaNextUpSegments(
				unassignedTasksRollup,
				unassignedMeetings,
				doneTask,
				14,
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

				{#if unassignedNextUp.meetings.length > 0 || unassignedNextUp.items.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h2 class="fulcrum-area-dashboard__section-title">Next up</h2>
						{#if unassignedNextUp.meetings.length > 0}
							<div class="fulcrum-next-up-meetings-row" role="list" aria-label="Upcoming meetings">
								{#each unassignedNextUp.meetings as m (m.file.path)}
									<div class="fulcrum-next-up-meetings-row__cell" role="listitem">
										<NextUpMeetingCard meeting={m} onOpen={openPath} />
									</div>
								{/each}
							</div>
						{/if}
						{#if unassignedNextUp.items.length > 0}
							<ul
								class="fulcrum-activity-list fulcrum-activity-list--timeline fulcrum-next-up-list"
								class:fulcrum-next-up-list--with-meetings-above={unassignedNextUp.meetings.length > 0}
							>
								{#each unassignedNextUp.items as item}
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

				<div class="fulcrum-section fulcrum-area-dashboard__subsection fulcrum-section--gantt">
					<h2 class="fulcrum-area-dashboard__section-title">Timeline</h2>
					<div class="fulcrum-dashboard-gantt fulcrum-area-dashboard__gantt">
						<GanttMain
							{plugin}
							{hoverParentLeaf}
							filterUnassignedProjects={true}
							{onSelectProject}
							variant="compact"
							embedded={true}
							includeTasks={false}
							onlyDatedItems={true}
						/>
					</div>
				</div>

				<div class="fulcrum-section fulcrum-area-dashboard__subsection">
					<h2 class="fulcrum-area-dashboard__section-title">Projects</h2>
					<div class="fulcrum-area-dashboard__project-grid">
						{#each unassignedProjects as p (p.file.path)}
							<div class="fulcrum-area-dashboard__project-cell">
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
							</div>
						{/each}
					</div>
				</div>

				{#if unassignedTasks.length > 0}
					<div class="fulcrum-section fulcrum-area-dashboard__subsection">
						<h2 class="fulcrum-area-dashboard__section-title">Open tasks</h2>
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
			</section>
		{/if}
	{/if}
</div>

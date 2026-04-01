<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedArea, IndexedMeeting, IndexedProject} from "../fulcrum/types";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {buildAreaWorkRelatedMap, filterProjectsWorkRelated} from "../fulcrum/utils/workRelatedProjectFilter";
	import {parseList} from "../fulcrum/settingsDefaults";
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

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let onSelectProject: (path: string) => void;

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = (void sRev, new Set(parseList(plugin.settings.taskDoneStatuses)));
	$: doneProject = (void sRev, new Set(parseList(plugin.settings.projectDoneStatuses)));

	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas);
	$: activeProjects = filterProjectsWorkRelated(
		snapshot.projects.filter((p) => !doneProject.has((p.status ?? "").trim().toLowerCase())),
		$workRelatedOnly,
		areaWorkMap,
	);

	type AreaTab = {
		path: string;
		label: string;
		icon?: string;
		indexed?: IndexedArea;
	};

	$: areaTabs = ((): AreaTab[] => {
		const tabMeta = new Map<string, { label: string; icon?: string; indexed?: IndexedArea }>();
		for (const a of snapshot.areas) {
			tabMeta.set(a.file.path, { label: a.name, icon: a.icon, indexed: a });
		}
		for (const p of activeProjects) {
			for (const af of p.areaFiles) {
				if (!tabMeta.has(af.path)) {
					tabMeta.set(af.path, {
						label: af.basename.replace(/\.md$/i, ""),
					});
				}
			}
		}
		const rows: AreaTab[] = [...tabMeta.entries()].map(([path, m]) => ({
			path,
			...m,
		}));
		rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
		if (activeProjects.some((p) => p.areaFiles.length === 0)) {
			rows.push({ path: "__unassigned__", label: "Unassigned" });
		}
		return rows;
	})();

	let selectedPath: string | null = null;

	$: {
		if (areaTabs.length === 0) {
			selectedPath = null;
		} else if (selectedPath == null || !areaTabs.some((t) => t.path === selectedPath)) {
			selectedPath = areaTabs[0]!.path;
		}
	}

	function pickTab(path: string): void {
		selectedPath = path;
	}

	$: selectedTab = selectedPath ? areaTabs.find((t) => t.path === selectedPath) ?? null : null;

	$: areaProjects = ((): IndexedProject[] => {
		if (selectedPath == null) return [];
		if (selectedPath === "__unassigned__") {
			return activeProjects.filter((p) => p.areaFiles.length === 0);
		}
		return activeProjects.filter((p) => p.areaFiles.some((a) => a.path === selectedPath));
	})();

	$: projectsSorted = sortIndexedProjects(
		areaProjects,
		plugin.settings.projectSidebarSortBy,
		plugin.settings.projectSidebarSortDir,
	);

	$: projectPathsInArea = new Set(areaProjects.map((p) => p.file.path));

	$: areaMeetingsAll = snapshot.meetings.filter(
		(m) => m.projectFile && projectPathsInArea.has(m.projectFile.path),
	);

	$: areaTasksForRollup = snapshot.tasks.filter((t) => {
		const inProject = Boolean(t.projectFile && projectPathsInArea.has(t.projectFile.path));
		if (selectedPath === "__unassigned__") {
			return inProject;
		}
		if (selectedPath == null) return false;
		const onTaskNote = t.areaFile?.path === selectedPath;
		return inProject || onTaskNote;
	});

	$: openAreaTasks = incompleteProjectTasks(areaTasksForRollup, doneTask);

	$: openAreaTasksSorted = (() => {
		const priorityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
		return [...openAreaTasks].sort((a, b) => {
			const ad = a.dueDate ?? "\uffff";
			const bd = b.dueDate ?? "\uffff";
			if (ad !== bd) return ad.localeCompare(bd);
			return (priorityRank[b.priority ?? ""] ?? 0) - (priorityRank[a.priority ?? ""] ?? 0);
		});
	})();

	$: nextUp = buildAreaNextUpSegments(openAreaTasks, areaMeetingsAll, doneTask, 14);

	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);

	$: kpiOpenTasks = (() => {
		let n = 0;
		for (const p of areaProjects) {
			n += projectCounts.get(p.file.path)?.openTasks ?? 0;
		}
		return n;
	})();

	$: kpiUpcomingMeetings = (() => {
		let n = 0;
		for (const p of areaProjects) {
			n += projectCounts.get(p.file.path)?.upcomingMeetings ?? 0;
		}
		return n;
	})();

	$: trackedInArea = areaTasksForRollup.reduce((acc, t) => acc + (t.trackedMinutes ?? 0), 0);

	$: upcomingMeetingsSorted = ((): IndexedMeeting[] => {
		return [...areaMeetingsAll]
			.filter((m) => m.date && isISODateTodayOrFuture(m.date))
			.sort((a, b) => sortMsForMeeting(a) - sortMsForMeeting(b));
	})();

	function openPath(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}
</script>

<div class="fulcrum-area-dashboard">
	{#if areaTabs.length === 0}
		<p class="fulcrum-muted fulcrum-area-dashboard__empty">
			No areas yet. Index notes with your area type in frontmatter (see settings), and link projects to area
			notes using the configured area field.
		</p>
	{:else}
		<div class="fulcrum-area-dashboard__tabs" role="tablist" aria-label="Areas">
			{#each areaTabs as tab (tab.path)}
				<button
					type="button"
					role="tab"
					class="fulcrum-area-dashboard__tab"
					class:fulcrum-area-dashboard__tab--active={tab.path === selectedPath}
					aria-selected={tab.path === selectedPath}
					title={tab.label}
					on:click={() => pickTab(tab.path)}
				>
					{#if tab.icon && tab.path !== "__unassigned__"}
						<span class="fulcrum-area-dashboard__tab-icon" aria-hidden="true">{tab.icon}</span>
					{/if}
					<span class="fulcrum-area-dashboard__tab-label">{tab.label}</span>
				</button>
			{/each}
		</div>

		{#if selectedTab && selectedPath}
			<div class="fulcrum-area-dashboard__intro">
				<div class="fulcrum-area-dashboard__intro-text">
					<h2 class="fulcrum-area-dashboard__title">{selectedTab.label}</h2>
					{#if selectedTab.indexed?.description?.trim()}
						<p class="fulcrum-area-dashboard__desc">{selectedTab.indexed.description}</p>
					{:else if selectedPath === "__unassigned__"}
						<p class="fulcrum-muted fulcrum-area-dashboard__desc">
							Active projects not linked to any area note.
						</p>
					{/if}
				</div>
				{#if selectedPath !== "__unassigned__"}
					{#if selectedTab.indexed}
						<button
							type="button"
							class="mod-cta"
							on:click={() => openPath(selectedTab.indexed.file.path)}
						>
							Open area note
						</button>
					{:else}
						<button type="button" class="mod-cta" on:click={() => openPath(selectedPath)}>
							Open area note
						</button>
					{/if}
				{/if}
			</div>

			<div class="fulcrum-hero-row fulcrum-hero-row--quad fulcrum-area-dashboard__kpis">
				<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
					<div class="fulcrum-mega-stat__value">{areaProjects.length}</div>
					<div class="fulcrum-mega-stat__label">Projects</div>
				</div>
				<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
					<div class="fulcrum-mega-stat__value">{kpiOpenTasks}</div>
					<div class="fulcrum-mega-stat__label">Open tasks</div>
				</div>
				<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
					<div class="fulcrum-mega-stat__value">{kpiUpcomingMeetings}</div>
					<div class="fulcrum-mega-stat__label">Meetings (7d)</div>
				</div>
				<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
					<div class="fulcrum-mega-stat__value">
						{formatTrackedMinutesShort(trackedInArea) || "0m"}
					</div>
					<div class="fulcrum-mega-stat__label">Task time tracked</div>
				</div>
			</div>

			<section class="fulcrum-section">
				<h2>Projects</h2>
				{#if projectsSorted.length === 0}
					<p class="fulcrum-muted">No active projects in this area.</p>
				{:else}
					<div class="fulcrum-area-dashboard__project-grid">
						{#each projectsSorted as p (p.file.path)}
							<ProjectListRow
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
			</section>

			<section class="fulcrum-section">
				<h2>Next up</h2>
				{#if nextUp.meetings.length === 0 && nextUp.items.length === 0}
					<p class="fulcrum-muted">
						Nothing with a date of today or later in this area (tasks need due or scheduled; meetings use
						their date field).
					</p>
				{:else}
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
											showProjectLink={true}
											showTimelineIcon={true}
											anchorLeaf={hoverParentLeaf}
										/>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>

			<section class="fulcrum-section">
				<h2>Open tasks</h2>
				{#if openAreaTasksSorted.length === 0}
					<p class="fulcrum-muted">No open tasks in this area.</p>
				{:else}
					<ul class="fulcrum-activity-list">
						{#each openAreaTasksSorted as t (t.file.path + ":" + (t.line ?? 0) + ":" + t.title)}
							<li>
								<TaskCard
									{plugin}
									task={t}
									done={false}
									showProjectLink={true}
									showTimelineIcon={false}
									anchorLeaf={hoverParentLeaf}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="fulcrum-section">
				<h2>Upcoming meetings</h2>
				{#if upcomingMeetingsSorted.length === 0}
					<p class="fulcrum-muted">No upcoming meetings for projects in this area.</p>
				{:else}
					<div class="fulcrum-next-up-meetings-row" role="list" aria-label="Area meetings">
						{#each upcomingMeetingsSorted as m (m.file.path)}
							<div class="fulcrum-next-up-meetings-row__cell" role="listitem">
								<NextUpMeetingCard meeting={m} onOpen={openPath} />
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>

<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {FulcrumSettings, TaskSidebarGroupBy} from "../fulcrum/settingsDefaults";
	import type {CalendarTaskScheduleField} from "../fulcrum/settingsDefaults";
	import {
		indexRevision,
		setCalendarTaskDragActive,
		settingsRevision,
		areaFilterState,
	} from "../fulcrum/stores";
	import {isDoneStatus, parseDoneStatusSet, parseList, parseTaskStatusChoices} from "../fulcrum/settingsDefaults";
	import {buildAreaLifeModeMap, taskPassesAreaFilter} from "../fulcrum/utils/areaFocusFilter";
	import type {IndexedArea, IndexedTask, IndexSnapshot} from "../fulcrum/types";
	import {sortIndexedTasks} from "../fulcrum/utils/taskListSort";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		calendarTaskDragKey,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import TaskCard from "./TaskCard.svelte";
	import FulcrumFacetPanel from "./shared/FulcrumFacetPanel.svelte";
	import FulcrumFacetRow from "./shared/FulcrumFacetRow.svelte";
	import FulcrumFilterPopover from "./shared/FulcrumFilterPopover.svelte";
	import FulcrumScheduleDropOptions from "./shared/FulcrumScheduleDropOptions.svelte";
	import TasksWeekStrip from "./TasksWeekStrip.svelte";
	import FulcrumCollapsibleHead from "./shared/FulcrumCollapsibleHead.svelte";
	import TaskCreateToolbar from "./TaskCreateToolbar.svelte";
	import {
		loadCollapsedGroupKeys,
		saveCollapsedGroupKeys,
		toggleCollapsedGroupKey,
	} from "../fulcrum/utils/collapsibleGroups";

	const NONE_KEY = "__none__";
	const FACETS_COLLAPSED_KEY = "fulcrum-task-sidebar-facets-collapsed";
	const GROUPS_COLLAPSED_KEY = "fulcrum-task-sidebar-groups-collapsed";
	const UNSCHEDULED_COLLAPSED_KEY = "fulcrum-task-sidebar-unscheduled-collapsed";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let filterProjectPath: string | undefined = undefined;
	export let embedded = false;
	/** When true, show unscheduled drag rows and “Set date as” (calendar / kanban tasks sidebar). */
	export let scheduleDragContext = false;
	/** Tasks view: week strip with task counts above the card list. */
	export let showWeekStrip = false;

	let facetsCollapsed = false;
	let filterOpen = false;
	let filterAnchorEl: HTMLDivElement | null = null;
	let searchQuery = "";
	let collapsedGroupKeys = loadCollapsedGroupKeys(GROUPS_COLLAPSED_KEY);
	let unscheduledCollapsed = false;
	let draggedTaskKey: string | null = null;

	onMount(() => {
		try {
			if (localStorage.getItem(FACETS_COLLAPSED_KEY) === "1") facetsCollapsed = true;
			if (localStorage.getItem(UNSCHEDULED_COLLAPSED_KEY) === "1") unscheduledCollapsed = true;
		} catch {
			/* ignore */
		}
	});

	function toggleFacetsCollapsed(): void {
		facetsCollapsed = !facetsCollapsed;
		if (facetsCollapsed) filterOpen = false;
		try {
			localStorage.setItem(FACETS_COLLAPSED_KEY, facetsCollapsed ? "1" : "0");
		} catch {
			/* ignore */
		}
	}

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = (void sRev, parseDoneStatusSet(plugin.settings.taskDoneStatuses));
	$: areaFilter = $areaFilterState;
	$: scheduleDateMode = (void sRev, plugin.settings.calendarTaskScheduleField);

	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});

	$: openTasksRaw = snapshot.tasks
		.filter(
			(t) =>
				!isDoneStatus(t.status, doneTask) &&
				taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap),
		)
		.filter((t) => !filterProjectPath || t.projectFile?.path === filterProjectPath);

	$: uncheckedStatus = (void sRev, new Set(plugin.settings.taskSidebarFilterUncheckedStatus ?? []));
	$: uncheckedProject = (void sRev, new Set(plugin.settings.taskSidebarFilterUncheckedProject ?? []));

	function taskAreaKey(t: IndexedTask, snap: IndexSnapshot): string {
		if (t.areaFile) return t.areaFile.path;
		if (t.projectFile) {
			const p = snap.projects.find((x) => x.file.path === t.projectFile!.path);
			if (p?.areaFiles[0]) return p.areaFiles[0].path;
		}
		return NONE_KEY;
	}

	function taskAreaLabel(key: string, snap: IndexSnapshot): string {
		if (key === NONE_KEY) return "None";
		const a = snap.areas.find((x) => x.file.path === key);
		if (a) return a.name;
		return key.split("/").pop()?.replace(/\.md$/i, "") ?? key;
	}

	function taskProjectKey(t: IndexedTask): string {
		return t.projectFile?.path ?? NONE_KEY;
	}

	function taskProjectLabel(key: string, snap: IndexSnapshot): string {
		if (key === NONE_KEY) return "No project";
		const p = snap.projects.find((x) => x.file.path === key);
		return p?.name ?? key.split("/").pop()?.replace(/\.md$/i, "") ?? key;
	}

	function isUnscheduled(t: IndexedTask): boolean {
		const sched = t.scheduledDate?.slice(0, 10);
		const due = t.dueDate?.slice(0, 10);
		return !sched && !due;
	}

	function taskPassesSidebarFilters(t: IndexedTask): boolean {
		const statusSet = uncheckedStatus ?? new Set<string>();
		const projectSet = uncheckedProject ?? new Set<string>();
		const statusUnchecked = statusSet.size > 0;
		const projectUnchecked = projectSet.size > 0;
		const statusSetLc = new Set([...statusSet].map((s) => s.toLowerCase()));
		const statusKey = t.status?.trim() ? t.status : NONE_KEY;
		const projectKey = taskProjectKey(t);
		const statusPass = !statusUnchecked || !statusSetLc.has(statusKey.toLowerCase());
		const projectPass = !projectUnchecked || !projectSet.has(projectKey);
		return statusPass && projectPass;
	}

	/** Project list tab is already scoped; global sidebar facet filters should not hide tasks. */
	function taskPassesListFilters(t: IndexedTask): boolean {
		if (!taskMatchesSearchQuery(t, searchQuery.trim().toLowerCase(), snapshot)) return false;
		if (filterProjectPath) return true;
		return taskPassesSidebarFilters(t);
	}

	/** Unscheduled tasks live in a separate section only when calendar drag is enabled. */
	function taskInMainList(t: IndexedTask): boolean {
		return !scheduleDragContext || !isUnscheduled(t);
	}

	function taskMatchesSearchQuery(t: IndexedTask, q: string, snap: IndexSnapshot): boolean {
		if (!q) return true;
		if (t.title.toLowerCase().includes(q)) return true;
		const pk = taskProjectKey(t);
		if (pk !== NONE_KEY && taskProjectLabel(pk, snap).toLowerCase().includes(q)) {
			return true;
		}
		return false;
	}

	$: unscheduledTasks = sortIndexedTasks(
		openTasksRaw.filter(
			(t) => isUnscheduled(t) && taskPassesListFilters(t),
		),
		"name",
		"asc",
	);

	$: statusOptions = ((): {key: string; label: string}[] => {
		const seen = new Set<string>();
		const out: {key: string; label: string}[] = [];
		for (const t of openTasksRaw) {
			const k = t.status?.trim() ? t.status : NONE_KEY;
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({
				key: k,
				label: k === NONE_KEY ? "None" : k.replace(/\b\w/g, (c) => c.toUpperCase()),
			});
		}
		if (!seen.has(NONE_KEY)) out.push({key: NONE_KEY, label: "None"});
		out.sort((a, b) =>
			a.key === NONE_KEY ? 1 : b.key === NONE_KEY ? -1 : a.label.localeCompare(b.label),
		);
		return out;
	})();

	$: projectOptions = ((): {key: string; label: string}[] => {
		const seen = new Set<string>();
		const out: {key: string; label: string}[] = [];
		for (const t of openTasksRaw) {
			const k = taskProjectKey(t);
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({key: k, label: taskProjectLabel(k, snapshot)});
		}
		if (!seen.has(NONE_KEY)) out.push({key: NONE_KEY, label: "No project"});
		out.sort((a, b) =>
			a.key === NONE_KEY ? 1 : b.key === NONE_KEY ? -1 : a.label.localeCompare(b.label),
		);
		return out;
	})();

	$: searchFiltered = openTasksRaw.filter(
		(t) => taskInMainList(t) && taskPassesListFilters(t),
	);

	$: groupBy = (void sRev, plugin.settings.taskSidebarGroupBy);
	$: effectiveGroupBy =
		filterProjectPath && groupBy === "project" ? "status" : groupBy;
	$: sortBy = (void sRev, plugin.settings.taskSidebarSortBy);
	$: sortDir = (void sRev, plugin.settings.taskSidebarSortDir);
	$: statusOrder = (void sRev, parseTaskStatusChoices(plugin.settings));

	$: flatTasks = sortIndexedTasks(searchFiltered, sortBy, sortDir);

	type TaskGroup = {label: string; tasks: IndexedTask[]; area?: IndexedArea};

	$: taskGroups = ((): TaskGroup[] => {
		const list = searchFiltered;
		if (effectiveGroupBy === "none") {
			return [{label: "", tasks: sortIndexedTasks(list, sortBy, sortDir)}];
		}
		const map = new Map<string, IndexedTask[]>();
		for (const t of list) {
			let key = "";
			if (effectiveGroupBy === "status") key = t.status?.trim() || NONE_KEY;
			else if (effectiveGroupBy === "project") key = taskProjectKey(t);
			else key = taskAreaKey(t, snapshot);
			const cur = map.get(key) ?? [];
			cur.push(t);
			map.set(key, cur);
		}
		const keys = [...map.keys()];
		if (effectiveGroupBy === "status") {
			keys.sort((a, b) => {
				const ia = statusOrder.indexOf(a.toLowerCase());
				const ib = statusOrder.indexOf(b.toLowerCase());
				if (ia === -1 && ib === -1) return a.localeCompare(b);
				if (ia === -1) return 1;
				if (ib === -1) return -1;
				return ia - ib;
			});
		} else {
			keys.sort((a, b) => {
				if (a === NONE_KEY) return 1;
				if (b === NONE_KEY) return -1;
				const la =
					effectiveGroupBy === "project"
						? taskProjectLabel(a, snapshot)
						: taskAreaLabel(a, snapshot);
				const lb =
					effectiveGroupBy === "project"
						? taskProjectLabel(b, snapshot)
						: taskAreaLabel(b, snapshot);
				return la.localeCompare(lb);
			});
		}
		return keys.map((k) => ({
			label:
				effectiveGroupBy === "status"
					? k === NONE_KEY
						? "None"
						: k.replace(/\b\w/g, (c) => c.toUpperCase())
					: effectiveGroupBy === "project"
						? taskProjectLabel(k, snapshot)
						: taskAreaLabel(k, snapshot),
			tasks: sortIndexedTasks(map.get(k) ?? [], sortBy, sortDir),
			area:
				effectiveGroupBy === "area" && k !== NONE_KEY
					? snapshot.areas.find((a) => a.file.path === k)
					: undefined,
		}));
	})();

	$: visibleGroupedTaskCount = taskGroups.reduce((n, g) => n + g.tasks.length, 0);

	async function onGroupByChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as TaskSidebarGroupBy;
		await plugin.patchSettings({taskSidebarGroupBy: v});
	}

	async function onSortByChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement)
			.value as FulcrumSettings["taskSidebarSortBy"];
		await plugin.patchSettings({taskSidebarSortBy: v});
	}

	async function toggleSortDir(): Promise<void> {
		const next = plugin.settings.taskSidebarSortDir === "asc" ? "desc" : "asc";
		await plugin.patchSettings({taskSidebarSortDir: next});
	}

	async function onScheduleModeChange(v: CalendarTaskScheduleField): Promise<void> {
		await plugin.patchSettings({calendarTaskScheduleField: v});
	}

	$: filterSections = [
		{
			title: "Status",
			options: statusOptions,
			isChecked: isStatusChecked,
			onToggle: toggleStatusFilter,
		},
		...(filterProjectPath
			? []
			: [
					{
						title: "Project",
						options: projectOptions,
						isChecked: isProjectChecked,
						onToggle: toggleProjectFilter,
					},
				]),
	];

	async function toggleStatusFilter(key: string): Promise<void> {
		const keyLc = key.toLowerCase();
		const arr = [...(plugin.settings.taskSidebarFilterUncheckedStatus ?? [])];
		const i = arr.findIndex((s) => s.toLowerCase() === keyLc);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(keyLc);
		await plugin.patchSettings({taskSidebarFilterUncheckedStatus: arr});
	}

	async function toggleProjectFilter(key: string): Promise<void> {
		const arr = [...(plugin.settings.taskSidebarFilterUncheckedProject ?? [])];
		const i = arr.indexOf(key);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(key);
		await plugin.patchSettings({taskSidebarFilterUncheckedProject: arr});
	}

	$: uncheckedStatusLc = new Set([...uncheckedStatus].map((s) => s.toLowerCase()));

	function isStatusChecked(key: string): boolean {
		return !uncheckedStatusLc.has(key.toLowerCase());
	}

	function isProjectChecked(key: string): boolean {
		return !uncheckedProject.has(key);
	}

	function openFilterPanel(): void {
		filterOpen = !filterOpen;
	}

	async function applyFilters(): Promise<void> {
		await plugin.refreshIndex();
	}

	function handleFilterClickOutside(ev: MouseEvent): void {
		if (!filterOpen || !filterAnchorEl) return;
		const t = ev.target as Node;
		if (filterAnchorEl.contains(t)) return;
		const panel = document.querySelector(".fulcrum-task-list-panel__filter-panel");
		if (panel?.contains(t)) return;
		filterOpen = false;
	}

	function groupKey(label: string): string {
		return `${effectiveGroupBy}:${label}`;
	}

	function toggleGroup(label: string): void {
		const key = groupKey(label);
		collapsedGroupKeys = toggleCollapsedGroupKey(collapsedGroupKeys, key);
		saveCollapsedGroupKeys(GROUPS_COLLAPSED_KEY, collapsedGroupKeys);
	}

	function toggleUnscheduledCollapsed(): void {
		unscheduledCollapsed = !unscheduledCollapsed;
		try {
			localStorage.setItem(UNSCHEDULED_COLLAPSED_KEY, unscheduledCollapsed ? "1" : "0");
		} catch {
			/* ignore */
		}
	}

	function onTaskDragStart(ev: DragEvent, task: IndexedTask): void {
		const key = calendarTaskDragKey(task);
		draggedTaskKey = key;
		setCalendarTaskDragActive(true);
		ev.dataTransfer?.setData(FULCRUM_CALENDAR_TASK_MIME, key);
		if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
	}

	function onTaskDragEnd(): void {
		draggedTaskKey = null;
		setCalendarTaskDragActive(false);
	}

	function openAreaFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}
</script>

<svelte:window on:click={handleFilterClickOutside} />

<div class="fulcrum-task-list-panel fulcrum-project-list-panel" class:fulcrum-task-list-panel--tasks-view={showWeekStrip}>
	<div
		class="fulcrum-task-list-panel__top"
		class:fulcrum-task-list-panel__sticky-head={showWeekStrip}
	>
	{#if embedded && filterProjectPath}
		<div class="fulcrum-task-list-panel__embedded-actions">
			<TaskCreateToolbar {plugin} projectPath={filterProjectPath} />
		</div>
	{/if}
	{#if !embedded}
	<FulcrumFacetPanel
		collapsed={facetsCollapsed}
		panelId="fulcrum-task-list-panel-facets"
		onToggle={() => toggleFacetsCollapsed()}
	>
		<FulcrumFacetRow label="Group">
			<select
				class="dropdown fulcrum-project-list-panel__facet-select"
				aria-label="Group tasks by"
				value={effectiveGroupBy}
				on:change={(e) => void onGroupByChange(e)}
			>
				<option value="area">Area</option>
				<option value="status">Status</option>
				{#if !filterProjectPath}
					<option value="project">Project</option>
				{/if}
				<option value="none">None</option>
			</select>
		</FulcrumFacetRow>
		<FulcrumFacetRow label="Sort">
			<select
				class="dropdown fulcrum-project-list-panel__facet-select"
				aria-label="Sort tasks by"
				value={sortBy}
				on:change={(e) => void onSortByChange(e)}
			>
				<option value="due">Due date</option>
				<option value="name">Name</option>
				<option value="project">Project</option>
			</select>
			<button
				type="button"
				class="fulcrum-project-list-panel__sort-dir"
				title={sortDir === "asc" ? "Ascending" : "Descending"}
				aria-label="Toggle sort direction"
				on:click={() => void toggleSortDir()}
			>
				{sortDir === "asc" ? "↑" : "↓"}
			</button>
		</FulcrumFacetRow>
		<div
			class="fulcrum-project-list-panel__facet-row fulcrum-project-list-panel__facet-row--filter"
			bind:this={filterAnchorEl}
		>
			<span class="fulcrum-project-list-panel__facet-label">Filter</span>
			<div class="fulcrum-project-list-panel__facet-controls fulcrum-project-list-panel__facet-controls--filter">
			<div class="fulcrum-project-list-panel__filter-wrap">
				<button
					type="button"
					class="dropdown fulcrum-project-list-panel__facet-select fulcrum-project-list-panel__filter-trigger"
					aria-label="Filter tasks"
					aria-expanded={filterOpen}
					on:click|stopPropagation={() => openFilterPanel()}
				>
					{uncheckedStatus.size > 0 || uncheckedProject.size > 0 ? "Filtered" : "All"}
				</button>
				<button
					type="button"
					class="fulcrum-project-list-panel__sort-dir fulcrum-project-list-panel__filter-apply"
					title="Refresh index"
					aria-label="Refresh index"
					on:click={() => void applyFilters()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
				</button>
				<FulcrumFilterPopover
					open={filterOpen}
					sections={filterSections}
					panelClass="fulcrum-task-list-panel__filter-panel"
				/>
			</div>
			</div>
		</div>
		<FulcrumFacetRow label="Search">
			<input
				type="text"
				class="fulcrum-project-list-panel__facet-input"
				placeholder="Filter by task title…"
				aria-label="Search tasks"
				bind:value={searchQuery}
			/>
		</FulcrumFacetRow>
	</FulcrumFacetPanel>
	{/if}

	{#if showWeekStrip}
		<TasksWeekStrip {plugin} />
	{/if}
	</div>

	<div class:fulcrum-task-list-panel__scroll-body={showWeekStrip || embedded}>

	{#if scheduleDragContext}
	<section class="fulcrum-task-list-panel__unscheduled" aria-label="Unscheduled tasks">
		<div class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle">
			<FulcrumCollapsibleHead
				title="Unscheduled"
				suffix="({unscheduledTasks.length})"
				expanded={!unscheduledCollapsed}
				onToggle={toggleUnscheduledCollapsed}
			/>
			{#if !showWeekStrip && !unscheduledCollapsed}
				<div class="fulcrum-task-list-panel__unscheduled-schedule">
					<FulcrumScheduleDropOptions value={scheduleDateMode} onChange={onScheduleModeChange} />
				</div>
			{/if}
		</div>
		{#if !unscheduledCollapsed}
		{#if unscheduledTasks.length === 0}
			<p class="fulcrum-muted fulcrum-task-list-panel__unscheduled-empty">No unscheduled tasks.</p>
		{:else}
			<ul class="fulcrum-task-list-panel__unscheduled-list" role="list">
				{#each unscheduledTasks as task (calendarTaskDragKey(task))}
					<li
						class="fulcrum-task-drag-row fulcrum-task-list-panel__drag-row"
						class:fulcrum-task-drag-row--dragging={draggedTaskKey === calendarTaskDragKey(task)}
					>
						<span
							class="fulcrum-task-drag-row__grip fulcrum-calendar__unscheduled-grip"
							aria-hidden="true"
							draggable="true"
							role="button"
							tabindex="0"
							aria-label="Drag to calendar"
							on:dragstart={(e) => onTaskDragStart(e, task)}
							on:dragend={onTaskDragEnd}
						>⋮⋮</span>
						<div class="fulcrum-task-drag-row__card fulcrum-task-list-panel__card-wrap">
							<TaskCard
								{plugin}
								{task}
								done={false}
								anchorLeaf={hoverParentLeaf}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		{/if}
	</section>
	{/if}

	{#if openTasksRaw.length === 0}
		<p class="fulcrum-muted fulcrum-project-list-panel__empty">No open tasks in index.</p>
	{:else if effectiveGroupBy === "none"}
		{#if flatTasks.length === 0}
			<p class="fulcrum-muted fulcrum-project-list-panel__empty">No tasks match your filters.</p>
		{:else}
		<ul class="fulcrum-task-list-panel__list">
			{#each flatTasks as task (calendarTaskDragKey(task))}
				<li
					class="fulcrum-task-drag-row fulcrum-task-list-panel__drag-row"
					class:fulcrum-task-drag-row--dragging={draggedTaskKey === calendarTaskDragKey(task)}
				>
					<span
						class="fulcrum-task-drag-row__grip fulcrum-calendar__unscheduled-grip"
						aria-hidden="true"
						draggable="true"
						role="button"
						tabindex="0"
						aria-label="Drag task"
						on:dragstart={(e) => onTaskDragStart(e, task)}
						on:dragend={onTaskDragEnd}
					>⋮⋮</span>
					<div class="fulcrum-task-drag-row__card fulcrum-task-list-panel__card-wrap">
						<TaskCard {plugin} {task} done={false} anchorLeaf={hoverParentLeaf} />
					</div>
				</li>
			{/each}
		</ul>
		{/if}
	{:else}
		{#each taskGroups as group (group.label)}
			{#if group.tasks.length > 0}
				{@const groupCollapsed = collapsedGroupKeys.has(groupKey(group.label))}
				<section class="fulcrum-project-list-panel__group">
					{#if group.label}
						<div class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle">
							<FulcrumCollapsibleHead
								title={group.label}
								suffix={group.area ? undefined : `(${group.tasks.length})`}
								areaIcon={group.area?.icon}
								expanded={!groupCollapsed}
								onToggle={() => toggleGroup(group.label)}
							/>
							{#if group.area}
								<button
									type="button"
									class="fulcrum-project-list-panel__open-area-note"
									title="Open area note"
									aria-label="Open area note"
									on:click={() => {
										if (group.area) openAreaFile(group.area.file.path);
									}}
								>
									↗
								</button>
							{/if}
						</div>
					{/if}
					{#if !group.label || !groupCollapsed}
						<ul class="fulcrum-task-list-panel__list">
							{#each group.tasks as task (calendarTaskDragKey(task))}
								<li
									class="fulcrum-task-drag-row fulcrum-task-list-panel__drag-row"
									class:fulcrum-task-drag-row--dragging={draggedTaskKey === calendarTaskDragKey(task)}
								>
									<span
										class="fulcrum-task-drag-row__grip fulcrum-calendar__unscheduled-grip"
										aria-hidden="true"
										draggable="true"
										role="button"
										tabindex="0"
										aria-label="Drag task"
										on:dragstart={(e) => onTaskDragStart(e, task)}
										on:dragend={onTaskDragEnd}
									>⋮⋮</span>
									<div class="fulcrum-task-drag-row__card fulcrum-task-list-panel__card-wrap">
										<TaskCard {plugin} {task} done={false} anchorLeaf={hoverParentLeaf} />
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		{/each}
		{#if visibleGroupedTaskCount === 0}
			<p class="fulcrum-muted fulcrum-project-list-panel__empty">No tasks match your filters.</p>
		{/if}
	{/if}
	</div>
</div>

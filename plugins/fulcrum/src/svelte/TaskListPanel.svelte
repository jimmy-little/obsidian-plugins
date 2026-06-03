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
		workRelatedOnly,
	} from "../fulcrum/stores";
	import {parseList} from "../fulcrum/settingsDefaults";
	import {
		buildAreaWorkRelatedMap,
		taskPassesWorkFilter,
	} from "../fulcrum/utils/workRelatedProjectFilter";
	import type {IndexedArea, IndexedTask, IndexSnapshot} from "../fulcrum/types";
	import {sortIndexedTasks} from "../fulcrum/utils/taskListSort";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		calendarTaskDragKey,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import TaskCard from "./TaskCard.svelte";

	const NONE_KEY = "__none__";
	const FACETS_COLLAPSED_KEY = "fulcrum-task-sidebar-facets-collapsed";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	let facetsCollapsed = false;
	let filterOpen = false;
	let filterAnchorEl: HTMLDivElement | null = null;
	let searchQuery = "";
	let collapsedGroups = new Set<string>();
	let draggedTaskKey: string | null = null;

	onMount(() => {
		try {
			if (localStorage.getItem(FACETS_COLLAPSED_KEY) === "1") facetsCollapsed = true;
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
	$: doneTask = (void sRev, new Set(parseList(plugin.settings.taskDoneStatuses)));
	$: onlyWork = $workRelatedOnly;
	$: scheduleDateMode = (void sRev, plugin.settings.calendarTaskScheduleField);

	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
	});

	$: openTasksRaw = snapshot.tasks.filter(
		(t) => !doneTask.has(t.status) && taskPassesWorkFilter(t, snapshot, onlyWork, areaWorkMap),
	);

	$: uncheckedStatus = (void sRev, new Set(plugin.settings.taskSidebarFilterUncheckedStatus ?? []));
	$: uncheckedArea = (void sRev, new Set(plugin.settings.taskSidebarFilterUncheckedArea ?? []));
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
		const areaSet = uncheckedArea ?? new Set<string>();
		const projectSet = uncheckedProject ?? new Set<string>();
		const statusUnchecked = statusSet.size > 0;
		const areaUnchecked = areaSet.size > 0;
		const projectUnchecked = projectSet.size > 0;
		const statusSetLc = new Set([...statusSet].map((s) => s.toLowerCase()));
		const statusKey = t.status?.trim() ? t.status : NONE_KEY;
		const areaKey = taskAreaKey(t, snapshot);
		const projectKey = taskProjectKey(t);
		const statusPass = !statusUnchecked || !statusSetLc.has(statusKey.toLowerCase());
		const areaPass = !areaUnchecked || !areaSet.has(areaKey);
		const projectPass = !projectUnchecked || !projectSet.has(projectKey);
		return statusPass && areaPass && projectPass;
	}

	$: unscheduledTasks = sortIndexedTasks(
		openTasksRaw.filter((t) => isUnscheduled(t) && taskPassesSidebarFilters(t)),
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

	$: areaOptions = ((): {key: string; label: string}[] => {
		const seen = new Set<string>();
		const out: {key: string; label: string}[] = [];
		for (const t of openTasksRaw) {
			const k = taskAreaKey(t, snapshot);
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({key: k, label: taskAreaLabel(k, snapshot)});
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

	$: searchFiltered = ((): IndexedTask[] => {
		const q = searchQuery.trim().toLowerCase();
		const base = openTasksRaw.filter(
			(t) => !isUnscheduled(t) && taskPassesSidebarFilters(t),
		);
		if (!q) return base;
		return base.filter((t) => {
			if (t.title.toLowerCase().includes(q)) return true;
			const pk = taskProjectKey(t);
			if (pk !== NONE_KEY && taskProjectLabel(pk, snapshot).toLowerCase().includes(q)) {
				return true;
			}
			return false;
		});
	})();

	$: groupBy = (void sRev, plugin.settings.taskSidebarGroupBy);
	$: sortBy = (void sRev, plugin.settings.taskSidebarSortBy);
	$: sortDir = (void sRev, plugin.settings.taskSidebarSortDir);
	$: statusOrder = (void sRev, parseList(plugin.settings.taskStatuses));

	$: flatTasks = sortIndexedTasks(searchFiltered, sortBy, sortDir);

	type TaskGroup = {label: string; tasks: IndexedTask[]; area?: IndexedArea};

	$: taskGroups = ((): TaskGroup[] => {
		const list = searchFiltered;
		if (groupBy === "none") {
			return [{label: "", tasks: sortIndexedTasks(list, sortBy, sortDir)}];
		}
		const map = new Map<string, IndexedTask[]>();
		for (const t of list) {
			let key = "";
			if (groupBy === "status") key = t.status?.trim() || NONE_KEY;
			else if (groupBy === "project") key = taskProjectKey(t);
			else key = taskAreaKey(t, snapshot);
			const cur = map.get(key) ?? [];
			cur.push(t);
			map.set(key, cur);
		}
		const keys = [...map.keys()];
		if (groupBy === "status") {
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
					groupBy === "project"
						? taskProjectLabel(a, snapshot)
						: taskAreaLabel(a, snapshot);
				const lb =
					groupBy === "project"
						? taskProjectLabel(b, snapshot)
						: taskAreaLabel(b, snapshot);
				return la.localeCompare(lb);
			});
		}
		return keys.map((k) => ({
			label:
				groupBy === "status"
					? k === NONE_KEY
						? "None"
						: k.replace(/\b\w/g, (c) => c.toUpperCase())
					: groupBy === "project"
						? taskProjectLabel(k, snapshot)
						: taskAreaLabel(k, snapshot),
			tasks: sortIndexedTasks(map.get(k) ?? [], sortBy, sortDir),
			area:
				groupBy === "area" && k !== NONE_KEY
					? snapshot.areas.find((a) => a.file.path === k)
					: undefined,
		}));
	})();

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

	async function onScheduleModeChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as CalendarTaskScheduleField;
		await plugin.patchSettings({calendarTaskScheduleField: v});
	}

	async function toggleStatusFilter(key: string): Promise<void> {
		const keyLc = key.toLowerCase();
		const arr = [...(plugin.settings.taskSidebarFilterUncheckedStatus ?? [])];
		const i = arr.findIndex((s) => s.toLowerCase() === keyLc);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(keyLc);
		await plugin.patchSettings({taskSidebarFilterUncheckedStatus: arr});
	}

	async function toggleAreaFilter(key: string): Promise<void> {
		const arr = [...(plugin.settings.taskSidebarFilterUncheckedArea ?? [])];
		const i = arr.indexOf(key);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(key);
		await plugin.patchSettings({taskSidebarFilterUncheckedArea: arr});
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

	function isAreaChecked(key: string): boolean {
		return !uncheckedArea.has(key);
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
		return `${groupBy}:${label}`;
	}

	function isGroupCollapsed(label: string): boolean {
		return collapsedGroups.has(groupKey(label));
	}

	function toggleGroup(label: string): void {
		const key = groupKey(label);
		const next = new Set(collapsedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedGroups = next;
	}

	function onGroupHeaderClick(ev: MouseEvent, label: string): void {
		const t = ev.target as HTMLElement | null;
		if (t?.closest(".fulcrum-project-list-panel__open-area-note")) return;
		toggleGroup(label);
	}

	function onGroupHeaderKeydown(ev: KeyboardEvent, label: string): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		toggleGroup(label);
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

<div class="fulcrum-task-list-panel fulcrum-project-list-panel">
	<div class="fulcrum-project-list-panel__facets-shell">
		<button
			type="button"
			class="fulcrum-project-list-panel__facets-toggle"
			aria-expanded={!facetsCollapsed}
			aria-controls="fulcrum-task-list-panel-facets"
			on:click={() => toggleFacetsCollapsed()}
		>
			<span class="fulcrum-project-list-panel__facets-toggle-label">Filters</span>
			<span
				class="fulcrum-project-list-panel__facets-toggle-chevron"
				class:fulcrum-project-list-panel__facets-toggle-chevron--collapsed={facetsCollapsed}
				aria-hidden="true"
			>▾</span>
		</button>
		{#if !facetsCollapsed}
			<div id="fulcrum-task-list-panel-facets" class="fulcrum-project-list-panel__facets">
				<div class="fulcrum-project-list-panel__facet-row">
					<span class="fulcrum-project-list-panel__facet-label">Group</span>
					<div class="fulcrum-project-list-panel__facet-controls">
						<select
							class="dropdown fulcrum-project-list-panel__facet-select"
							aria-label="Group tasks by"
							value={groupBy}
							on:change={(e) => void onGroupByChange(e)}
						>
							<option value="area">Area</option>
							<option value="status">Status</option>
							<option value="project">Project</option>
							<option value="none">None</option>
						</select>
					</div>
				</div>
				<div class="fulcrum-project-list-panel__facet-row">
					<span class="fulcrum-project-list-panel__facet-label">Sort</span>
					<div class="fulcrum-project-list-panel__facet-controls">
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
					</div>
				</div>
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
								{uncheckedStatus.size > 0 || uncheckedArea.size > 0 || uncheckedProject.size > 0
									? "Filtered"
									: "All"}
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
							{#if filterOpen}
								<div class="fulcrum-project-list-panel__filter-panel fulcrum-task-list-panel__filter-panel" role="menu">
									<div class="fulcrum-project-list-panel__filter-section">
										<div class="fulcrum-project-list-panel__filter-section-title">Status</div>
										{#each statusOptions as opt}
											<label class="fulcrum-project-list-panel__filter-check">
												<input
													type="checkbox"
													checked={isStatusChecked(opt.key)}
													on:change={() => void toggleStatusFilter(opt.key)}
												/>
												<span>{opt.label}</span>
											</label>
										{/each}
									</div>
									<div class="fulcrum-project-list-panel__filter-section">
										<div class="fulcrum-project-list-panel__filter-section-title">Area</div>
										{#each areaOptions as opt}
											<label class="fulcrum-project-list-panel__filter-check">
												<input
													type="checkbox"
													checked={isAreaChecked(opt.key)}
													on:change={() => void toggleAreaFilter(opt.key)}
												/>
												<span>{opt.label}</span>
											</label>
										{/each}
									</div>
									<div class="fulcrum-project-list-panel__filter-section">
										<div class="fulcrum-project-list-panel__filter-section-title">Project</div>
										{#each projectOptions as opt}
											<label class="fulcrum-project-list-panel__filter-check">
												<input
													type="checkbox"
													checked={isProjectChecked(opt.key)}
													on:change={() => void toggleProjectFilter(opt.key)}
												/>
												<span>{opt.label}</span>
											</label>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="fulcrum-project-list-panel__facet-row">
					<span class="fulcrum-project-list-panel__facet-label">Search</span>
					<div class="fulcrum-project-list-panel__facet-controls">
						<input
							type="text"
							class="fulcrum-project-list-panel__facet-input"
							placeholder="Filter by task title…"
							aria-label="Search tasks"
							bind:value={searchQuery}
						/>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<section class="fulcrum-task-list-panel__unscheduled" aria-label="Unscheduled tasks">
		<div class="fulcrum-task-list-panel__unscheduled-head">
			<h3 class="fulcrum-task-list-panel__unscheduled-title">Unscheduled</h3>
			<label class="fulcrum-calendar__schedule-mode">
				<span class="fulcrum-calendar__schedule-mode-label">Set date as</span>
				<select
					class="dropdown fulcrum-calendar__schedule-mode-select"
					aria-label="Date field when scheduling tasks"
					value={scheduleDateMode}
					on:change={(e) => void onScheduleModeChange(e)}
				>
					<option value="due">Due</option>
					<option value="scheduled">Scheduled</option>
					<option value="ask">Ask each time</option>
				</select>
			</label>
		</div>
		{#if unscheduledTasks.length === 0}
			<p class="fulcrum-muted fulcrum-task-list-panel__unscheduled-empty">No unscheduled tasks.</p>
		{:else}
			<ul class="fulcrum-task-list-panel__unscheduled-list" role="list">
				{#each unscheduledTasks as task (calendarTaskDragKey(task))}
					<li
						class="fulcrum-task-list-panel__drag-row"
						class:fulcrum-task-list-panel__drag-row--dragging={draggedTaskKey === calendarTaskDragKey(task)}
					>
						<span
							class="fulcrum-calendar__unscheduled-grip"
							aria-hidden="true"
							draggable="true"
							role="button"
							tabindex="0"
							aria-label="Drag to calendar"
							on:dragstart={(e) => onTaskDragStart(e, task)}
							on:dragend={onTaskDragEnd}
						>⋮⋮</span>
						<div class="fulcrum-task-list-panel__card-wrap">
							<TaskCard
								{plugin}
								{task}
								done={false}
								showProjectLink={true}
								anchorLeaf={hoverParentLeaf}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if openTasksRaw.length === 0}
		<p class="fulcrum-muted fulcrum-project-list-panel__empty">No open tasks in index.</p>
	{:else if groupBy === "none"}
		{#if flatTasks.length === 0}
			<p class="fulcrum-muted fulcrum-project-list-panel__empty">No scheduled tasks match your filters.</p>
		{:else}
		<ul class="fulcrum-task-list-panel__list">
			{#each flatTasks as task (calendarTaskDragKey(task))}
				<li
					class="fulcrum-task-list-panel__drag-row"
					class:fulcrum-task-list-panel__drag-row--dragging={draggedTaskKey === calendarTaskDragKey(task)}
				>
					<span
						class="fulcrum-calendar__unscheduled-grip"
						aria-hidden="true"
						draggable="true"
						role="button"
						tabindex="0"
						aria-label="Drag task"
						on:dragstart={(e) => onTaskDragStart(e, task)}
						on:dragend={onTaskDragEnd}
					>⋮⋮</span>
					<div class="fulcrum-task-list-panel__card-wrap">
						<TaskCard {plugin} {task} done={false} showProjectLink={true} anchorLeaf={hoverParentLeaf} />
					</div>
				</li>
			{/each}
		</ul>
		{/if}
	{:else}
		{#each taskGroups as group (group.label)}
			{#if group.tasks.length > 0}
				<section class="fulcrum-project-list-panel__group">
					{#if group.label}
						<div
							class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle"
							role="button"
							tabindex="0"
							aria-expanded={!isGroupCollapsed(group.label)}
							on:click={(e) => onGroupHeaderClick(e, group.label)}
							on:keydown={(e) => onGroupHeaderKeydown(e, group.label)}
						>
							<div class="fulcrum-project-list-panel__group-header-main">
								{#if group.area}
									<h3 class="fulcrum-dashboard__area-group-title fulcrum-project-list-panel__group-title-row">
										<span class="fulcrum-area-icon">{group.area.icon ?? "▸"}</span>
										<span class="fulcrum-project-list-panel__group-title-text">{group.label}</span>
										<button
											type="button"
											class="fulcrum-project-list-panel__open-area-note"
											title="Open area note"
											aria-label="Open area note"
											on:click|stopPropagation={() => {
												if (group.area) openAreaFile(group.area.file.path);
											}}
										>
											↗
										</button>
									</h3>
								{:else}
									<h3 class="fulcrum-dashboard__area-group-title">
										{group.label}
										<span class="fulcrum-muted"> ({group.tasks.length})</span>
									</h3>
								{/if}
							</div>
							<span
								class="fulcrum-project-list-panel__group-chevron"
								class:fulcrum-project-list-panel__group-chevron--collapsed={isGroupCollapsed(group.label)}
								aria-hidden="true"
							>▾</span>
						</div>
					{/if}
					{#if !group.label || !isGroupCollapsed(group.label)}
						<ul class="fulcrum-task-list-panel__list">
							{#each group.tasks as task (calendarTaskDragKey(task))}
								<li
									class="fulcrum-task-list-panel__drag-row"
									class:fulcrum-task-list-panel__drag-row--dragging={draggedTaskKey === calendarTaskDragKey(task)}
								>
									<span
										class="fulcrum-calendar__unscheduled-grip"
										aria-hidden="true"
										draggable="true"
										role="button"
										tabindex="0"
										aria-label="Drag task"
										on:dragstart={(e) => onTaskDragStart(e, task)}
										on:dragend={onTaskDragEnd}
									>⋮⋮</span>
									<div class="fulcrum-task-list-panel__card-wrap">
										<TaskCard {plugin} {task} done={false} showProjectLink={true} anchorLeaf={hoverParentLeaf} />
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		{/each}
	{/if}
</div>

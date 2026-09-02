<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
	import {
		areaFilterState,
		indexRevision,
		settingsRevision,
		viewProjectFilterPaths,
		clearViewProjectFilterPaths,
		readViewProjectFilterMultiselect,
		setViewProjectFilterMultiselect,
		toggleViewProjectFilterPath,
	} from "../fulcrum/stores";
	import {buildAreaLifeModeMap, filterProjectsByAreaFocus} from "../fulcrum/utils/areaFocusFilter";
	import {parseDoneStatusSet, isProjectDone, isProjectActive, parseList} from "../fulcrum/settingsDefaults";
	import type {IndexedArea, IndexedProject} from "../fulcrum/types";
	import {buildProjectSidebarCounts} from "../fulcrum/utils/projectSidebarCounts";
	import {sortIndexedProjects} from "../fulcrum/utils/projectListSort";
	import {daysUntilCalendar} from "../fulcrum/utils/dates";
	import ProjectListRow from "./ProjectListRow.svelte";
	import FulcrumFacetPanel from "./shared/FulcrumFacetPanel.svelte";
	import FulcrumFacetRow from "./shared/FulcrumFacetRow.svelte";
	import FulcrumFilterPopover from "./shared/FulcrumFilterPopover.svelte";
	import FulcrumCollapsibleHead from "./shared/FulcrumCollapsibleHead.svelte";
	import {
		loadCollapsedGroupKeys,
		saveCollapsedGroupKeys,
		toggleCollapsedGroupKey,
	} from "../fulcrum/utils/collapsibleGroups";

	const NONE_KEY = "__none__";
	const FACETS_COLLAPSED_KEY = "fulcrum-sidebar-facets-collapsed";
	const GROUPS_COLLAPSED_KEY = "fulcrum-sidebar-groups-collapsed";

	export let plugin: FulcrumHost;
	/** When set, opening area notes uses split + companion chrome beside Fulcrum. */
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	/** Collapsed group keys: `groupBy:label` */
	let collapsedGroupKeys = loadCollapsedGroupKeys(GROUPS_COLLAPSED_KEY);
	export let selectedPath: string | null = null;
	export let onSelectProject: (path: string) => void;
	/** When true, project rows can be dragged onto the Kanban board. */
	export let sidebarDraggable = false;
	/** Sidebar selects projects to filter the main view (Horizon / Kanban). */
	export let projectFilterMode = false;
	/** When false in filter mode, hide group/sort/filter facets (Horizon embed). */
	export let showFacets = true;

	let filterMultiselect = readViewProjectFilterMultiselect();

	let facetsCollapsed = false;
	let filterOpen = false;
	let filterAnchorEl: HTMLDivElement | null = null;
	let searchQuery = "";

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
	$: doneTask = (void sRev, parseDoneStatusSet(plugin.settings.taskDoneStatuses));

	$: areaFilter = $areaFilterState;
	$: filterSelectedPaths = $viewProjectFilterPaths;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});

	/** Per-project counts for sidebar notifications. */
	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);
	$: activeProjectRaw = (void sRev, filterProjectsByAreaFocus(
		snapshot.projects.filter((p) =>
			projectFilterMode ? isProjectActive(p, plugin.settings) : !isProjectDone(p, plugin.settings),
		),
		areaFilter,
		lifeModeMap,
	));
	/** Applied filter (from settings) - used for displayed list. Re-read when settings change. */
	$: uncheckedStatus = (void sRev, new Set(plugin.settings.projectSidebarFilterUncheckedStatus ?? []));

	// Indexed status options: all unique status values from active projects + None
	$: statusOptions = ((): { key: string; label: string }[] => {
		const seen = new Set<string>();
		const out: { key: string; label: string }[] = [];
		for (const p of activeProjectRaw) {
			const k = p.status?.trim() ? p.status : NONE_KEY;
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({
				key: k,
				label: k === NONE_KEY ? "None" : p.status.replace(/\b\w/g, (c) => c.toUpperCase()),
			});
		}
		// Always include None option
		if (!seen.has(NONE_KEY)) {
			out.push({ key: NONE_KEY, label: "None" });
		}
		// Sort: None last, then alphabetically
		out.sort((a, b) =>
			a.key === NONE_KEY ? 1 : b.key === NONE_KEY ? -1 : a.label.localeCompare(b.label),
		);
		return out;
	})();

	// Filter: project passes if status checked (or all status checked).
	$: activeProject = ((): IndexedProject[] => {
		if (uncheckedStatus.size === 0) return activeProjectRaw;
		const statusSetLc = new Set([...uncheckedStatus].map((s) => s.toLowerCase()));
		return activeProjectRaw.filter((p) => {
			const statusKey = p.status?.trim() ? p.status : NONE_KEY;
			return !statusSetLc.has(statusKey.toLowerCase());
		});
	})();

	// Live text filter: substring match on project title or area (case-insensitive)
	$: activeProjectFiltered = ((): IndexedProject[] => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return activeProject;
		return activeProject.filter((p) => {
			if (p.name.toLowerCase().includes(q)) return true;
			const area = p.areaName?.trim() || p.areaFiles[0]?.basename.replace(/\.md$/i, "") || "";
			return area.toLowerCase().includes(q);
		});
	})();

	$: groupBy = (void sRev, plugin.settings.dashboardActiveProjectsGroupBy);
	$: sortBy = (void sRev, plugin.settings.projectSidebarSortBy);
	$: sortDir = (void sRev, plugin.settings.projectSidebarSortDir);
	$: statusOrder = (void sRev, parseList(plugin.settings.projectStatuses));

	type AreaGroup = {
		kind: "area" | "unassigned" | "orphan";
		label: string;
		area?: IndexedArea;
		projects: IndexedProject[];
	};

	$: areaGroups = ((): AreaGroup[] => {
		const list = activeProjectFiltered;
		const byAreaPath = new Map<string, IndexedProject[]>();
		for (const p of list) {
			if (p.areaFiles.length === 0) {
				const cur = byAreaPath.get("__none__") ?? [];
				cur.push(p);
				byAreaPath.set("__none__", cur);
			} else {
				for (const af of p.areaFiles) {
					const cur = byAreaPath.get(af.path) ?? [];
					cur.push(p);
					byAreaPath.set(af.path, cur);
				}
			}
		}
		const out: AreaGroup[] = [];
		for (const a of snapshot.areas) {
			const ps = byAreaPath.get(a.file.path);
			if (ps?.length) {
				out.push({kind: "area", label: a.name, area: a, projects: sortIndexedProjects(ps, sortBy, sortDir)});
				byAreaPath.delete(a.file.path);
			}
		}
		const un = byAreaPath.get("__none__");
		if (un?.length) {
			out.push({kind: "unassigned", label: "Unassigned", projects: sortIndexedProjects(un, sortBy, sortDir)});
			byAreaPath.delete("__none__");
		}
		for (const [, ps] of byAreaPath) {
			if (!ps.length) continue;
			const sample = ps[0];
			const orphanAf = sample?.areaFiles[0];
			const label =
				sample?.areaName?.trim() ||
				orphanAf?.path.split("/").pop()?.replace(/\.md$/i, "") ||
				"Other";
			out.push({kind: "orphan", label, projects: sortIndexedProjects(ps, sortBy, sortDir)});
		}
		return out;
	})();

	$: statusGroups = (() => {
		const map = new Map<string, IndexedProject[]>();
		for (const p of activeProjectFiltered) {
			const k = p.status || "";
			const cur = map.get(k) ?? [];
			cur.push(p);
			map.set(k, cur);
		}
		const keys = [...map.keys()];
		keys.sort((a, b) => {
			const ia = statusOrder.indexOf(a.toLowerCase());
			const ib = statusOrder.indexOf(b.toLowerCase());
			const ua = ia === -1;
			const ub = ib === -1;
			if (ua && ub) return a.localeCompare(b);
			if (ua) return 1;
			if (ub) return -1;
			return ia - ib;
		});
		return keys.map((k) => ({
			statusKey: k,
			label: k ? k.replace(/\b\w/g, (c) => c.toUpperCase()) : "Folder root",
			projects: sortIndexedProjects(map.get(k) ?? [], sortBy, sortDir),
		}));
	})();

	$: reviewDueGroups = (() => {
		const due: IndexedProject[] = [];
		const upcoming: IndexedProject[] = [];
		const none: IndexedProject[] = [];
		for (const p of activeProjectFiltered) {
			const iso = p.nextReview?.trim();
			if (!iso) {
				none.push(p);
				continue;
			}
			const d = daysUntilCalendar(iso);
			if (d === null) {
				none.push(p);
				continue;
			}
			if (d <= 0) due.push(p);
			else upcoming.push(p);
		}
		const out: { label: string; projects: IndexedProject[] }[] = [];
		if (due.length)
			out.push({ label: "Review due", projects: sortIndexedProjects(due, sortBy, sortDir) });
		if (upcoming.length)
			out.push({
				label: "Review upcoming",
				projects: sortIndexedProjects(upcoming, sortBy, sortDir),
			});
		if (none.length)
			out.push({
				label: "No review date",
				projects: sortIndexedProjects(none, sortBy, sortDir),
			});
		return out;
	})();

	async function onGroupByChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as FulcrumSettings["dashboardActiveProjectsGroupBy"];
		await plugin.patchSettings({dashboardActiveProjectsGroupBy: v});
	}

	async function onSortByChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as FulcrumSettings["projectSidebarSortBy"];
		await plugin.patchSettings({projectSidebarSortBy: v});
	}

	async function toggleSortDir(): Promise<void> {
		const next = plugin.settings.projectSidebarSortDir === "asc" ? "desc" : "asc";
		await plugin.patchSettings({projectSidebarSortDir: next});
	}

	async function toggleStatusFilter(key: string): Promise<void> {
		const keyLc = key.toLowerCase();
		const arr = [...(plugin.settings.projectSidebarFilterUncheckedStatus ?? [])];
		const i = arr.findIndex((s) => s.toLowerCase() === keyLc);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(keyLc);
		await plugin.patchSettings({projectSidebarFilterUncheckedStatus: arr});
	}

	$: uncheckedStatusLc = new Set([...uncheckedStatus].map((s) => s.toLowerCase()));

	function isStatusChecked(key: string): boolean {
		return !uncheckedStatusLc.has(key.toLowerCase());
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
		const panel = document.querySelector(".fulcrum-project-list-panel__filter-panel");
		if (panel?.contains(t)) return;
		filterOpen = false;
	}

	function openAreaFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	function groupKey(label: string): string {
		return `${groupBy}:${label}`;
	}

	$: projectFilterSections = [
		{
			title: "Status",
			options: statusOptions,
			isChecked: isStatusChecked,
			onToggle: toggleStatusFilter,
		},
	];

	function toggleGroup(label: string): void {
		const key = groupKey(label);
		collapsedGroupKeys = toggleCollapsedGroupKey(collapsedGroupKeys, key);
		saveCollapsedGroupKeys(GROUPS_COLLAPSED_KEY, collapsedGroupKeys);
	}

	function onToggleProjectFilter(path: string, additive: boolean): void {
		toggleViewProjectFilterPath(path, additive);
	}

	function toggleFilterMultiselect(): void {
		filterMultiselect = !filterMultiselect;
		setViewProjectFilterMultiselect(filterMultiselect);
	}
</script>

<svelte:window on:click={handleFilterClickOutside} />

<div
	class="fulcrum-project-list-panel"
	class:fulcrum-project-list-panel--filter-mode={projectFilterMode}
>
	{#if projectFilterMode}
		<div class="fulcrum-project-list-panel__filter-search">
			<input
				type="search"
				class="fulcrum-project-list-panel__filter-search-input"
				placeholder="Search projects…"
				aria-label="Search projects"
				bind:value={searchQuery}
			/>
		</div>
	{/if}
	{#if !projectFilterMode || showFacets}
	<FulcrumFacetPanel
		collapsed={facetsCollapsed}
		panelId="fulcrum-project-list-panel-facets"
		onToggle={() => toggleFacetsCollapsed()}
	>
		<FulcrumFacetRow label="Group">
			<select
				class="dropdown fulcrum-project-list-panel__facet-select"
				aria-label="Group projects by"
				value={groupBy}
				on:change={(e) => void onGroupByChange(e)}
			>
				<option value="area">Area</option>
				<option value="status">Status</option>
				<option value="reviewDue">Review due</option>
				<option value="none">None</option>
			</select>
		</FulcrumFacetRow>
		<FulcrumFacetRow label="Sort">
			<select
				class="dropdown fulcrum-project-list-panel__facet-select"
				aria-label="Sort projects by"
				value={sortBy}
				on:change={(e) => void onSortByChange(e)}
			>
				<option value="launch">Launch date</option>
				<option value="nextReview">Next review</option>
				<option value="rank">Rank</option>
				<option value="name">Name</option>
			</select>
			<button
				type="button"
				class="fulcrum-project-list-panel__sort-dir"
				title={sortDir === "asc" ? "Ascending (click for descending)" : "Descending (click for ascending)"}
				aria-label={sortDir === "asc" ? "Sort ascending, switch to descending" : "Sort descending, switch to ascending"}
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
						aria-label="Filter projects by status"
						aria-expanded={filterOpen}
						aria-haspopup="true"
						on:click|stopPropagation={() => openFilterPanel()}
					>
						{uncheckedStatus.size > 0 ? "Filtered" : "All"}
					</button>
					<button
						type="button"
						class="fulcrum-project-list-panel__sort-dir fulcrum-project-list-panel__filter-apply"
						title="Apply filters and refresh list"
						aria-label="Apply filters and refresh list"
						on:click={() => void applyFilters()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
					</button>
					<FulcrumFilterPopover open={filterOpen} sections={projectFilterSections} />
				</div>
			</div>
		</div>
		<FulcrumFacetRow label="Search">
			<input
				type="text"
				class="fulcrum-project-list-panel__facet-input"
				placeholder="Filter by project title…"
				aria-label="Filter projects by title"
				bind:value={searchQuery}
			/>
		</FulcrumFacetRow>
	</FulcrumFacetPanel>
	{/if}
	{#if projectFilterMode}
		<div class="fulcrum-project-list-panel__filter-bar">
			<span class="fulcrum-project-list-panel__filter-bar-label">Projects</span>
			<div class="fulcrum-project-list-panel__filter-bar-actions">
				<button
					type="button"
					class="fulcrum-project-list-panel__filter-bar-btn"
					class:fulcrum-project-list-panel__filter-bar-btn--active={filterMultiselect}
					title="Multi-select: click rows to toggle without ⌘/Ctrl"
					aria-label="Toggle multi-select"
					aria-pressed={filterMultiselect}
					on:click={() => toggleFilterMultiselect()}
				>
					Multi
				</button>
				{#if filterSelectedPaths.size > 0}
					<button
						type="button"
						class="fulcrum-project-list-panel__filter-bar-btn"
						title="Clear project filter"
						aria-label="Clear project filter"
						on:click={() => clearViewProjectFilterPaths()}
					>
						Clear
					</button>
				{/if}
			</div>
		</div>
	{/if}
	<div
		class="fulcrum-project-list-panel__body"
		class:fulcrum-project-list-panel__body--filter-scroll={projectFilterMode}
	>
	{#if activeProjectFiltered.length === 0}
		<p class="fulcrum-muted fulcrum-project-list-panel__empty">
			{searchQuery.trim()
				? "No projects match your search."
				: "No active projects."}
		</p>
	{:else if groupBy === "none"}
		<ul class="fulcrum-sidebar-project-list">
			{#each sortIndexedProjects(activeProjectFiltered, sortBy, sortDir) as p (p.file.path)}
				<li>
					<ProjectListRow
						{plugin}
						{hoverParentLeaf}
						{sidebarDraggable}
						{projectFilterMode}
						{filterMultiselect}
						filterSelectedPaths={filterSelectedPaths}
						onToggleProjectFilter={onToggleProjectFilter}
						{p}
						{selectedPath}
						{onSelectProject}
						openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
						upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
					/>
				</li>
			{/each}
		</ul>
	{:else if groupBy === "area"}
		{#each areaGroups as g}
			{@const groupCollapsed = collapsedGroupKeys.has(groupKey(g.label))}
			<div class="fulcrum-dashboard__area-group fulcrum-project-list-panel__group">
				<div class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle">
					<FulcrumCollapsibleHead
						title={g.label}
						areaIcon={g.kind === "area" ? g.area?.icon : undefined}
						expanded={!groupCollapsed}
						onToggle={() => toggleGroup(g.label)}
					/>
					{#if g.kind === "area" && g.area}
						<button
							type="button"
							class="fulcrum-project-list-panel__open-area-note"
							title="Open area note"
							aria-label="Open area note"
							on:click={() => openAreaFile(g.area?.file.path ?? "")}
						>
							↗
						</button>
					{/if}
				</div>
				{#if !groupCollapsed}
					<ul class="fulcrum-sidebar-project-list">
						{#each g.projects as p}
							<li>
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{sidebarDraggable}
									{projectFilterMode}
									{filterMultiselect}
									filterSelectedPaths={filterSelectedPaths}
									onToggleProjectFilter={onToggleProjectFilter}
									{p}
									{selectedPath}
									{onSelectProject}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	{:else if groupBy === "reviewDue"}
		{#each reviewDueGroups as rg}
			{@const groupCollapsed = collapsedGroupKeys.has(groupKey(rg.label))}
			<div class="fulcrum-dashboard__area-group fulcrum-project-list-panel__group">
				<div class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle">
					<FulcrumCollapsibleHead
						title={rg.label}
						expanded={!groupCollapsed}
						onToggle={() => toggleGroup(rg.label)}
					/>
				</div>
				{#if !groupCollapsed}
					<ul class="fulcrum-sidebar-project-list">
						{#each rg.projects as p}
							<li>
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{sidebarDraggable}
									{projectFilterMode}
									{filterMultiselect}
									filterSelectedPaths={filterSelectedPaths}
									onToggleProjectFilter={onToggleProjectFilter}
									{p}
									{selectedPath}
									{onSelectProject}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	{:else if groupBy === "status"}
		{#each statusGroups as sg}
			{@const groupCollapsed = collapsedGroupKeys.has(groupKey(sg.label))}
			<div class="fulcrum-dashboard__area-group fulcrum-project-list-panel__group">
				<div class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle">
					<FulcrumCollapsibleHead
						title={sg.label}
						expanded={!groupCollapsed}
						onToggle={() => toggleGroup(sg.label)}
					/>
				</div>
				{#if !groupCollapsed}
					<ul class="fulcrum-sidebar-project-list">
						{#each sg.projects as p}
							<li>
								<ProjectListRow
									{plugin}
									{hoverParentLeaf}
									{sidebarDraggable}
									{projectFilterMode}
									{filterMultiselect}
									filterSelectedPaths={filterSelectedPaths}
									onToggleProjectFilter={onToggleProjectFilter}
									{p}
									{selectedPath}
									{onSelectProject}
									openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
									upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	{/if}
	</div>
</div>

<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {buildAreaWorkRelatedMap, filterProjectsWorkRelated} from "../fulcrum/utils/workRelatedProjectFilter";
	import {parseList} from "../fulcrum/settingsDefaults";
	import type {IndexedArea, IndexedProject} from "../fulcrum/types";
	import {buildProjectSidebarCounts} from "../fulcrum/utils/projectSidebarCounts";
	import {sortIndexedProjects} from "../fulcrum/utils/projectListSort";
	import ProjectListRow from "./ProjectListRow.svelte";

	const NONE_KEY = "__none__";

	export let plugin: FulcrumHost;
	/** When set, opening area notes uses split + companion chrome beside Fulcrum. */
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	/** Set of group keys that are collapsed. Key = `groupBy:label` */
	let collapsedGroups = new Set<string>();
	export let selectedPath: string | null = null;
	export let onSelectProject: (path: string) => void;

	let filterOpen = false;
	let filterAnchorEl: HTMLDivElement | null = null;
	let searchQuery = "";

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneProject = (void sRev, new Set(parseList(plugin.settings.projectDoneStatuses)));
	$: doneTask = (void sRev, new Set(parseList(plugin.settings.taskDoneStatuses)));

	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
	});
	$: onlyWork = $workRelatedOnly;

	/** Per-project counts for sidebar notifications. */
	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);
	$: activeProjectRaw = filterProjectsWorkRelated(
		snapshot.projects.filter((p) => !doneProject.has((p.status ?? "").trim().toLowerCase())),
		onlyWork,
		areaWorkMap,
	);
	/** Applied filter (from settings) - used for displayed list. Re-read when settings change. */
	$: uncheckedStatus = (void sRev, new Set(plugin.settings.projectSidebarFilterUncheckedStatus ?? []));
	$: uncheckedArea = (void sRev, new Set(plugin.settings.projectSidebarFilterUncheckedArea ?? []));

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

	// Indexed area options: snapshot.areas + areas linked from projects (covers area files without type=area)
	$: areaOptions = ((): { key: string; label: string }[] => {
		const byPath = new Map<string, string>();
		for (const a of snapshot.areas) {
			byPath.set(a.file.path, a.name);
		}
		for (const p of activeProjectRaw) {
			for (const af of p.areaFiles) {
				const label =
					(p.areaFiles.length === 1
						? p.areaName?.trim() || af.basename.replace(/\.md$/i, "")
						: af.basename.replace(/\.md$/i, "")) || af.path;
				if (!byPath.has(af.path)) byPath.set(af.path, label);
			}
		}
		const out: { key: string; label: string }[] = [];
		for (const [path, name] of byPath) out.push({ key: path, label: name });
		const hasNone = activeProjectRaw.some((p) => p.areaFiles.length === 0);
		if (hasNone || out.length === 0) out.push({ key: NONE_KEY, label: "None" });
		out.sort((a, b) => (a.key === NONE_KEY ? 1 : b.key === NONE_KEY ? -1 : a.label.localeCompare(b.label)));
		return out;
	})();

	// Filter: project passes if (status checked OR all status checked) AND (area checked OR all area checked)
	// Compare case-insensitively since status can vary in casing across projects.
	$: activeProject = ((): IndexedProject[] => {
		if (uncheckedStatus.size === 0 && uncheckedArea.size === 0) return activeProjectRaw;
		const statusUnchecked = uncheckedStatus.size > 0;
		const areaUnchecked = uncheckedArea.size > 0;
		const statusSetLc = new Set([...uncheckedStatus].map((s) => s.toLowerCase()));
		return activeProjectRaw.filter((p) => {
			const statusKey = p.status?.trim() ? p.status : NONE_KEY;
			const areaPass =
				!areaUnchecked ||
				(p.areaFiles.length === 0
					? !uncheckedArea.has(NONE_KEY)
					: p.areaFiles.some((af) => !uncheckedArea.has(af.path)));
			const statusPass =
				!statusUnchecked || !statusSetLc.has(statusKey.toLowerCase());
			return statusPass && areaPass;
		});
	})();

	// Live text filter: substring match on project title (case-insensitive)
	$: activeProjectFiltered = ((): IndexedProject[] => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return activeProject;
		return activeProject.filter((p) => p.name.toLowerCase().includes(q));
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

	async function toggleAreaFilter(key: string): Promise<void> {
		const arr = [...(plugin.settings.projectSidebarFilterUncheckedArea ?? [])];
		const i = arr.indexOf(key);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(key);
		await plugin.patchSettings({projectSidebarFilterUncheckedArea: arr});
	}

	$: uncheckedStatusLc = new Set([...uncheckedStatus].map((s) => s.toLowerCase()));

	function isStatusChecked(key: string): boolean {
		return !uncheckedStatusLc.has(key.toLowerCase());
	}

	function isAreaChecked(key: string): boolean {
		return !uncheckedArea.has(key);
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

	function onGroupHeaderKeydown(ev: KeyboardEvent, label: string): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		toggleGroup(label);
	}
</script>

<svelte:window on:click={handleFilterClickOutside} />

<div class="fulcrum-project-list-panel">
	<div class="fulcrum-project-list-panel__facets">
		<div class="fulcrum-project-list-panel__facet-row">
			<span class="fulcrum-project-list-panel__facet-label">Group</span>
			<select
				class="dropdown fulcrum-project-list-panel__facet-select"
				aria-label="Group projects by"
				value={groupBy}
				on:change={(e) => void onGroupByChange(e)}
			>
				<option value="area">Area</option>
				<option value="status">Status</option>
				<option value="none">None</option>
			</select>
		</div>
		<div class="fulcrum-project-list-panel__facet-row">
			<span class="fulcrum-project-list-panel__facet-label">Sort</span>
			<select
				class="dropdown fulcrum-project-list-panel__facet-select fulcrum-project-list-panel__facet-select--grow"
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
		</div>
		<div
			class="fulcrum-project-list-panel__facet-row fulcrum-project-list-panel__facet-row--filter"
			bind:this={filterAnchorEl}
		>
			<span class="fulcrum-project-list-panel__facet-label">Filter</span>
			<div class="fulcrum-project-list-panel__filter-wrap">
				<button
					type="button"
					class="dropdown fulcrum-project-list-panel__facet-select fulcrum-project-list-panel__facet-select--grow fulcrum-project-list-panel__filter-trigger"
					aria-label="Filter projects by status and area"
					aria-expanded={filterOpen}
					aria-haspopup="true"
					on:click|stopPropagation={() => openFilterPanel()}
				>
					{uncheckedStatus.size > 0 || uncheckedArea.size > 0 ? "Filtered" : "All"}
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
				{#if filterOpen}
					<div
						class="fulcrum-project-list-panel__filter-panel"
						role="menu"
						aria-label="Filter options"
					>
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
					</div>
				{/if}
			</div>
		</div>
		<div class="fulcrum-project-list-panel__facet-row">
			<span class="fulcrum-project-list-panel__facet-label">Search</span>
			<input
				type="text"
				class="fulcrum-project-list-panel__facet-input"
				placeholder="Filter by project title…"
				aria-label="Filter projects by title"
				bind:value={searchQuery}
			/>
		</div>
	</div>
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
			<div class="fulcrum-dashboard__area-group fulcrum-project-list-panel__group">
				<div
					class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle"
					role="button"
					tabindex="0"
					aria-expanded={!isGroupCollapsed(g.label)}
					on:click={() => toggleGroup(g.label)}
					on:keydown={(e) => onGroupHeaderKeydown(e, g.label)}
				>
					<div class="fulcrum-project-list-panel__group-header-main">
						{#if g.kind === "area" && g.area}
							<h3 class="fulcrum-dashboard__area-group-title fulcrum-project-list-panel__group-title-row">
								<span class="fulcrum-area-icon">{g.area?.icon ?? "▸"}</span>
								<span class="fulcrum-project-list-panel__group-title-text">{g.label}</span>
								<button
									type="button"
									class="fulcrum-project-list-panel__open-area-note"
									title="Open area note"
									aria-label="Open area note"
									on:click|stopPropagation={() => openAreaFile(g.area?.file.path ?? "")}
								>
									↗
								</button>
							</h3>
						{:else}
							<h3 class="fulcrum-dashboard__area-group-title">{g.label}</h3>
						{/if}
					</div>
					<span
						class="fulcrum-project-list-panel__group-chevron"
						class:fulcrum-project-list-panel__group-chevron--collapsed={isGroupCollapsed(g.label)}
						aria-hidden="true"
					>▾</span>
				</div>
				{#if !isGroupCollapsed(g.label)}
					<ul class="fulcrum-sidebar-project-list">
						{#each g.projects as p}
							<li>
								<ProjectListRow
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
	{:else}
		{#each statusGroups as sg}
			<div class="fulcrum-dashboard__area-group fulcrum-project-list-panel__group">
				<div
					class="fulcrum-project-list-panel__group-header fulcrum-project-list-panel__group-header--toggle"
					role="button"
					tabindex="0"
					aria-expanded={!isGroupCollapsed(sg.label)}
					on:click={() => toggleGroup(sg.label)}
					on:keydown={(e) => onGroupHeaderKeydown(e, sg.label)}
				>
					<div class="fulcrum-project-list-panel__group-header-main">
						<h3 class="fulcrum-dashboard__area-group-title">{sg.label}</h3>
					</div>
					<span
						class="fulcrum-project-list-panel__group-chevron"
						class:fulcrum-project-list-panel__group-chevron--collapsed={isGroupCollapsed(sg.label)}
						aria-hidden="true"
					>▾</span>
				</div>
				{#if !isGroupCollapsed(sg.label)}
					<ul class="fulcrum-sidebar-project-list">
						{#each sg.projects as p}
							<li>
								<ProjectListRow
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

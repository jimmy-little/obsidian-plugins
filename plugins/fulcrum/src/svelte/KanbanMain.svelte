<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedArea, IndexedProject} from "../fulcrum/types";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {buildAreaWorkRelatedMap, filterProjectsWorkRelated} from "../fulcrum/utils/workRelatedProjectFilter";
	import {parseList} from "../fulcrum/settingsDefaults";
	import {sortIndexedProjects} from "../fulcrum/utils/projectListSort";
	import {buildProjectSidebarCounts} from "../fulcrum/utils/projectSidebarCounts";
	import ProjectListRow from "./ProjectListRow.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	let showAddColumnMenu = false;
	let addColumnMenuEl: HTMLDivElement | undefined;
	let addColWrapEl: HTMLDivElement | undefined;

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneProject = (void sRev, new Set(parseList(plugin.settings.projectDoneStatuses)));
	$: doneTask = (void sRev, new Set(parseList(plugin.settings.taskDoneStatuses)));
	$: projectCounts = buildProjectSidebarCounts(snapshot, doneTask);
	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
	});
	$: activeProjects = filterProjectsWorkRelated(
		snapshot.projects.filter((p) => !doneProject.has(p.status)),
		$workRelatedOnly,
		areaWorkMap,
	);
	$: columnBy = (void sRev, plugin.settings.kanbanColumnBy);
	$: hiddenSet = (void sRev, new Set(columnBy === "status" ? plugin.settings.kanbanHiddenStatus : plugin.settings.kanbanHiddenArea));
	$: columnOrder = (void sRev, columnBy === "status" ? plugin.settings.kanbanOrderStatus : plugin.settings.kanbanOrderArea);

	type Column = {
		id: string;
		label: string;
		area?: IndexedArea;
		projects: IndexedProject[];
	};

	$: allColumns = ((): Column[] => {
		if (columnBy === "area") {
			const byAreaPath = new Map<string, IndexedProject[]>();
			for (const p of activeProjects) {
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
			const out: Column[] = [];
			for (const a of snapshot.areas) {
				const ps = byAreaPath.get(a.file.path);
				if (ps?.length) {
					out.push({
						id: a.file.path,
						label: a.name,
						area: a,
						projects: sortIndexedProjects(ps, plugin.settings.projectSidebarSortBy, plugin.settings.projectSidebarSortDir),
					});
					byAreaPath.delete(a.file.path);
				}
			}
			const un = byAreaPath.get("__none__");
			if (un?.length) {
				out.push({
					id: "__unassigned__",
					label: "Unassigned",
					projects: sortIndexedProjects(un, plugin.settings.projectSidebarSortBy, plugin.settings.projectSidebarSortDir),
				});
				byAreaPath.delete("__none__");
			}
			for (const [, ps] of byAreaPath) {
				if (!ps.length) continue;
				const sample = ps[0];
				const oa = sample?.areaFiles[0];
				const label =
					sample?.areaName?.trim() ||
					oa?.path.split("/").pop()?.replace(/\.md$/i, "") ||
					"Other";
				out.push({
					id: oa?.path ?? "__other__",
					label,
					projects: sortIndexedProjects(ps, plugin.settings.projectSidebarSortBy, plugin.settings.projectSidebarSortDir),
				});
			}
			return out;
		}
		const statusOrder = parseList(plugin.settings.projectStatuses);
		const map = new Map<string, IndexedProject[]>();
		for (const p of activeProjects) {
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
			id: k || "__root__",
			label: k ? k.replace(/\b\w/g, (c) => c.toUpperCase()) : "Folder root",
			projects: sortIndexedProjects(map.get(k) ?? [], plugin.settings.projectSidebarSortBy, plugin.settings.projectSidebarSortDir),
		}));
	})();

	$: columns = ((): Column[] => {
		const visible = allColumns.filter((c) => !hiddenSet.has(c.id));
		if (columnOrder.length === 0) return visible;
		const byId = new Map(visible.map((c) => [c.id, c]));
		const ordered: Column[] = [];
		for (const id of columnOrder) {
			const c = byId.get(id);
			if (c) {
				ordered.push(c);
				byId.delete(id);
			}
		}
		for (const c of byId.values()) ordered.push(c);
		return ordered;
	})();

	$: hiddenColumns = allColumns.filter((c) => hiddenSet.has(c.id));

	async function onColumnByChange(ev: Event): Promise<void> {
		showAddColumnMenu = false;
		const v = (ev.currentTarget as HTMLSelectElement).value as "status" | "area";
		await plugin.patchSettings({kanbanColumnBy: v});
	}

	async function hideColumn(id: string): Promise<void> {
		if (columnBy === "status") {
			const next = [...plugin.settings.kanbanHiddenStatus, id];
			await plugin.patchSettings({kanbanHiddenStatus: next});
			const order = plugin.settings.kanbanOrderStatus.filter((x) => x !== id);
			if (order.length !== plugin.settings.kanbanOrderStatus.length) {
				await plugin.patchSettings({kanbanOrderStatus: order});
			}
		} else {
			const next = [...plugin.settings.kanbanHiddenArea, id];
			await plugin.patchSettings({kanbanHiddenArea: next});
			const order = plugin.settings.kanbanOrderArea.filter((x) => x !== id);
			if (order.length !== plugin.settings.kanbanOrderArea.length) {
				await plugin.patchSettings({kanbanOrderArea: order});
			}
		}
	}

	async function unhideColumn(id: string): Promise<void> {
		showAddColumnMenu = false;
		if (columnBy === "status") {
			const next = plugin.settings.kanbanHiddenStatus.filter((x) => x !== id);
			await plugin.patchSettings({kanbanHiddenStatus: next});
			const order = [...plugin.settings.kanbanOrderStatus, id];
			await plugin.patchSettings({kanbanOrderStatus: order});
		} else {
			const next = plugin.settings.kanbanHiddenArea.filter((x) => x !== id);
			await plugin.patchSettings({kanbanHiddenArea: next});
			const order = [...plugin.settings.kanbanOrderArea, id];
			await plugin.patchSettings({kanbanOrderArea: order});
		}
	}

	async function reorderColumns(fromId: string, toId: string): Promise<void> {
		const visible = columns.map((c) => c.id);
		const fromIdx = visible.indexOf(fromId);
		const toIdx = visible.indexOf(toId);
		if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
		const next = [...visible];
		next.splice(fromIdx, 1);
		next.splice(toIdx, 0, fromId);
		if (columnBy === "status") {
			await plugin.patchSettings({kanbanOrderStatus: next});
		} else {
			await plugin.patchSettings({kanbanOrderArea: next});
		}
	}

	let draggedColumnId: string | null = null;

	function onColumnDragStart(ev: DragEvent, id: string): void {
		const t = ev.target as HTMLElement;
		if (t.closest("button.fulcrum-kanban__column-hide, button.fulcrum-linklike")) return;
		draggedColumnId = id;
		ev.dataTransfer?.setData("text/plain", id);
		ev.dataTransfer!.effectAllowed = "move";
		if (ev.dataTransfer) ev.dataTransfer.setData("application/x-fulcrum-column", id);
		(ev.currentTarget as HTMLElement)?.parentElement?.classList.add("fulcrum-kanban__column--dragging");
	}

	function onColumnDragEnd(ev: DragEvent): void {
		draggedColumnId = null;
		(ev.currentTarget as HTMLElement)?.parentElement?.classList.remove("fulcrum-kanban__column--dragging");
	}

	function onColumnDragOver(ev: DragEvent, toId: string): void {
		ev.preventDefault();
		if (!draggedColumnId || draggedColumnId === toId) return;
		ev.dataTransfer!.dropEffect = "move";
	}

	function onColumnDrop(ev: DragEvent, toId: string): void {
		ev.preventDefault();
		if (!draggedColumnId || draggedColumnId === toId) return;
		void reorderColumns(draggedColumnId, toId);
	}

	function handleClickOutside(ev: MouseEvent): void {
		if (!showAddColumnMenu) return;
		const t = ev.target as Node;
		// Don't close if click was on the add button or inside the menu
		if (addColWrapEl?.contains(t)) return;
		showAddColumnMenu = false;
	}

	function openProject(path: string): void {
		void plugin.openProjectSummary(path);
	}

	function openAreaFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="fulcrum-kanban" data-fulcrum-kanban-root>
	<div class="fulcrum-kanban__toolbar">
		<label class="fulcrum-kanban__toolbar-label" for="fulcrum-kanban-column-by">
			<span>Columns by</span>
			<select
				id="fulcrum-kanban-column-by"
				class="dropdown fulcrum-kanban__column-select"
				value={columnBy}
				on:change={(e) => void onColumnByChange(e)}
			>
				<option value="status">Status</option>
				<option value="area">Area</option>
			</select>
		</label>
	</div>

	<div class="fulcrum-kanban__board">
		{#each columns as col}
			<div
				class="fulcrum-kanban__column"
				data-column-id={col.id}
				role="group"
				aria-label={col.label}
			>
				<div
					class="fulcrum-kanban__column-head"
					draggable="true"
					role="button"
					tabindex="0"
					aria-label="Drag to reorder column"
					on:dragstart={(e) => onColumnDragStart(e, col.id)}
					on:dragend={onColumnDragEnd}
					on:dragover={(e) => onColumnDragOver(e, col.id)}
					on:drop={(e) => onColumnDrop(e, col.id)}
				>
					{#if col.area}
						<button
							type="button"
							class="fulcrum-linklike fulcrum-kanban__column-title"
							on:click|stopPropagation={() => openAreaFile(col.area.file.path)}
						>
							<span class="fulcrum-area-icon">{col.area.icon ?? "▸"}</span>
							<span>{col.label}</span>
						</button>
					{:else}
						<span class="fulcrum-kanban__column-title">{col.label}</span>
					{/if}
					<div class="fulcrum-kanban__column-head-right">
						<span class="fulcrum-kanban__column-count">{col.projects.length}</span>
						<button
							type="button"
							class="fulcrum-kanban__column-hide clickable-icon"
							aria-label="Hide column"
							title="Hide column"
							on:click|stopPropagation={() => void hideColumn(col.id)}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
						</button>
					</div>
				</div>
				<div class="fulcrum-kanban__column-cards">
					{#each col.projects as p (p.file.path)}
						<div class="fulcrum-kanban__card-cell" data-fulcrum-kanban-card data-project-path={p.file.path}>
							<ProjectListRow
								{plugin}
								{p}
								tile={true}
								selectedPath={null}
								onSelectProject={openProject}
								openTaskCount={projectCounts.get(p.file.path)?.openTasks ?? 0}
								upcomingMeetingCount={projectCounts.get(p.file.path)?.upcomingMeetings ?? 0}
							/>
						</div>
					{/each}
				</div>
			</div>
		{/each}
		<div class="fulcrum-kanban__add-col-wrap" bind:this={addColWrapEl}>
			<button
				type="button"
				class="fulcrum-kanban__add-col-btn clickable-icon"
				aria-label="Add or unhide column"
				title="Add column"
				aria-expanded={showAddColumnMenu}
				aria-haspopup="true"
				on:click|stopPropagation={() => (showAddColumnMenu = !showAddColumnMenu)}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
			</button>
			{#if showAddColumnMenu}
				<div
					class="fulcrum-kanban__add-col-menu"
					bind:this={addColumnMenuEl}
					role="menu"
				>
					{#if hiddenColumns.length === 0}
						<p class="fulcrum-kanban__add-col-empty">No hidden columns. Hide a column to add it back here.</p>
					{:else}
						{#each hiddenColumns as h}
							<button
								type="button"
								class="fulcrum-kanban__add-col-item"
								role="menuitem"
								on:click={() => void unhideColumn(h.id)}
							>
								{h.label}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {KanbanDimension, KanbanSwimlaneDimension} from "../fulcrum/settingsDefaults";
	import {parseList} from "../fulcrum/settingsDefaults";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {buildAreaWorkRelatedMap, filterProjectsWorkRelated} from "../fulcrum/utils/workRelatedProjectFilter";
	import {buildProjectSidebarCounts} from "../fulcrum/utils/projectSidebarCounts";
	import {buildKanbanBoard, allColumnDefsForView} from "../fulcrum/kanban/buildBoard";
	import {applyKanbanDrop, applyKanbanSidebarDrop} from "../fulcrum/kanban/applyDrop";
	import {kanbanCellKey, kanbanProjectCardId, kanbanTaskCardId} from "../fulcrum/kanban/types";
	import type {KanbanCard} from "../fulcrum/kanban/types";
	import {
		FULCRUM_CALENDAR_TASK_MIME,
		findTaskByDragKey,
	} from "../fulcrum/calendar/calendarTaskSchedule";
	import {
		FULCRUM_SIDEBAR_PROJECT_MIME,
		findProjectByDragKey,
	} from "../fulcrum/sidebar/sidebarDrag";
	import {kanbanConfigKey, getKanbanHiddenColumns} from "../fulcrum/kanban/settingsKey";
	import {
		DATE_BUCKET_IDS,
		formatDateBucketHint,
		type DateBucketId,
	} from "../fulcrum/kanban/dateBuckets";
	import ProjectListRow from "./ProjectListRow.svelte";
	import TaskCard from "./TaskCard.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	let showAddColumnMenu = false;
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
	$: openTasks = snapshot.tasks.filter((t) => !doneTask.has(t.status));

	$: kanbanView = (void sRev, plugin.settings.kanbanView);
	$: columnBy = (void sRev, plugin.settings.kanbanColumnBy);
	$: swimlaneBy = (void sRev, plugin.settings.kanbanSwimlaneBy);
	$: projectDateSource = (void sRev, plugin.settings.kanbanProjectDateSource);

	$: board = buildKanbanBoard(
		plugin.app,
		plugin.settings,
		snapshot,
		activeProjects,
		openTasks,
	);

	$: allColumnsForMenu = allColumnDefsForView(
		plugin.app,
		plugin.settings,
		snapshot,
		activeProjects,
		openTasks,
		columnBy,
	);

	$: hiddenSet = new Set(getKanbanHiddenColumns(plugin.settings, kanbanView, columnBy));
	$: hiddenColumns = allColumnsForMenu.filter((c) => hiddenSet.has(c.id));

	const DIMENSION_OPTIONS: {id: KanbanDimension; label: string}[] = [
		{id: "area", label: "Area"},
		{id: "project", label: "Project"},
		{id: "status", label: "Status"},
		{id: "date", label: "Date"},
	];

	const SWIMLANE_OPTIONS: {id: KanbanSwimlaneDimension; label: string}[] = [
		{id: "none", label: "None"},
		{id: "area", label: "Area"},
		{id: "project", label: "Project"},
		{id: "status", label: "Status"},
		{id: "date", label: "Date"},
	];

	function dimensionDisabled(d: KanbanDimension, forSwimlane: boolean): boolean {
		if (forSwimlane) return d === columnBy;
		return swimlaneBy !== "none" && d === swimlaneBy;
	}

	function isDateBucketId(id: string): id is DateBucketId {
		return (DATE_BUCKET_IDS as readonly string[]).includes(id);
	}

	function dateBucketHint(id: string): string | null {
		if (!isDateBucketId(id)) return null;
		return formatDateBucketHint(id, plugin.settings.calendarFirstDayOfWeek);
	}

	$: columnDimensionOptions = DIMENSION_OPTIONS.filter(
		(opt) => kanbanView === "tasks" || opt.id !== "project",
	);
	$: swimlaneDimensionOptions = SWIMLANE_OPTIONS.filter(
		(opt) => opt.id === "none" || kanbanView === "tasks" || opt.id !== "project",
	);

	async function setKanbanView(v: "projects" | "tasks"): Promise<void> {
		await plugin.patchSettings({kanbanView: v});
	}

	async function setColumnBy(v: KanbanDimension): Promise<void> {
		const patch: Partial<typeof plugin.settings> = {kanbanColumnBy: v};
		if (swimlaneBy === v) patch.kanbanSwimlaneBy = "none";
		await plugin.patchSettings(patch);
	}

	async function setSwimlaneBy(v: KanbanSwimlaneDimension): Promise<void> {
		const patch: Partial<typeof plugin.settings> = {kanbanSwimlaneBy: v};
		if (v !== "none" && v === columnBy) patch.kanbanColumnBy = "area";
		await plugin.patchSettings(patch);
	}

	async function setProjectDateSource(v: "nextReview" | "deadline"): Promise<void> {
		await plugin.patchSettings({kanbanProjectDateSource: v});
	}

	function onColumnByChange(ev: Event): void {
		void setColumnBy((ev.currentTarget as HTMLSelectElement).value as KanbanDimension);
	}

	function onSwimlaneByChange(ev: Event): void {
		void setSwimlaneBy((ev.currentTarget as HTMLSelectElement).value as KanbanSwimlaneDimension);
	}

	async function hideColumn(id: string): Promise<void> {
		const key = kanbanConfigKey(kanbanView, columnBy);
		const hidden = {...plugin.settings.kanbanHiddenColumns};
		const list = [...(hidden[key] ?? []), id];
		hidden[key] = list;
		const order = {...plugin.settings.kanbanColumnOrder};
		order[key] = (order[key] ?? []).filter((x) => x !== id);
		await plugin.patchSettings({kanbanHiddenColumns: hidden, kanbanColumnOrder: order});
	}

	async function unhideColumn(id: string): Promise<void> {
		showAddColumnMenu = false;
		const key = kanbanConfigKey(kanbanView, columnBy);
		const hidden = {...plugin.settings.kanbanHiddenColumns};
		hidden[key] = (hidden[key] ?? []).filter((x) => x !== id);
		const order = {...plugin.settings.kanbanColumnOrder};
		order[key] = [...(order[key] ?? []), id];
		await plugin.patchSettings({kanbanHiddenColumns: hidden, kanbanColumnOrder: order});
	}

	async function reorderColumns(fromId: string, toId: string): Promise<void> {
		const visible = board.columns.map((c) => c.id);
		const fromIdx = visible.indexOf(fromId);
		const toIdx = visible.indexOf(toId);
		if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
		const next = [...visible];
		next.splice(fromIdx, 1);
		next.splice(toIdx, 0, fromId);
		const key = kanbanConfigKey(kanbanView, columnBy);
		const order = {...plugin.settings.kanbanColumnOrder, [key]: next};
		await plugin.patchSettings({kanbanColumnOrder: order});
	}

	let draggedColumnId: string | null = null;
	let draggedCard: {card: KanbanCard; laneId: string; columnId: string} | null = null;
	let dragOverCell: string | null = null;

	function onColumnDragStart(ev: DragEvent, id: string): void {
		const t = ev.target as HTMLElement;
		if (t.closest("button.fulcrum-kanban__column-hide, button.fulcrum-linklike")) return;
		draggedColumnId = id;
		ev.dataTransfer?.setData("text/plain", id);
		if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
		(ev.currentTarget as HTMLElement)?.parentElement?.classList.add("fulcrum-kanban__column--dragging");
	}

	function onColumnDragEnd(ev: DragEvent): void {
		draggedColumnId = null;
		(ev.currentTarget as HTMLElement)?.parentElement?.classList.remove("fulcrum-kanban__column--dragging");
	}

	function onColumnDragOver(ev: DragEvent, toId: string): void {
		ev.preventDefault();
		if (!draggedColumnId || draggedColumnId === toId) return;
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
	}

	function onColumnDrop(ev: DragEvent, toId: string): void {
		ev.preventDefault();
		if (!draggedColumnId || draggedColumnId === toId) return;
		void reorderColumns(draggedColumnId, toId);
	}

	function onCardDragStart(
		ev: DragEvent,
		card: KanbanCard,
		laneId: string,
		columnId: string,
	): void {
		draggedCard = {card, laneId, columnId};
		ev.dataTransfer?.setData("application/x-fulcrum-kanban-card", card.id);
		if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
	}

	function onCardDragEnd(): void {
		draggedCard = null;
		dragOverCell = null;
	}

	function sidebarDropTypes(types: readonly string[]): boolean {
		return (
			types.includes(FULCRUM_CALENDAR_TASK_MIME) ||
			types.includes(FULCRUM_SIDEBAR_PROJECT_MIME)
		);
	}

	function onCellDragOver(ev: DragEvent, laneId: string, columnId: string): void {
		const types = ev.dataTransfer?.types ?? [];
		if (!draggedCard && !sidebarDropTypes(types)) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
		dragOverCell = kanbanCellKey(laneId, columnId);
	}

	function onCellDragLeave(laneId: string, columnId: string): void {
		const key = kanbanCellKey(laneId, columnId);
		if (dragOverCell === key) dragOverCell = null;
	}

	function cardFromSidebarDrop(ev: DragEvent): KanbanCard | null {
		const types = ev.dataTransfer?.types ?? [];
		if (types.includes(FULCRUM_CALENDAR_TASK_MIME)) {
			if (kanbanView !== "tasks") return null;
			const key = ev.dataTransfer?.getData(FULCRUM_CALENDAR_TASK_MIME);
			if (!key) return null;
			const task = findTaskByDragKey(snapshot.tasks, key);
			if (!task || doneTask.has(task.status)) return null;
			return {
				kind: "task",
				id: kanbanTaskCardId(task),
				task,
				done: false,
			};
		}
		if (types.includes(FULCRUM_SIDEBAR_PROJECT_MIME)) {
			if (kanbanView !== "projects") return null;
			const key = ev.dataTransfer?.getData(FULCRUM_SIDEBAR_PROJECT_MIME);
			if (!key) return null;
			const project = findProjectByDragKey(activeProjects, key);
			if (!project) return null;
			return {kind: "project", id: kanbanProjectCardId(project), project};
		}
		return null;
	}

	async function onCellDrop(ev: DragEvent, laneId: string, columnId: string): Promise<void> {
		ev.preventDefault();
		dragOverCell = null;
		const sidebarCard = cardFromSidebarDrop(ev);
		if (sidebarCard) {
			try {
				await applyKanbanSidebarDrop(
					plugin,
					plugin.settings,
					snapshot,
					sidebarCard,
					laneId,
					columnId,
				);
			} catch {
				/* notice in applyKanbanSidebarDrop */
			}
			return;
		}
		if (!draggedCard) return;
		const {card, laneId: fromLane, columnId: fromCol} = draggedCard;
		draggedCard = null;
		if (fromLane === laneId && fromCol === columnId && swimlaneBy === "none") return;
		try {
			await applyKanbanDrop(
				plugin,
				plugin.settings,
				snapshot,
				card,
				fromLane,
				fromCol,
				laneId,
				columnId,
			);
		} catch {
			/* notice shown in applyKanbanDrop */
		}
	}

	function handleClickOutside(ev: MouseEvent): void {
		if (!showAddColumnMenu) return;
		const t = ev.target as Node;
		if (addColWrapEl?.contains(t)) return;
		showAddColumnMenu = false;
	}

	function openProject(path: string): void {
		void plugin.openProjectSummary(path);
	}

	function openAreaFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	$: showProjectDateToggle =
		kanbanView === "projects" &&
		(columnBy === "date" || swimlaneBy === "date");
	$: showProjectLinkOnTasks =
		kanbanView === "tasks" &&
		columnBy !== "project" &&
		swimlaneBy !== "project";
	$: showDateHintsForColumns = columnBy === "date";
	$: showDateHintsForLanes = swimlaneBy === "date";
</script>

<svelte:window on:click={handleClickOutside} />

<div class="fulcrum-kanban" data-fulcrum-kanban-root>
	<div class="fulcrum-kanban__toolbar">
		<div
			class="fulcrum-kanban__view-toggle fulcrum-kanban__view-toggle--mode"
			role="tablist"
			aria-label="Kanban view"
		>
			<button
				type="button"
				role="tab"
				class="fulcrum-kanban__view-btn"
				class:fulcrum-kanban__view-btn--active={kanbanView === "projects"}
				aria-selected={kanbanView === "projects"}
				on:click={() => void setKanbanView("projects")}
			>
				Projects
			</button>
			<button
				type="button"
				role="tab"
				class="fulcrum-kanban__view-btn"
				class:fulcrum-kanban__view-btn--active={kanbanView === "tasks"}
				aria-selected={kanbanView === "tasks"}
				on:click={() => void setKanbanView("tasks")}
			>
				Tasks
			</button>
		</div>

		<label class="fulcrum-kanban__toolbar-label" for="fulcrum-kanban-column-by">
			<span>Columns by</span>
			<select
				id="fulcrum-kanban-column-by"
				class="dropdown fulcrum-kanban__column-select"
				value={columnBy}
				on:change={onColumnByChange}
			>
				{#each columnDimensionOptions as opt}
					<option value={opt.id} disabled={dimensionDisabled(opt.id, false) || undefined}>
						{opt.label}
					</option>
				{/each}
			</select>
		</label>

		<label class="fulcrum-kanban__toolbar-label" for="fulcrum-kanban-swimlane-by">
			<span>Swimlanes by</span>
			<select
				id="fulcrum-kanban-swimlane-by"
				class="dropdown fulcrum-kanban__column-select"
				value={swimlaneBy}
				on:change={onSwimlaneByChange}
			>
				{#each swimlaneDimensionOptions as opt}
					<option
						value={opt.id}
						disabled={(opt.id !== "none" && dimensionDisabled(opt.id, true)) || undefined}
					>
						{opt.label}
					</option>
				{/each}
			</select>
		</label>

		{#if showProjectDateToggle}
			<div class="fulcrum-kanban__view-toggle" role="group" aria-label="Project date field">
				<button
					type="button"
					class="fulcrum-kanban__view-btn"
					class:fulcrum-kanban__view-btn--active={projectDateSource === "nextReview"}
					on:click={() => void setProjectDateSource("nextReview")}
				>
					Next review
				</button>
				<button
					type="button"
					class="fulcrum-kanban__view-btn"
					class:fulcrum-kanban__view-btn--active={projectDateSource === "deadline"}
					on:click={() => void setProjectDateSource("deadline")}
				>
					Deadline
				</button>
			</div>
		{/if}
	</div>

	<div class="fulcrum-kanban__board" class:fulcrum-kanban__board--swimlanes={swimlaneBy !== "none"}>
		{#each board.lanes as lane (lane.id)}
			<div class="fulcrum-kanban__swimlane">
				{#if swimlaneBy !== "none" && lane.label}
					<div class="fulcrum-kanban__swimlane-label">
						{#if lane.area}
							<button
								type="button"
								class="fulcrum-linklike"
								on:click={() => openAreaFile(lane.area.file.path)}
							>
								<span class="fulcrum-area-icon">{lane.area.icon ?? "▸"}</span>
								{lane.label}
							</button>
						{:else}
							<div class="fulcrum-kanban__column-title-wrap">
								<span class="fulcrum-kanban__swimlane-title">{lane.label}</span>
								{#if showDateHintsForLanes}
									{@const laneHint = dateBucketHint(lane.id)}
									{#if laneHint}
										<span class="fulcrum-kanban__date-hint">{laneHint}</span>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/if}
				<div class="fulcrum-kanban__swimlane-columns">
					{#each board.columns as col (col.id)}
						{@const cellKey = kanbanCellKey(lane.id, col.id)}
						{@const cards = board.cells.get(cellKey) ?? []}
						<div
							class="fulcrum-kanban__column"
							data-column-id={col.id}
							role="group"
							aria-label={col.label}
						>
							{#if swimlaneBy === "none"}
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
										<div class="fulcrum-kanban__column-title-wrap">
											<span class="fulcrum-kanban__column-title">{col.label}</span>
											{#if showDateHintsForColumns}
												{@const colHint = dateBucketHint(col.id)}
												{#if colHint}
													<span class="fulcrum-kanban__date-hint">{colHint}</span>
												{/if}
											{/if}
										</div>
									{/if}
									<div class="fulcrum-kanban__column-head-right">
										<span class="fulcrum-kanban__column-count">{cards.length}</span>
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
							{:else}
								<div class="fulcrum-kanban__column-head fulcrum-kanban__column-head--compact">
									<div class="fulcrum-kanban__column-title-wrap">
										<span class="fulcrum-kanban__column-title">{col.label}</span>
										{#if showDateHintsForColumns}
											{@const colHint = dateBucketHint(col.id)}
											{#if colHint}
												<span class="fulcrum-kanban__date-hint">{colHint}</span>
											{/if}
										{/if}
									</div>
									<span class="fulcrum-kanban__column-count">{cards.length}</span>
								</div>
							{/if}
							<div
								class="fulcrum-kanban__column-cards fulcrum-kanban__cell"
								class:fulcrum-kanban__cell--drag-over={dragOverCell === cellKey}
								role="region"
								aria-label="{col.label} cards"
								on:dragover={(e) => onCellDragOver(e, lane.id, col.id)}
								on:dragleave={() => onCellDragLeave(lane.id, col.id)}
								on:drop={(e) => void onCellDrop(e, lane.id, col.id)}
							>
								{#each cards as card (card.id)}
									<div class="fulcrum-kanban__card-wrap">
										<div class="fulcrum-kanban__card-cell">
											{#if card.kind === "project"}
												<ProjectListRow
													{plugin}
													{hoverParentLeaf}
													p={card.project}
													tile={true}
													selectedPath={null}
													onSelectProject={openProject}
													openTaskCount={projectCounts.get(card.project.file.path)?.openTasks ?? 0}
													upcomingMeetingCount={projectCounts.get(card.project.file.path)?.upcomingMeetings ?? 0}
												/>
											{:else}
												<TaskCard
													{plugin}
													task={card.task}
													done={card.done}
													showProjectLink={showProjectLinkOnTasks}
													anchorLeaf={hoverParentLeaf}
												/>
											{/if}
										</div>
										<button
											type="button"
											class="fulcrum-kanban__card-handle clickable-icon"
											aria-label="Drag card"
											title="Drag to move"
											draggable="true"
											on:dragstart={(e) => onCardDragStart(e, card, lane.id, col.id)}
											on:dragend={onCardDragEnd}
										>
											<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}

		{#if swimlaneBy === "none"}
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
					<div class="fulcrum-kanban__add-col-menu" role="menu">
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
		{/if}
	</div>
</div>

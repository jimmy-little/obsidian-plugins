<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {areaFilterState, indexRevision, settingsRevision} from "../fulcrum/stores";
	import {parseDoneStatusSet, isProjectDone} from "../fulcrum/settingsDefaults";
	import {
		buildGanttModel,
		ganttBarStyle,
		ganttMilestoneMarkerLeft,
		ganttRangeStartForToday,
		ganttRangeTitle,
		ganttTodayMarkerLeft,
		ganttZoomDayCount,
		shiftGanttRangeStart,
		type GanttVariant,
		type GanttZoom,
	} from "../fulcrum/utils/ganttModel";
	import {loadProjectMilestonesMap, type ProjectMilestone} from "../fulcrum/utils/projectMilestones";
	import {
		buildAreaLifeModeMap,
		filterProjectsByAreaFocus,
	} from "../fulcrum/utils/areaFocusFilter";
	import {preferLightForegroundOnAccentCss} from "../fulcrum/utils/projectVisual";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	/** Single-project filter (project timeline tab). */
	export let filterProjectPath: string | undefined = undefined;
	/** `full` = toolbar + navigation; `compact` = auto-fit range for embeds. */
	export let variant: GanttVariant = "full";
	export let embedded = false;
	/** Omit task rows (dashboard timeline). */
	export let includeTasks = true;
	/** Only show projects/milestones that have dates. */
	export let onlyDatedItems = false;

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = parseDoneStatusSet(plugin.settings.taskDoneStatuses);
	$: doneProject = (void sRev, parseDoneStatusSet(plugin.settings.projectDoneStatuses));
	$: areaFilter = $areaFilterState;

	let zoom: GanttZoom = "4w";
	let rangeStartIso = ganttRangeStartForToday(zoom, plugin.settings.calendarFirstDayOfWeek);
	let showDoneTasks = false;
	let milestonesByProject = new Map<string, ProjectMilestone[]>();
	let milestoneLoadId = 0;

	$: weekStart = (void sRev, plugin.settings.calendarFirstDayOfWeek);

	$: milestoneProjectPaths = ((): string[] => {
		void rev;
		void areaFilter;
		void filterProjectPath;
		if (filterProjectPath) return [filterProjectPath];
		const lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
			projects: snapshot.projects,
			app: plugin.app,
			typeField: plugin.settings.typeField,
			areaTypeValue: plugin.settings.areaTypeValue,
			settings: plugin.settings,
		});
		return filterProjectsByAreaFocus(
			snapshot.projects.filter((p) => !isProjectDone(p, plugin.settings)),
			areaFilter,
			lifeModeMap,
		).map((p) => p.file.path);
	})();

	$: {
		void rev;
		void sRev;
		void milestoneProjectPaths;
		const heading = plugin.settings.projectMilestonesSectionHeading;
		const paths = milestoneProjectPaths;
		const id = ++milestoneLoadId;
		void loadProjectMilestonesMap(plugin.app, paths, heading).then((m) => {
			if (id !== milestoneLoadId) return;
			milestonesByProject = m;
		});
	}

	$: model = buildGanttModel({
		app: plugin.app,
		snapshot,
		settings: plugin.settings,
		areaFilter,
		doneTask,
		doneProject,
		filterProjectPath,
		showDoneTasks,
		variant,
		zoom: variant === "full" ? zoom : "4w",
		rangeStartIso: variant === "full" ? rangeStartIso : undefined,
		milestonesByProject,
		includeTasks,
		onlyDatedItems,
		openProject: (path) => {
			if (filterProjectPath) {
				plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
			} else {
				void plugin.openProjectSummary(path);
			}
		},
		openTask: (t) => plugin.openIndexedTask(t, hoverParentLeaf),
	});

	$: titleText = ganttRangeTitle(model.rangeStartIso, model.rangeEndIso);
	$: todayLeft = ganttTodayMarkerLeft(model.rangeStartIso, model.dayCount);

	function goPrev(): void {
		rangeStartIso = shiftGanttRangeStart(rangeStartIso, -ganttZoomDayCount(zoom));
	}

	function goNext(): void {
		rangeStartIso = shiftGanttRangeStart(rangeStartIso, ganttZoomDayCount(zoom));
	}

	function goToday(): void {
		rangeStartIso = ganttRangeStartForToday(zoom, weekStart);
	}

	function onZoomChange(ev: Event): void {
		const v = (ev.currentTarget as HTMLSelectElement).value as GanttZoom;
		zoom = v;
		rangeStartIso = ganttRangeStartForToday(zoom, weekStart);
	}
</script>

<div
	class="fulcrum-gantt"
	class:fulcrum-gantt--full={variant === "full"}
	class:fulcrum-gantt--compact={variant === "compact"}
	class:fulcrum-gantt--embedded={embedded}
	data-fulcrum-gantt-root
>
	{#if variant === "full"}
		<div class="fulcrum-gantt__toolbar fulcrum-calendar__toolbar">
			<button type="button" class="fulcrum-calendar__nav-btn" aria-label="Previous" on:click={goPrev}>
				‹
			</button>
			<button type="button" class="fulcrum-calendar__nav-btn" aria-label="Next" on:click={goNext}>
				›
			</button>
			<h2 class="fulcrum-gantt__title fulcrum-calendar__title">{titleText}</h2>
			<button type="button" class="fulcrum-calendar__today" on:click={goToday}>Today</button>
			<label class="fulcrum-calendar__view-mode">
				<span class="fulcrum-calendar__view-mode-label">Range</span>
				<select
					class="dropdown fulcrum-calendar__view-select"
					aria-label="Gantt range"
					value={zoom}
					on:change={onZoomChange}
				>
					<option value="2w">2 weeks</option>
					<option value="4w">4 weeks</option>
					<option value="8w">8 weeks</option>
					<option value="quarter">Quarter</option>
				</select>
			</label>
			<button
				type="button"
				class="fulcrum-calendar__layer"
				class:fulcrum-calendar__layer--on={showDoneTasks}
				on:click={() => (showDoneTasks = !showDoneTasks)}
			>
				Done tasks
			</button>
		</div>
	{/if}

	<div class="fulcrum-gantt__scroll">
		{#if model.rows.length === 0}
			<p class="fulcrum-muted fulcrum-gantt__empty">
				{#if filterProjectPath}
					No dated tasks or project start/end dates for this project.
				{:else if !includeTasks && onlyDatedItems}
					No projects or milestones with dates in the current filter.
				{:else}
					No projects with start/end dates or timeline tasks in the current filter.
				{/if}
			</p>
		{:else}
			<div
				class="fulcrum-gantt__grid"
				style={`--fulcrum-gantt-days: ${model.dayCount};${todayLeft ? ` --fulcrum-gantt-today-left: ${todayLeft};` : ""}`}
				role="grid"
				aria-label="Project timeline"
			>
				<div class="fulcrum-gantt__header" role="row">
					<div class="fulcrum-gantt__label-col fulcrum-gantt__header-label" role="columnheader">
						{filterProjectPath ? "Tasks" : "Projects"}
					</div>
					<div class="fulcrum-gantt__timeline-head" role="rowgroup">
						<div class="fulcrum-gantt__day-cols" role="row">
							{#each model.columns as col (col.iso)}
								<div
									class="fulcrum-gantt__day-col"
									class:fulcrum-gantt__day-col--today={col.isToday}
									class:fulcrum-gantt__day-col--week-start={col.isWeekStart}
									role="columnheader"
									title={col.iso}
								>
									<span class="fulcrum-gantt__day-name">{col.label}</span>
									<span class="fulcrum-gantt__day-num">{col.dayNum}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<div class="fulcrum-gantt__body">
					{#each model.rows as row (row.id)}
						<div
							class="fulcrum-gantt__row"
							class:fulcrum-gantt__row--project={row.kind === "project"}
							class:fulcrum-gantt__row--task={row.kind === "task"}
							class:fulcrum-gantt__row--milestone={row.kind === "milestone"}
							class:fulcrum-gantt__row--done={row.done}
							role="row"
						>
							<button
								type="button"
								class="fulcrum-gantt__label-col fulcrum-gantt__label"
								style={`--fulcrum-gantt-indent: ${row.indent}`}
								on:click={row.open}
								title={row.label}
							>
								<span class="fulcrum-gantt__label-text">{row.label}</span>
							</button>
							<div class="fulcrum-gantt__track" role="gridcell">
								{#if row.bar && row.kind === "milestone"}
									{@const markerLeft = ganttMilestoneMarkerLeft(
										row.bar.startIso,
										model.rangeStartIso,
										model.dayCount,
									)}
									<button
										type="button"
										class="fulcrum-gantt__milestone-wrap"
										style={`--fulcrum-gantt-accent: ${row.accentCss}; left: ${markerLeft}`}
										on:click={row.open}
										title="{row.bar.startIso}: {row.label}"
										aria-label="{row.label} on {row.bar.startIso}"
									>
										<span class="fulcrum-gantt__milestone" aria-hidden="true"></span>
										<span class="fulcrum-gantt__milestone-label">{row.label}</span>
									</button>
								{:else if row.bar}
									{@const style = ganttBarStyle(row.bar, model.rangeStartIso, model.dayCount)}
									{@const lightBarLabel = preferLightForegroundOnAccentCss(row.accentCss)}
									<button
										type="button"
										class="fulcrum-gantt__bar-shell"
										class:fulcrum-gantt__bar-shell--project={row.kind === "project"}
										class:fulcrum-gantt__bar-shell--task={row.kind === "task"}
										style={`--fulcrum-gantt-accent: ${row.accentCss}; left: ${style.left}; width: ${style.width}`}
										on:click={row.open}
										title={row.label}
										aria-label={row.label}
									>
										<span
											class="fulcrum-gantt__bar-label"
											class:fulcrum-gantt__bar-label--light={lightBarLabel}
										>{row.label}</span>
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

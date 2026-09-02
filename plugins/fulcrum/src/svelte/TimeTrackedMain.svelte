<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {ProjectRollup} from "../fulcrum/types";
	import {areaFilterState, indexRevision, viewProjectFilterPaths} from "../fulcrum/stores";
	import {buildAreaLifeModeMap, filterProjectsByAreaFocus} from "../fulcrum/utils/areaFocusFilter";
	import {
		buildTimeTrackedModel,
		fmtHours,
		pieConicGradient,
		type TimeHorizonId,
		type TimeTrackedModel,
	} from "../fulcrum/utils/timeTrackedAnalytics";
	import {projectMatchesViewProjectFilter} from "../fulcrum/utils/viewProjectFilter";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let horizon: TimeHorizonId = "30d";

	let model: TimeTrackedModel | null = null;
	let loadError: string | null = null;
	let loading = true;
	let loadId = 0;

	$: rev = $indexRevision;
	$: areaFilter = $areaFilterState;
	$: selectedProjectPaths = $viewProjectFilterPaths;

	$: snapshot = plugin.vaultIndex.getSnapshot();
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});

	$: {
		void rev;
		void horizon;
		void areaFilter;
		void lifeModeMap;
		void selectedProjectPaths;
		const id = ++loadId;
		loading = true;
		loadError = null;
		const active = filterProjectsByAreaFocus(
			plugin.vaultIndex.getActiveProjects(plugin.settings),
			areaFilter,
			lifeModeMap,
		).filter((p) => projectMatchesViewProjectFilter(p, selectedProjectPaths));
		void (async (): Promise<void> => {
			try {
				const rollups: ProjectRollup[] = [];
				for (const p of active) {
					const r = await plugin.vaultIndex.getProjectRollup(p.file.path, plugin.settings);
					if (r) rollups.push(r);
				}
				if (id !== loadId) return;
				model = buildTimeTrackedModel(
					plugin.app,
					plugin.settings,
					rollups,
					horizon,
					new Set(),
					plugin.vaultIndex.getSnapshot().plannerEvents,
				);
			} catch (e) {
				if (id !== loadId) return;
				loadError = e instanceof Error ? e.message : String(e);
				model = null;
			} finally {
				if (id === loadId) loading = false;
			}
		})();
	}

	function openProject(path: string): void {
		void plugin.openProjectSummary(path);
	}

	function openFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	$: pieGradient =
		model && model.topSlices.length > 0 ? pieConicGradient(model.topSlices) : "transparent";

	$: maxBar = model?.projects.length
		? Math.max(...model.projects.map((p) => p.totalMinutes), 1)
		: 1;
</script>

<div class="fulcrum-time-dashboard">
	{#if loading}
		<p class="fulcrum-muted">Loading project rollups…</p>
	{:else if loadError}
		<p class="fulcrum-muted">{loadError}</p>
	{:else if !model || model.totalMinutes <= 0}
		<p class="fulcrum-muted">
			No time found for active projects in this range (with current sidebar filters). Add tracked minutes on
			tasks and notes, or meeting start/end times / duration.
		</p>
	{:else}
		<section class="fulcrum-time-dashboard__kpis">
			<div class="fulcrum-time-kpi">
				<div class="fulcrum-time-kpi__value">{fmtHours(model.totalMinutes)}</div>
				<div class="fulcrum-time-kpi__label">Total tracked</div>
			</div>
			<div class="fulcrum-time-kpi">
				<div class="fulcrum-time-kpi__value">{fmtHours(model.totalMeetingMinutes)}</div>
				<div class="fulcrum-time-kpi__label">Meeting time</div>
			</div>
			<div class="fulcrum-time-kpi">
				<div class="fulcrum-time-kpi__value">{model.totalMeetingsWithTime}</div>
				<div class="fulcrum-time-kpi__label">Meetings</div>
			</div>
			<div class="fulcrum-time-kpi">
				<div class="fulcrum-time-kpi__value">{model.totalProjectsWithTime}</div>
				<div class="fulcrum-time-kpi__label">Projects with time</div>
			</div>
			<div class="fulcrum-time-kpi">
				<div class="fulcrum-time-kpi__value">
					{model.totalProjectsWithTime > 0
						? fmtHours(Math.round(model.totalMinutes / model.totalProjectsWithTime))
						: "—"}
				</div>
				<div class="fulcrum-time-kpi__label">Avg / project</div>
			</div>
			<div class="fulcrum-time-kpi">
				<div class="fulcrum-time-kpi__value">
					{model.avgMinutesPerTrackedTask != null ? `${model.avgMinutesPerTrackedTask}m` : "—"}
				</div>
				<div class="fulcrum-time-kpi__label">Avg / tracked task</div>
			</div>
		</section>

		{#if model.insights.length > 0}
			<section class="fulcrum-time-dashboard__section">
				<h2>Highlights</h2>
				<ul class="fulcrum-time-insights">
					{#each model.insights as ins}
						<li class="fulcrum-time-insight">
							<span class="fulcrum-time-insight__label">{ins.label}</span>
							{#if ins.openPath}
								<button
									type="button"
									class="fulcrum-time-insight__value fulcrum-linklike"
									on:click={() => openFile(ins.openPath ?? "")}
								>
									{ins.value}
								</button>
							{:else}
								<span class="fulcrum-time-insight__value">{ins.value}</span>
							{/if}
							{#if ins.hint}
								<span class="fulcrum-time-insight__hint fulcrum-muted">{ins.hint}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<div class="fulcrum-time-dashboard__charts-row">
			<section class="fulcrum-time-dashboard__section fulcrum-time-dashboard__section--chart">
				<h2>Share by project</h2>
				<div class="fulcrum-time-pie-wrap">
					<div
						class="fulcrum-time-pie"
						style={`background: ${pieGradient}`}
						role="img"
						aria-label="Pie chart of time by project"
					></div>
					<ul class="fulcrum-time-pie-legend">
						{#each model.topSlices as sl}
							<li>
								<span class="fulcrum-time-pie-legend__swatch" style={`background: ${sl.color}`} />
								<span class="fulcrum-time-pie-legend__label">{sl.label}</span>
								<span class="fulcrum-time-pie-legend__val">{fmtHours(sl.minutes)}</span>
							</li>
						{/each}
					</ul>
				</div>
			</section>

			<section class="fulcrum-time-dashboard__section fulcrum-time-dashboard__section--chart">
				<h2>Top projects</h2>
				<div class="fulcrum-time-bars" role="list">
					{#each model.projects.slice(0, 10) as p}
						<div class="fulcrum-time-bar" role="listitem">
							<span class="fulcrum-time-bar__name" title={p.name}>{p.name}</span>
							<div class="fulcrum-time-bar__track">
								<div
									class="fulcrum-time-bar__fill"
									style={`width: ${(p.totalMinutes / maxBar) * 100}%; background: ${p.accentColorCss};`}
								/>
							</div>
							<span class="fulcrum-time-bar__val">{fmtHours(p.totalMinutes)}</span>
						</div>
					{/each}
				</div>
			</section>
		</div>

		<section class="fulcrum-time-dashboard__section">
			<h2>Composition (top 5)</h2>
			<p class="fulcrum-muted fulcrum-time-dashboard__section-lead">
				Stacked mix: tasks · meetings · notes · project note
			</p>
			<div class="fulcrum-time-stack-list">
				{#each model.projects.slice(0, 5) as p}
					{@const t = p.totalMinutes || 1}
					<button
						type="button"
						class="fulcrum-time-stack-row"
						on:click={() => openProject(p.path)}
					>
						<span class="fulcrum-time-stack-row__name">{p.name}</span>
						<div class="fulcrum-time-stack-row__bar" aria-hidden="true">
							<span
								class="fulcrum-time-stack-row__seg fulcrum-time-stack-row__seg--tasks"
								style={`width: ${(p.fromTasks / t) * 100}%`}
							/>
							<span
								class="fulcrum-time-stack-row__seg fulcrum-time-stack-row__seg--meetings"
								style={`width: ${(p.fromMeetings / t) * 100}%`}
							/>
							<span
								class="fulcrum-time-stack-row__seg fulcrum-time-stack-row__seg--atomic"
								style={`width: ${(p.fromAtomicNotes / t) * 100}%`}
							/>
							<span
								class="fulcrum-time-stack-row__seg fulcrum-time-stack-row__seg--project"
								style={`width: ${(p.fromProjectNote / t) * 100}%`}
							/>
						</div>
						<span class="fulcrum-time-stack-row__total">{fmtHours(p.totalMinutes)}</span>
					</button>
				{/each}
			</div>
			<div class="fulcrum-time-stack-legend">
				<span><i class="fulcrum-time-stack-legend__i fulcrum-time-stack-legend__i--tasks" /> Tasks</span>
				<span><i class="fulcrum-time-stack-legend__i fulcrum-time-stack-legend__i--meetings" /> Meetings</span>
				<span><i class="fulcrum-time-stack-legend__i fulcrum-time-stack-legend__i--atomic" /> Linked notes</span>
				<span><i class="fulcrum-time-stack-legend__i fulcrum-time-stack-legend__i--project" /> Project note</span>
			</div>
		</section>

		<section class="fulcrum-time-dashboard__section">
			<h2>All projects</h2>
			<div class="fulcrum-time-table-wrap">
				<table class="fulcrum-time-table">
					<thead>
						<tr>
							<th scope="col">Project</th>
							<th scope="col" class="fulcrum-time-table__num">Total</th>
							<th scope="col" class="fulcrum-time-table__num">Tasks</th>
							<th scope="col" class="fulcrum-time-table__num">Meetings</th>
							<th scope="col" class="fulcrum-time-table__num">Notes</th>
							<th scope="col" class="fulcrum-time-table__num"># tasks w/ time</th>
						</tr>
					</thead>
					<tbody>
						{#each model.projects as p}
							<tr>
								<td>
									<button
										type="button"
										class="fulcrum-time-table__proj"
										style={`border-left-color: ${p.accentColorCss}`}
										on:click={() => openProject(p.path)}
									>
										{p.name}
									</button>
								</td>
								<td class="fulcrum-time-table__num">{fmtHours(p.totalMinutes)}</td>
								<td class="fulcrum-time-table__num">{fmtHours(p.fromTasks)}</td>
								<td class="fulcrum-time-table__num">{fmtHours(p.fromMeetings)}</td>
								<td class="fulcrum-time-table__num">{fmtHours(p.fromAtomicNotes + p.fromProjectNote)}</td>
								<td class="fulcrum-time-table__num">{p.tasksWithTrack}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		{#if model.topSingleTask}
			<section class="fulcrum-time-dashboard__section">
				<h2>Deep cut</h2>
				<p class="fulcrum-time-deepcut">
					<button
						type="button"
						class="fulcrum-linklike"
						on:click={() => openFile(model.topSingleTask.path)}
					>
						Open largest tracked task
					</button>
					— {fmtHours(model.topSingleTask.minutes)} on «{model.topSingleTask.title.slice(0, 60)}»
					{#if model.topSingleTask.title.length > 60}…{/if}
					<span class="fulcrum-muted"> ({model.topSingleTask.projectName})</span>
				</p>
				{#if model.topSingleMeeting}
					<p class="fulcrum-time-deepcut">
						<button
							type="button"
							class="fulcrum-linklike"
							on:click={() => openFile(model.topSingleMeeting.path)}
						>
							Open longest meeting
						</button>
						— {fmtHours(model.topSingleMeeting.minutes)} «{model.topSingleMeeting.title.slice(0, 60)}»
						{#if model.topSingleMeeting.title.length > 60}…{/if}
						<span class="fulcrum-muted"> ({model.topSingleMeeting.projectName})</span>
					</p>
				{/if}
			</section>
		{:else if model.topSingleMeeting}
			<section class="fulcrum-time-dashboard__section">
				<h2>Deep cut</h2>
				<p class="fulcrum-time-deepcut">
					<button
						type="button"
						class="fulcrum-linklike"
						on:click={() => openFile(model.topSingleMeeting.path)}
					>
						Open longest meeting
					</button>
					— {fmtHours(model.topSingleMeeting.minutes)} «{model.topSingleMeeting.title.slice(0, 60)}»
					{#if model.topSingleMeeting.title.length > 60}…{/if}
					<span class="fulcrum-muted"> ({model.topSingleMeeting.projectName})</span>
				</p>
			</section>
		{/if}
	{/if}
</div>

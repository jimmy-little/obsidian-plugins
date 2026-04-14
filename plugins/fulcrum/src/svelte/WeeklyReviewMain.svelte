<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {ProjectActivityInput} from "../fulcrum/utils/projectActivity";
	import {indexRevision, settingsRevision, workRelatedOnly} from "../fulcrum/stores";
	import {parseList} from "../fulcrum/settingsDefaults";
	import {
		buildAreaWorkRelatedMap,
		filterProjectsWorkRelated,
	} from "../fulcrum/utils/workRelatedProjectFilter";
	import {
		buildWeeklyReviewActivityRows,
		WEEKLY_REVIEW_FACET_ORDER,
		WEEKLY_REVIEW_MAX_ROWS,
		type ReviewTrackedSegment,
		type ReviewTrackedStack,
		type WeeklyReviewMetrics,
		type WeeklyReviewRow,
	} from "../fulcrum/utils/projectActivity";
	import {formatTrackedMinutesShort} from "../fulcrum/utils/dates";
	import {preferLightForegroundOnAccentCss, resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";
	import {loadActivityFeedPreviews} from "../fulcrum/loadActivityFeedPreviews";
	import ActivityRow from "./ActivityRow.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	const LS_DAYS = "fulcrum-review-days";
	const LS_DAYS_LEGACY = "fulcrum-weekly-review-days";
	const LS_GROUP = "fulcrum-review-group";
	const LS_GROUP_LEGACY = "fulcrum-weekly-review-group";

	type GroupMode = "timeline" | "project" | "facet" | "day";

	function readStoredDays(): number {
		if (typeof localStorage === "undefined") return 7;
		try {
			const s = localStorage.getItem(LS_DAYS) ?? localStorage.getItem(LS_DAYS_LEGACY);
			if (!s) return 7;
			const n = Number.parseInt(s, 10);
			if (!Number.isFinite(n)) return 7;
			return Math.min(90, Math.max(1, n));
		} catch {
			return 7;
		}
	}

	function readStoredGroup(): GroupMode {
		if (typeof localStorage === "undefined") return "timeline";
		try {
			const s = localStorage.getItem(LS_GROUP) ?? localStorage.getItem(LS_GROUP_LEGACY);
			if (s === "project" || s === "facet" || s === "day" || s === "timeline") return s;
			return "timeline";
		} catch {
			return "timeline";
		}
	}

	function persistDays(n: number): void {
		try {
			localStorage.setItem(LS_DAYS, String(n));
		} catch {
			/* */
		}
	}

	function persistGroup(m: GroupMode): void {
		try {
			localStorage.setItem(LS_GROUP, m);
		} catch {
			/* */
		}
	}

	let reviewDays = readStoredDays();
	let groupMode: GroupMode = readStoredGroup();

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: sRev = $settingsRevision;
	$: doneTask = new Set(parseList(plugin.settings.taskDoneStatuses));
	$: areaWorkMap = buildAreaWorkRelatedMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
	});
	$: onlyWork = $workRelatedOnly;

	let rows: WeeklyReviewRow[] = [];
	let trackedStack: ReviewTrackedStack = {
		totalMinutes: 0,
		byProject: [],
		byType: [],
		byArea: [],
	};
	let metrics: WeeklyReviewMetrics = {
		meetings: 0,
		notes: 0,
		challenges: 0,
		tasksCompleted: 0,
		tasksCreated: 0,
		quickNotes: 0,
		trackedMinutes: 0,
	};

	$: {
		void rev;
		void sRev;
		void onlyWork;
		void areaWorkMap;
		void reviewDays;
		const active = filterProjectsWorkRelated(
			plugin.vaultIndex.getActiveProjects(plugin.settings),
			onlyWork,
			areaWorkMap,
		);
		const load = async (): Promise<void> => {
			const inputs = await Promise.all(
				active.map(async (p) => {
					const rollup = await plugin.vaultIndex.getProjectRollup(
						p.file.path,
						plugin.settings,
					);
					if (!rollup) return null;
					const logEntries = await plugin.loadProjectLogActivity(p.file.path);
					return {rollup, logEntries};
				}),
			);
			const valid = inputs.filter(
				(x): x is ProjectActivityInput => x != null,
			);
			const lastMs = Math.max(1, reviewDays) * 86400000;
			const areaAccentByPath = new Map(
				snapshot.areas.map((a) => [a.file.path, resolveProjectAccentCss(a.color)]),
			);
			const built = buildWeeklyReviewActivityRows(valid, {
				doneTask,
				openPath: openFile,
				openTask: (t) => plugin.openIndexedTask(t, hoverParentLeaf),
				openProject: (path) => openFile(path),
				formatTracked: formatTrackedMinutesShort,
				lastNDaysMs: lastMs,
				maxRows: WEEKLY_REVIEW_MAX_ROWS,
				areaAccentByPath,
			});
			rows = built.rows;
			metrics = built.metrics;
			trackedStack = built.trackedStack;
		};
		void load();
	}

	const REVIEW_CHART_AXIS_PCTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

	type ChartTip = {clientX: number; clientY: number; seg: ReviewTrackedSegment};
	let chartTip: ChartTip | null = null;

	function chartTipShow(ev: MouseEvent, seg: ReviewTrackedSegment): void {
		chartTip = {clientX: ev.clientX, clientY: ev.clientY, seg};
	}

	function chartTipMove(ev: MouseEvent): void {
		if (!chartTip) return;
		chartTip = {...chartTip, clientX: ev.clientX, clientY: ev.clientY};
	}

	function chartTipHide(): void {
		chartTip = null;
	}

	function chartTipStyle(tip: ChartTip): string {
		const pad = 12;
		return `left: ${tip.clientX + pad}px; top: ${tip.clientY + pad}px;`;
	}

	/** Bar fill/border aligned with project & area accents (timeline / cards use the same tokens). */
	function segmentBarStyle(seg: ReviewTrackedSegment): string {
		const flex = `${seg.minutes} 1 0`;
		const accent = seg.accentColorCss?.trim();
		if (!accent) {
			return `flex: ${flex}; min-width: 3px; background: color-mix(in srgb, var(--text-muted) 40%, var(--background-modifier-border));`;
		}
		return [
			`--fulcrum-seg-accent: ${accent};`,
			`flex: ${flex};`,
			`min-width: 3px;`,
			`background: color-mix(in srgb, ${accent} 58%, var(--background-primary));`,
		].join(" ");
	}

	function segmentLabelColorStyle(seg: ReviewTrackedSegment): string {
		const a = seg.accentColorCss?.trim() ?? "";
		let fg = "var(--text-normal)";
		if (a && !a.startsWith("var(") && preferLightForegroundOnAccentCss(a)) {
			fg = "var(--text-on-accent)";
		}
		return `color: ${fg};`;
	}

	function openFile(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	function dayKey(ms: number): string {
		const d = new Date(ms);
		const y = d.getFullYear();
		const mo = String(d.getMonth() + 1).padStart(2, "0");
		const da = String(d.getDate()).padStart(2, "0");
		return `${y}-${mo}-${da}`;
	}

	function formatDayHeading(iso: string): string {
		const ms = Date.parse(iso + "T12:00:00");
		if (Number.isNaN(ms)) return iso;
		return new Intl.DateTimeFormat(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
		}).format(ms);
	}

	function groupByProject(r: WeeklyReviewRow[]): {name: string; rows: WeeklyReviewRow[]}[] {
		const m = new Map<string, WeeklyReviewRow[]>();
		for (const row of r) {
			const name = row.projectName ?? "Project";
			const cur = m.get(name) ?? [];
			cur.push(row);
			m.set(name, cur);
		}
		return [...m.entries()]
			.sort((a, b) => a[0].localeCompare(b[0], undefined, {sensitivity: "base"}))
			.map(([name, list]) => ({
				name,
				rows: list.sort((a, b) => b.sortMs - a.sortMs),
			}));
	}

	function groupByDay(r: WeeklyReviewRow[]): {dayKey: string; label: string; rows: WeeklyReviewRow[]}[] {
		const m = new Map<string, WeeklyReviewRow[]>();
		for (const row of r) {
			const k = dayKey(row.sortMs);
			const cur = m.get(k) ?? [];
			cur.push(row);
			m.set(k, cur);
		}
		const keys = [...m.keys()].sort((a, b) => b.localeCompare(a));
		return keys.map((k) => ({
			dayKey: k,
			label: formatDayHeading(k),
			rows: (m.get(k) ?? []).sort((a, b) => b.sortMs - a.sortMs),
		}));
	}

	$: byProject = groupByProject(rows);
	$: byDay = groupByDay(rows);
	$: facetSections = WEEKLY_REVIEW_FACET_ORDER.map((f) => ({
		...f,
		rows: rows.filter((r) => r.reviewFacet === f.key).sort((a, b) => b.sortMs - a.sortMs),
	}));

	function onDaysPreset(n: number): void {
		reviewDays = n;
		persistDays(reviewDays);
	}

	function onGroupMode(next: GroupMode): void {
		groupMode = next;
		persistGroup(next);
	}

	let previewMap: Record<string, string> = {};

	$: reviewFeedKey =
		rows.length > 0
			? `${rev}\u0000${rows.map((r) => r.id).join("\u0000")}\u0000${plugin.settings.atomicNoteEntryField}\u0000${reviewDays}`
			: "";

	$: if (reviewFeedKey) {
		const key = reviewFeedKey;
		const feedRows = rows;
		const vault = plugin.app.vault;
		const entryField = plugin.settings.atomicNoteEntryField;
		void loadActivityFeedPreviews(vault, feedRows, entryField, 12).then((m) => {
			if (key !== reviewFeedKey) return;
			previewMap = m;
		});
	} else {
		previewMap = {};
	}
</script>

<section class="fulcrum-section fulcrum-weekly-review__intro">
	<div class="fulcrum-weekly-review__controls">
		<div class="fulcrum-weekly-review__range">
			<label class="fulcrum-weekly-review__range-label" for="fulcrum-review-days">Period (days)</label>
			<input
				id="fulcrum-review-days"
				type="number"
				class="fulcrum-weekly-review__days-input"
				min="1"
				max="90"
				bind:value={reviewDays}
				on:change={() => {
					reviewDays = Math.min(90, Math.max(1, Math.round(Number(reviewDays)) || 7));
					persistDays(reviewDays);
				}}
			/>
			<div class="fulcrum-weekly-review__presets" role="group" aria-label="Quick range">
				<button
					type="button"
					class="fulcrum-weekly-review__preset"
					class:fulcrum-weekly-review__preset--on={reviewDays === 7}
					on:click={() => onDaysPreset(7)}
				>
					7d
				</button>
				<button
					type="button"
					class="fulcrum-weekly-review__preset"
					class:fulcrum-weekly-review__preset--on={reviewDays === 14}
					on:click={() => onDaysPreset(14)}
				>
					14d
				</button>
				<button
					type="button"
					class="fulcrum-weekly-review__preset"
					class:fulcrum-weekly-review__preset--on={reviewDays === 30}
					on:click={() => onDaysPreset(30)}
				>
					30d
				</button>
			</div>
		</div>

		<div class="fulcrum-weekly-review__group-toolbar" role="toolbar" aria-label="Group by">
			<span class="fulcrum-weekly-review__group-label">Group</span>
			<button
				type="button"
				class="fulcrum-weekly-review__group-btn"
				class:fulcrum-weekly-review__group-btn--active={groupMode === "timeline"}
				on:click={() => onGroupMode("timeline")}
			>
				Timeline
			</button>
			<button
				type="button"
				class="fulcrum-weekly-review__group-btn"
				class:fulcrum-weekly-review__group-btn--active={groupMode === "project"}
				on:click={() => onGroupMode("project")}
			>
				Project
			</button>
			<button
				type="button"
				class="fulcrum-weekly-review__group-btn"
				class:fulcrum-weekly-review__group-btn--active={groupMode === "facet"}
				on:click={() => onGroupMode("facet")}
			>
				Type
			</button>
			<button
				type="button"
				class="fulcrum-weekly-review__group-btn"
				class:fulcrum-weekly-review__group-btn--active={groupMode === "day"}
				on:click={() => onGroupMode("day")}
			>
				Day
			</button>
		</div>
	</div>

	<div class="fulcrum-stat-grid fulcrum-weekly-review__metrics" aria-label="Review summary">
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Meetings</span>
			<span class="fulcrum-stat-card__value">{metrics.meetings}</span>
		</div>
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Tasks done</span>
			<span class="fulcrum-stat-card__value">{metrics.tasksCompleted}</span>
		</div>
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Tasks added</span>
			<span class="fulcrum-stat-card__value">{metrics.tasksCreated}</span>
		</div>
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Notes</span>
			<span class="fulcrum-stat-card__value">{metrics.notes}</span>
		</div>
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Challenges</span>
			<span class="fulcrum-stat-card__value">{metrics.challenges}</span>
		</div>
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Quick notes</span>
			<span class="fulcrum-stat-card__value">{metrics.quickNotes}</span>
		</div>
		<div class="fulcrum-stat-card">
			<span class="fulcrum-stat-card__label">Time tracked</span>
			<span class="fulcrum-stat-card__value">{formatTrackedMinutesShort(metrics.trackedMinutes)}</span>
		</div>
	</div>
</section>

<section class="fulcrum-section fulcrum-review-charts" aria-label="Time tracked in this period">
	<h2 class="fulcrum-review-charts__h2">Time tracked</h2>
	{#if trackedStack.totalMinutes <= 0}
		<p class="fulcrum-muted fulcrum-review-charts__empty">No tracked time in this period for the current filters.</p>
	{:else}
		<div class="fulcrum-review-charts__grid">
			{#each [
				{key: "project", heading: "By project", segments: trackedStack.byProject},
				{key: "area", heading: "By area", segments: trackedStack.byArea},
				{key: "type", heading: "By type", segments: trackedStack.byType},
			] as chartRow (chartRow.key)}
				<div
					class="fulcrum-review-chart-row"
					role="presentation"
					on:mouseleave={chartTipHide}
				>
					<h3 class="fulcrum-review-charts__heading">{chartRow.heading}</h3>
					<div
						class="fulcrum-review-stacked-bar fulcrum-review-stacked-bar--tall"
						role="presentation"
						on:mousemove={chartTipMove}
					>
						{#each chartRow.segments as seg (seg.key)}
							<div
								class="fulcrum-review-stacked-bar__seg fulcrum-review-stacked-bar__seg--labeled"
								role="presentation"
								style={segmentBarStyle(seg)}
								on:mouseenter={(e) => chartTipShow(e, seg)}
							>
								<div
									class="fulcrum-review-stacked-bar__label"
									style={segmentLabelColorStyle(seg)}
								>
									<span class="fulcrum-review-stacked-bar__label-name">{seg.label}</span>
									<span class="fulcrum-review-stacked-bar__label-time"
										>{formatTrackedMinutesShort(seg.minutes)}</span
									>
								</div>
							</div>
						{/each}
					</div>
					<div class="fulcrum-review-chart-row__axis" aria-hidden="true">
						{#each REVIEW_CHART_AXIS_PCTS as p (p)}
							<span>{p}%</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		{#if chartTip}
			<div class="fulcrum-review-chart-tooltip" style={chartTipStyle(chartTip)}>
				<div class="fulcrum-review-chart-tooltip__name">{chartTip.seg.label}</div>
				<div class="fulcrum-review-chart-tooltip__meta">
					{formatTrackedMinutesShort(chartTip.seg.minutes)} · {chartTip.seg.pct.toFixed(0)}%
				</div>
			</div>
		{/if}
	{/if}
</section>

<section class="fulcrum-section">
	<h2 class="fulcrum-weekly-review__feed-title">Activity</h2>
	{#if rows.length === 0}
		<p class="fulcrum-muted">Nothing in this period for the current filters.</p>
	{:else if groupMode === "timeline"}
		<ul class="fulcrum-activity-list fulcrum-activity-list--timeline">
			{#each rows as row (row.id)}
				<li>
					<ActivityRow
						variant="timeline"
						title={row.title}
						chips={row.chips}
						kind={row.kind}
						timelineEmoji={row.timelineEmoji}
						whenClick={row.open}
						{plugin}
						hoverParentLeaf={hoverParentLeaf}
						hoverPath={row.hoverPath}
						suppressHoverPreview={true}
						accentColorCss={row.accentColorCss}
						bodyPreview={row.hoverPath ? previewMap[row.hoverPath] : undefined}
						previewAccentCss={row.accentColorCss}
					/>
				</li>
			{/each}
		</ul>
	{:else if groupMode === "project"}
		<div class="fulcrum-weekly-review__groups">
			{#each byProject as g (g.name)}
				<div class="fulcrum-weekly-review__group">
					<h3 class="fulcrum-weekly-review__group-title">{g.name}</h3>
					<ul class="fulcrum-activity-list fulcrum-activity-list--timeline">
						{#each g.rows as row (row.id)}
							<li>
								<ActivityRow
									variant="timeline"
									title={row.title}
									chips={row.chips}
									kind={row.kind}
									timelineEmoji={row.timelineEmoji}
									whenClick={row.open}
									{plugin}
									hoverParentLeaf={hoverParentLeaf}
									hoverPath={row.hoverPath}
									suppressHoverPreview={true}
									accentColorCss={row.accentColorCss}
									bodyPreview={row.hoverPath ? previewMap[row.hoverPath] : undefined}
									previewAccentCss={row.accentColorCss}
								/>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{:else if groupMode === "facet"}
		<div class="fulcrum-weekly-review__groups">
			{#each facetSections as s (s.key)}
				{#if s.rows.length > 0}
					<div class="fulcrum-weekly-review__group">
						<h3 class="fulcrum-weekly-review__group-title">{s.label}</h3>
						<ul class="fulcrum-activity-list fulcrum-activity-list--timeline">
							{#each s.rows as row (row.id)}
								<li>
									<ActivityRow
										variant="timeline"
										title={row.title}
										chips={row.chips}
										kind={row.kind}
										timelineEmoji={row.timelineEmoji}
										whenClick={row.open}
										{plugin}
										hoverParentLeaf={hoverParentLeaf}
										hoverPath={row.hoverPath}
										suppressHoverPreview={true}
										accentColorCss={row.accentColorCss}
										bodyPreview={row.hoverPath ? previewMap[row.hoverPath] : undefined}
										previewAccentCss={row.accentColorCss}
									/>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<div class="fulcrum-weekly-review__groups">
			{#each byDay as d (d.dayKey)}
				<div class="fulcrum-weekly-review__group">
					<h3 class="fulcrum-weekly-review__group-title">{d.label}</h3>
					<ul class="fulcrum-activity-list fulcrum-activity-list--timeline">
						{#each d.rows as row (row.id)}
							<li>
								<ActivityRow
									variant="timeline"
									title={row.title}
									chips={row.chips}
									kind={row.kind}
									timelineEmoji={row.timelineEmoji}
									whenClick={row.open}
									{plugin}
									hoverParentLeaf={hoverParentLeaf}
									hoverPath={row.hoverPath}
									suppressHoverPreview={true}
									accentColorCss={row.accentColorCss}
									bodyPreview={row.hoverPath ? previewMap[row.hoverPath] : undefined}
									previewAccentCss={row.accentColorCss}
								/>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
	{#if rows.length >= WEEKLY_REVIEW_MAX_ROWS}
		<p class="fulcrum-muted fulcrum-weekly-review__cap-hint">
			Showing the {WEEKLY_REVIEW_MAX_ROWS} most recent rows. Narrow the period or group to focus.
		</p>
	{/if}
</section>

<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TasksViewGroupBy, TasksViewColumnId} from "../fulcrum/settingsDefaults";
	import {indexRevision, settingsRevision} from "../fulcrum/stores";
	import {TasksForecastSettingsModal} from "../fulcrum/modals";
	import {fetchForecastCalendarRows} from "../fulcrum/tasks/forecastCalendar";
	import type {ForecastCalendarRow} from "../fulcrum/tasks/tasksViewModel";
	import {addDaysIso, todayLocalISODate} from "../fulcrum/utils/dates";
	import TasksCenterList from "./TasksCenterList.svelte";
	import TaskInspectorPanel from "./TaskInspectorPanel.svelte";
	import FulcrumLeafToolbar from "./FulcrumLeafToolbar.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	const INSPECTOR_WIDTH_LS = "fulcrum-tasks-inspector-w";
	const INSPECTOR_MIN = 240;
	const INSPECTOR_DEFAULT = 300;
	const CENTER_MIN = 280;
	const SPLIT_PX = 5;

	function readInspectorWidth(): number | null {
		if (typeof localStorage === "undefined") return null;
		try {
			const s = localStorage.getItem(INSPECTOR_WIDTH_LS);
			if (!s) return null;
			const n = Number.parseInt(s, 10);
			return Number.isFinite(n) && n >= INSPECTOR_MIN ? n : null;
		} catch {
			return null;
		}
	}

	let rootEl: HTMLDivElement | null = null;
	let inspectorWidthPx: number | null = readInspectorWidth();
	let forecastCalendarRows: ForecastCalendarRow[] = [];
	let calendarLoadId = 0;

	async function refreshForecastCalendars(): Promise<void> {
		const id = ++calendarLoadId;
		const today = todayLocalISODate();
		const to = addDaysIso(today, plugin.settings.tasksViewFutureDays);
		try {
			const rows = await fetchForecastCalendarRows(plugin.settings, today, to);
			if (id === calendarLoadId) forecastCalendarRows = rows;
		} catch (e) {
			console.error(e);
			if (id === calendarLoadId) forecastCalendarRows = [];
		}
	}

	function openForecastSettings(): void {
		new TasksForecastSettingsModal(plugin.app, plugin, () => void refreshForecastCalendars()).open();
	}

	onMount(() => {
		if (inspectorWidthPx != null) return;
		const applyDefault = (): void => {
			if (!rootEl) return;
			inspectorWidthPx = clampInspector(rootEl.getBoundingClientRect().width * 0.32);
		};
		applyDefault();
	});

	$: inspectorStyle =
		inspectorWidthPx != null
			? `--fulcrum-tasks-inspector-w: ${inspectorWidthPx}px`
			: `--fulcrum-tasks-inspector-w: minmax(${INSPECTOR_MIN}px, 32%)`;

	$: sRev = $settingsRevision;
	$: groupBy = (void sRev, plugin.settings.tasksViewGroupBy);
	$: columns = (void sRev, plugin.settings.tasksViewColumns as TasksViewColumnId[]);
	$: iRev = $indexRevision;
	$: {
		void iRev;
		void sRev;
		void plugin.settings.forecastCalendarIds;
		void plugin.settings.forecastShowSystemCalendars;
		void plugin.settings.conduitEnabled;
		void plugin.settings.tasksViewFutureDays;
		void refreshForecastCalendars();
	}

	function maxInspectorWidth(): number {
		if (!rootEl) return 480;
		const w = rootEl.getBoundingClientRect().width;
		return Math.max(INSPECTOR_MIN, w - SPLIT_PX - CENTER_MIN);
	}

	function clampInspector(w: number): number {
		return Math.min(Math.max(Math.round(w), INSPECTOR_MIN), maxInspectorWidth());
	}

	function persistInspector(w: number): void {
		try {
			localStorage.setItem(INSPECTOR_WIDTH_LS, String(w));
		} catch {
			/* ignore */
		}
	}

	function onSplitKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
		ev.preventDefault();
		const delta = ev.key === "ArrowLeft" ? 16 : -16;
		const base = inspectorWidthPx ?? INSPECTOR_DEFAULT;
		inspectorWidthPx = clampInspector(base + delta);
		persistInspector(inspectorWidthPx);
	}

	function onSplitPointerDown(ev: PointerEvent): void {
		const handle = ev.currentTarget as HTMLElement;
		ev.preventDefault();
		handle.setPointerCapture(ev.pointerId);
		const aside = rootEl?.querySelector(".fulcrum-tasks-main__inspector");
		const startW =
			aside instanceof HTMLElement ? aside.getBoundingClientRect().width : INSPECTOR_MIN;
		const startX = ev.clientX;

		function move(e: PointerEvent): void {
			inspectorWidthPx = clampInspector(startW - (e.clientX - startX));
		}

		function up(e: PointerEvent): void {
			handle.releasePointerCapture(e.pointerId);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			if (inspectorWidthPx != null) persistInspector(inspectorWidthPx);
		}

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	}

	async function onGroupByChange(ev: Event): Promise<void> {
		const v = (ev.currentTarget as HTMLSelectElement).value as TasksViewGroupBy;
		await plugin.patchSettings({tasksViewGroupBy: v});
	}
</script>

<div bind:this={rootEl} class="fulcrum-tasks-main">
	<header class="fulcrum-pm__main-head fulcrum-tasks-main__head">
		<h1 class="fulcrum-pm__main-title">Horizon</h1>
		<label class="fulcrum-tasks-main__group-by">
			<span class="fulcrum-muted">Group</span>
			<select
				class="dropdown"
				aria-label="Group tasks by"
				value={groupBy}
				on:change={(e) => void onGroupByChange(e)}
			>
				<option value="day">Day</option>
				<option value="project">Project</option>
				<option value="tag">Tag</option>
			</select>
		</label>
		<FulcrumLeafToolbar
			{plugin}
			showHorizonSettings
			onHorizonSettings={openForecastSettings}
		/>
	</header>

	<div class="fulcrum-tasks-main__body" style={inspectorStyle}>
		<div class="fulcrum-tasks-main__center">
			<TasksCenterList
				{plugin}
				{groupBy}
				{columns}
				{hoverParentLeaf}
				{forecastCalendarRows}
			/>
		</div>

		<button
			type="button"
			class="fulcrum-tasks-main__split"
			aria-label="Resize inspector. Drag or use arrow keys."
			tabindex="0"
			on:pointerdown={onSplitPointerDown}
			on:keydown={onSplitKeydown}
		></button>

		<div class="fulcrum-tasks-main__inspector">
			<TaskInspectorPanel {plugin} />
		</div>
	</div>
</div>

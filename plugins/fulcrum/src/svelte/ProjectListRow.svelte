<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {showFulcrumProjectCardContextMenu} from "../fulcrum/projectCardContextMenu";
	import type {IndexedProject} from "../fulcrum/types";
	import {daysUntilCalendar, formatShortMonthDay} from "../fulcrum/utils/dates";
	import {resolveProjectAccentCss} from "../fulcrum/utils/projectVisual";

	export let p: IndexedProject;
	export let selectedPath: string | null;
	export let onSelectProject: (path: string) => void;
	export let openTaskCount = 0;
	export let upcomingMeetingCount = 0;
	/** Larger card style for dashboard “needs attention” grid. */
	export let tile = false;
	/** When set (e.g. Dashboard / Kanban / Areas), right-click opens Fulcrum actions without opening the project. */
	export let plugin: FulcrumHost | undefined = undefined;

	function onContextMenu(ev: MouseEvent): void {
		if (!plugin) return;
		showFulcrumProjectCardContextMenu(ev, plugin, p);
	}

	function areaLabel(project: IndexedProject): string {
		if (project.areaFiles.length === 0) return "—";
		if (project.areaFiles.length === 1) {
			const t = project.areaName?.trim();
			return (
				(t && t.length > 0 ? t : project.areaFiles[0]!.basename.replace(/\.md$/i, "")) || "—"
			);
		}
		return project.areaFiles.map((f) => f.basename.replace(/\.md$/i, "")).join(", ");
	}

	function reviewIsOverdue(project: IndexedProject): boolean {
		if (!project.nextReview?.trim()) return false;
		const d = daysUntilCalendar(project.nextReview);
		return d !== null && d < 0;
	}

	$: overdue = reviewIsOverdue(p);
	$: accent = resolveProjectAccentCss(p.color);
	$: launchDisp = p.launchDate?.trim() ? formatShortMonthDay(p.launchDate) : "";
	$: reviewDisp = p.nextReview?.trim() ? formatShortMonthDay(p.nextReview) : "";
	$: hasNotifs = overdue || openTaskCount > 0 || upcomingMeetingCount > 0;
	$: hasMeta = Boolean(launchDisp || reviewDisp || hasNotifs);
	$: desc = p.description?.trim() ?? "";

	function activateRow(): void {
		onSelectProject(p.file.path);
	}

	function onRowKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		activateRow();
	}
</script>

<!-- div, not button: Obsidian’s default button styles fix height and break multiline rows -->
<div
	role="button"
	tabindex="0"
	class="fulcrum-pl-row"
	class:fulcrum-pl-row--tile={tile}
	class:fulcrum-pl-row--active={selectedPath === p.file.path}
	class:fulcrum-pl-row--overdue={overdue}
	style={`--fulcrum-pl-accent: ${accent}`}
	aria-label={overdue ? `${p.name}, review overdue` : p.name}
	on:click={activateRow}
	on:keydown={onRowKeydown}
	on:contextmenu={onContextMenu}
>
	<div class="fulcrum-pl-row__inner">
		<div class="fulcrum-pl-row__head">
			<span class="fulcrum-pl-row__name">{p.name}</span>
			<span class="fulcrum-pl-row__area">{areaLabel(p)}</span>
		</div>
		{#if desc}
			<p class="fulcrum-pl-row__desc">{desc}</p>
		{/if}
		{#if hasMeta}
			<div class="fulcrum-pl-row__meta">
				{#if launchDisp}
					<span class="fulcrum-pl-row__meta-part">Launch {launchDisp}</span>
				{/if}
				{#if launchDisp && reviewDisp}
					<span class="fulcrum-pl-row__meta-sep" aria-hidden="true"> · </span>
				{/if}
				{#if reviewDisp}
					<span class="fulcrum-pl-row__meta-part" class:fulcrum-pl-row__meta-part--overdue={overdue}>
						Next {reviewDisp}
					</span>
				{/if}
				{#if hasNotifs}
					{#if launchDisp || reviewDisp}
						<span class="fulcrum-pl-row__meta-sep" aria-hidden="true"> · </span>
					{/if}
					<span class="fulcrum-pl-row__notifs" aria-label="Notifications">
						{#if overdue}
							<span class="fulcrum-pl-row__notif fulcrum-pl-row__notif--overdue" title="Review overdue">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M2 15h4"/><path d="M6 15l2-7 4 2 4-2 2 7"/><path d="M18 15h4"/></svg>
							</span>
						{/if}
						{#if openTaskCount > 0}
							<span class="fulcrum-pl-row__notif fulcrum-pl-row__notif--tasks" title="{openTaskCount} open task(s)">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
								<span class="fulcrum-pl-row__notif-count">{openTaskCount}</span>
							</span>
						{/if}
						{#if upcomingMeetingCount > 0}
							<span class="fulcrum-pl-row__notif fulcrum-pl-row__notif--meetings" title="{upcomingMeetingCount} upcoming meeting(s)">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
								<span class="fulcrum-pl-row__notif-count">{upcomingMeetingCount}</span>
							</span>
						{/if}
					</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

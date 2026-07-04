<script lang="ts">
	import {Platform, setIcon} from "obsidian";
	import type {OrbitHost} from "../orbit/pluginHost";
	import PeopleListPanel from "./PeopleListPanel.svelte";
	import PersonProfile from "./PersonProfile.svelte";

	export let plugin: OrbitHost;
	/** When false, only the picker column is shown (sidebar dock); person opens in the main area. */
	export let fullView: boolean;
	export let selectedPersonPath: string | null;
	export let onSelectPersonPath: (path: string) => void;

	const PM_LEFT_WIDTH_LS = "orbit-pm-left-col-px";
	const PM_LEFT_MIN = 200;
	const PM_MAIN_MIN = 280;
	const PM_SPLIT_PX = 5;

	function readStoredLeftWidth(): number | null {
		if (typeof localStorage === "undefined") return null;
		try {
			const s = localStorage.getItem(PM_LEFT_WIDTH_LS);
			if (!s) return null;
			const n = Number.parseInt(s, 10);
			if (!Number.isFinite(n) || n < PM_LEFT_MIN) return null;
			return n;
		} catch {
			return null;
		}
	}

	let leftCollapsed = false;
	let pmEl: HTMLDivElement | null = null;
	let leftWidthPx: number | null = readStoredLeftWidth();
	let orgChartBtnEl: HTMLButtonElement | null = null;
	let collapseBtnEl: HTMLButtonElement | null = null;

	$: if (collapseBtnEl) {
		setIcon(collapseBtnEl, leftCollapsed ? "panel-left" : "panel-left-close");
	}

	$: if (orgChartBtnEl) {
		setIcon(orgChartBtnEl, "git-branch");
	}

	function maxLeftColWidth(): number {
		if (!pmEl) return 720;
		const pmW = pmEl.getBoundingClientRect().width;
		return Math.max(PM_LEFT_MIN, pmW - PM_SPLIT_PX - PM_MAIN_MIN);
	}

	function clampLeftWidth(w: number): number {
		return Math.min(Math.max(Math.round(w), PM_LEFT_MIN), maxLeftColWidth());
	}

	function persistLeftWidth(w: number): void {
		try {
			localStorage.setItem(PM_LEFT_WIDTH_LS, String(w));
		} catch {
			/* private mode / quota */
		}
	}

	function onSplitPointerDown(ev: PointerEvent): void {
		if (leftCollapsed || !fullView) return;
		const handle = ev.currentTarget as HTMLElement;
		ev.preventDefault();
		handle.setPointerCapture(ev.pointerId);
		const aside = pmEl?.querySelector(".orbit-pm__sidebar--left");
		const startW =
			aside instanceof HTMLElement ? aside.getBoundingClientRect().width : PM_LEFT_MIN;
		const startX = ev.clientX;

		function move(e: PointerEvent): void {
			leftWidthPx = clampLeftWidth(startW + (e.clientX - startX));
		}

		function up(e: PointerEvent): void {
			handle.releasePointerCapture(e.pointerId);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			if (leftWidthPx != null) persistLeftWidth(leftWidthPx);
		}

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	}

	function onSplitKeydown(ev: KeyboardEvent): void {
		if (leftCollapsed || !fullView) return;
		if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
		ev.preventDefault();
		const aside = pmEl?.querySelector(".orbit-pm__sidebar--left");
		const cur =
			leftWidthPx ??
			(aside instanceof HTMLElement ? aside.getBoundingClientRect().width : 352);
		const step = ev.shiftKey ? 24 : 8;
		const delta = ev.key === "ArrowRight" ? step : -step;
		const next = clampLeftWidth(cur + delta);
		leftWidthPx = next;
		persistLeftWidth(next);
	}

	function openOrgChartForSelection(): void {
		if (!selectedPersonPath) return;
		void plugin.openOrgChartForAnchor(selectedPersonPath);
	}

	function collapseLeftIfNarrow(): void {
		if (typeof window === "undefined") return;
		if (Platform.isMobile || window.matchMedia("(max-width: 768px)").matches) {
			leftCollapsed = true;
		}
	}

	function onPersonSelected(path: string): void {
		collapseLeftIfNarrow();
		onSelectPersonPath(path);
	}
</script>

<div
	bind:this={pmEl}
	class="orbit-pm"
	class:orbit-pm-left-collapsed={leftCollapsed}
	class:orbit-pm--list-only={!fullView}
	style={fullView && !leftCollapsed && leftWidthPx != null
		? `--orbit-pm-left-w: ${leftWidthPx}px`
		: undefined}
>
	<aside class="orbit-pm__sidebar orbit-pm__sidebar--left">
		<div class="orbit-pm__left-stack">
			<div
				class="orbit-pm__glyph-bar"
				class:orbit-pm__glyph-bar--collapsed={leftCollapsed}
				role="toolbar"
				aria-label="People sidebar"
			>
				<button
					type="button"
					class="orbit-pm__glyph-btn clickable-icon"
					bind:this={collapseBtnEl}
					aria-label={leftCollapsed ? "Expand people list" : "Collapse people list"}
					title={leftCollapsed ? "Expand" : "Collapse"}
					on:click={() => (leftCollapsed = !leftCollapsed)}
				></button>
				<span class="orbit-pm__glyph-spacer" aria-hidden="true"></span>
				<button
					type="button"
					class="orbit-pm__glyph-btn clickable-icon"
					aria-label="Org chart for selected person"
					title="Org chart"
					disabled={!selectedPersonPath}
					bind:this={orgChartBtnEl}
					on:click={openOrgChartForSelection}
				></button>
			</div>
			{#if !leftCollapsed}
				<div class="orbit-pm__left-scroll">
					<PeopleListPanel {plugin} selectedPath={selectedPersonPath} onSelectPerson={onPersonSelected} />
				</div>
			{/if}
		</div>
	</aside>

	{#if fullView}
		<button
			type="button"
			class="orbit-pm__split"
			disabled={leftCollapsed}
			aria-label="Resize people list. Drag or use arrow keys."
			on:pointerdown={onSplitPointerDown}
			on:keydown={onSplitKeydown}
		></button>
	{/if}

	{#if fullView}
		<main class="orbit-pm__main orbit-view-root">
			{#if selectedPersonPath}
				{#key selectedPersonPath}
					<PersonProfile {plugin} filePath={selectedPersonPath} />
				{/key}
			{:else}
				<p class="orbit-muted">Pick a person from the list.</p>
			{/if}
		</main>
	{/if}
</div>

<script lang="ts">
	import { onMount } from "svelte";
	import { setIcon } from "obsidian";
	import type ReposePlugin from "../main";
	import MediaListPanel from "./MediaListPanel.svelte";
	import MediaDetail from "./MediaDetail.svelte";
	import SearchAddPanel from "./SearchAddPanel.svelte";

	export let plugin: ReposePlugin;
	/** When false, only the picker column is shown (sidebar dock); selection opens in the main area. */
	export let fullView: boolean;
	export let selectedPath: string | null;
	export let onSelectPath: (path: string) => void;

	const LEFT_WIDTH_LS = "repose-pm-left-col-px";
	const LEFT_MIN = 220;
	const MAIN_MIN = 320;
	const SPLIT_PX = 5;
	const SIDEBAR_TAB_LS = "repose-pm-sidebar-tab";

	type SidebarTab = "library" | "add";
	let sidebarTab: SidebarTab = "library";

	let leftCollapsed = false;
	let pmEl: HTMLDivElement | null = null;
	let leftWidthPx: number | null = readStoredLeftWidth();
	let collapseBtnEl: HTMLButtonElement | null = null;

	$: if (collapseBtnEl) {
		setIcon(collapseBtnEl, "chevrons-left-right");
	}

	function readStoredLeftWidth(): number | null {
		if (typeof localStorage === "undefined") return null;
		try {
			const s = localStorage.getItem(LEFT_WIDTH_LS);
			if (!s) return null;
			const n = Number.parseInt(s, 10);
			if (!Number.isFinite(n) || n < LEFT_MIN) return null;
			return n;
		} catch {
			return null;
		}
	}

	function maxLeftColWidth(): number {
		if (!pmEl) return 720;
		const pmW = pmEl.getBoundingClientRect().width;
		return Math.max(LEFT_MIN, pmW - SPLIT_PX - MAIN_MIN);
	}

	function clampLeftWidth(w: number): number {
		return Math.min(Math.max(Math.round(w), LEFT_MIN), maxLeftColWidth());
	}

	function persistLeftWidth(w: number): void {
		try {
			localStorage.setItem(LEFT_WIDTH_LS, String(w));
		} catch {
			/* ignore */
		}
	}

	function onSplitPointerDown(ev: PointerEvent): void {
		if (leftCollapsed || !fullView) return;
		const handle = ev.currentTarget as HTMLElement;
		ev.preventDefault();
		handle.setPointerCapture(ev.pointerId);
		const aside = pmEl?.querySelector(".repose-pm__sidebar--left");
		const startW = aside instanceof HTMLElement ? aside.getBoundingClientRect().width : LEFT_MIN;
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

	onMount(() => {
		if (typeof localStorage === "undefined") return;
		try {
			const s = localStorage.getItem(SIDEBAR_TAB_LS);
			if (s === "library" || s === "add") sidebarTab = s;
		} catch {
			/* ignore */
		}
	});

	function setSidebarTab(tab: SidebarTab): void {
		sidebarTab = tab;
		try {
			localStorage.setItem(SIDEBAR_TAB_LS, tab);
		} catch {
			/* ignore */
		}
	}

	function onSplitKeydown(ev: KeyboardEvent): void {
		if (leftCollapsed || !fullView) return;
		if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
		ev.preventDefault();
		const aside = pmEl?.querySelector(".repose-pm__sidebar--left");
		const cur = leftWidthPx ?? (aside instanceof HTMLElement ? aside.getBoundingClientRect().width : 352);
		const step = ev.shiftKey ? 24 : 8;
		const delta = ev.key === "ArrowRight" ? step : -step;
		const next = clampLeftWidth(cur + delta);
		leftWidthPx = next;
		persistLeftWidth(next);
	}
</script>

<div
	bind:this={pmEl}
	class="repose-pm"
	class:repose-pm-left-collapsed={leftCollapsed}
	class:repose-pm--list-only={!fullView}
	style={fullView && !leftCollapsed && leftWidthPx != null ? `--repose-pm-left-w: ${leftWidthPx}px` : undefined}
>
	<aside class="repose-pm__sidebar repose-pm__sidebar--left">
		<div class="repose-pm__left-stack">
			<div class="repose-pm__glyph-bar" role="toolbar" aria-label="Media sidebar">
				<button
					type="button"
					class="repose-pm__glyph-btn clickable-icon"
					aria-label={leftCollapsed ? "Expand media list" : "Collapse media list"}
					title={leftCollapsed ? "Expand" : "Collapse"}
					on:click={() => (leftCollapsed = !leftCollapsed)}
				>
					{leftCollapsed ? "›" : "‹"}
				</button>
				<span class="repose-pm__glyph-spacer" aria-hidden="true"></span>
			</div>
			{#if !leftCollapsed}
				<div class="repose-pm__sidebar-tabs" role="tablist" aria-label="Sidebar section">
					<button
						type="button"
						class="repose-pm__sidebar-tab"
						role="tab"
						aria-selected={sidebarTab === "library"}
						id="repose-tab-library"
						aria-controls="repose-tabpanel-sidebar"
						on:click={() => setSidebarTab("library")}
					>
						Library
					</button>
					<button
						type="button"
						class="repose-pm__sidebar-tab"
						role="tab"
						aria-selected={sidebarTab === "add"}
						id="repose-tab-add"
						aria-controls="repose-tabpanel-sidebar"
						on:click={() => setSidebarTab("add")}
					>
						Add
					</button>
				</div>
				<div
					class="repose-pm__left-scroll"
					id="repose-tabpanel-sidebar"
					role="tabpanel"
					aria-labelledby={sidebarTab === "library" ? "repose-tab-library" : "repose-tab-add"}
				>
					{#if sidebarTab === "library"}
						<MediaListPanel {plugin} {selectedPath} {onSelectPath} />
					{:else}
						<SearchAddPanel {plugin} />
					{/if}
				</div>
			{/if}
		</div>
	</aside>

	{#if fullView}
		<button
			type="button"
			class="repose-pm__split"
			disabled={leftCollapsed}
			aria-label="Resize media list. Drag or use arrow keys."
			on:pointerdown={onSplitPointerDown}
			on:keydown={onSplitKeydown}
		></button>
	{/if}

	{#if fullView}
		<main class="repose-pm__main repose-view-root">
			<MediaDetail {plugin} {selectedPath} />
		</main>
	{/if}
</div>


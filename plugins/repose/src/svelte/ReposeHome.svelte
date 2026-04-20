<script lang="ts">
	import { onMount } from "svelte";
	import { Platform, setIcon } from "obsidian";
	import type ReposePlugin from "../main";
	import MediaListPanel from "./MediaListPanel.svelte";
	import MediaDetail from "./MediaDetail.svelte";
	import SearchAddPanel from "./SearchAddPanel.svelte";
	import ReposeLanding from "./ReposeLanding.svelte";

	export let plugin: ReposePlugin;
	/** When false, only the picker column is shown (sidebar dock); selection opens in the main area. */
	export let fullView: boolean;
	/** Serial episode split: show only the detail column (no library sidebar or split handle). */
	export let detailOnly = false;
	export let selectedPath: string | null;
	/** Main pane shows the landing placeholder instead of a media note. */
	export let landing = false;
	export let onSelectPath: (path: string) => void;
	export let onGoHome: () => void;

	const LEFT_WIDTH_LS = "repose-pm-left-col-px";
	const LEFT_MIN = 220;
	const MAIN_MIN = 320;
	const SPLIT_PX = 5;
	const ADD_PANEL_LS = "repose-pm-add-panel";

	/** When true, sidebar shows add panel (search) instead of library list. */
	let addPanelOpen = false;

	let leftCollapsed = false;
	let pmEl: HTMLDivElement | null = null;
	let leftWidthPx: number | null = readStoredLeftWidth();
	let addToggleBtnEl: HTMLButtonElement | null = null;
	let collapseBtnEl: HTMLButtonElement | null = null;
	let homeBtnEl: HTMLButtonElement | null = null;

	$: if (addToggleBtnEl) {
		setIcon(addToggleBtnEl, addPanelOpen ? "list" : "plus");
	}

	$: if (collapseBtnEl) {
		setIcon(collapseBtnEl, leftCollapsed ? "panel-left" : "panel-left-close");
	}

	$: if (homeBtnEl) {
		setIcon(homeBtnEl, "home");
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
			if (localStorage.getItem(ADD_PANEL_LS) === "1") addPanelOpen = true;
		} catch {
			/* ignore */
		}
	});

	function toggleAddPanel(): void {
		addPanelOpen = !addPanelOpen;
		try {
			if (addPanelOpen) localStorage.setItem(ADD_PANEL_LS, "1");
			else localStorage.removeItem(ADD_PANEL_LS);
		} catch {
			/* ignore */
		}
	}

	function collapseLeftIfNarrow(): void {
		if (typeof window === "undefined") return;
		if (Platform.isMobile || window.matchMedia("(max-width: 768px)").matches) {
			leftCollapsed = true;
		}
	}

	function selectPath(path: string): void {
		collapseLeftIfNarrow();
		onSelectPath(path);
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

{#if detailOnly}
	<div class="repose-pm repose-pm--detail-only">
		<main class="repose-pm__main repose-view-root">
			{#if landing}
				<ReposeLanding {plugin} onSelectPath={selectPath} />
			{:else}
				<MediaDetail {plugin} {selectedPath} onSelectPath={selectPath} onGoHome={() => onGoHome()} />
			{/if}
		</main>
	</div>
{:else}
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
						class="repose-pm__glyph-btn repose-pm__glyph-btn--icon clickable-icon"
						bind:this={collapseBtnEl}
						aria-label={leftCollapsed ? "Expand media list" : "Collapse media list"}
						title={leftCollapsed ? "Expand" : "Collapse"}
						on:click={() => (leftCollapsed = !leftCollapsed)}
					></button>
					<span class="repose-pm__glyph-spacer" aria-hidden="true"></span>
					<button
						type="button"
						class="repose-pm__glyph-btn repose-pm__glyph-btn--icon clickable-icon"
						bind:this={homeBtnEl}
						aria-label="Repose home"
						title="Home"
						on:click={() => onGoHome()}
					></button>
					<button
						type="button"
						class="repose-pm__glyph-btn repose-pm__glyph-btn--icon clickable-icon"
						bind:this={addToggleBtnEl}
						aria-label={addPanelOpen ? "Show media library" : "Add media"}
						title={addPanelOpen ? "Library list" : "Add"}
						disabled={leftCollapsed}
						on:click={() => toggleAddPanel()}
					></button>
				</div>
				{#if !leftCollapsed}
					<div class="repose-pm__left-scroll" id="repose-sidebar-panel">
						{#if addPanelOpen}
							<SearchAddPanel {plugin} />
						{:else}
							<MediaListPanel {plugin} {selectedPath} onSelectPath={selectPath} />
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
				{#if landing}
					<ReposeLanding {plugin} onSelectPath={selectPath} />
				{:else}
					<MediaDetail {plugin} {selectedPath} onSelectPath={selectPath} onGoHome={() => onGoHome()} />
				{/if}
			</main>
		{/if}
	</div>
{/if}


<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TimeHorizonId} from "../fulcrum/utils/timeTrackedAnalytics";
	import type {TimeModeTab} from "../timer/types";
	import TimeTrackedMain from "./TimeTrackedMain.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let activeTab: TimeModeTab = plugin.settings.timeModeTab ?? "overview";

	const tabs: {id: TimeModeTab; label: string}[] = [
		{id: "overview", label: "Overview"},
		{id: "sessions", label: "Sessions"},
	];

	const horizonOptions: {id: TimeHorizonId; label: string}[] = [
		{id: "7d", label: "7 days"},
		{id: "30d", label: "30 days"},
		{id: "90d", label: "90 days"},
		{id: "all", label: "All time"},
	];

	function normalizeHorizon(h: string | undefined): TimeHorizonId {
		if (h === "7d" || h === "30d" || h === "90d" || h === "all") return h;
		return "30d";
	}

	let horizon: TimeHorizonId = normalizeHorizon(plugin.settings.timeTrackerHorizon);
	let sessionsEl: HTMLDivElement | null = null;

	function setHorizon(id: TimeHorizonId): void {
		horizon = id;
		void plugin.patchSettings({timeTrackerHorizon: id});
	}

	function onHorizonSelect(id: string): void {
		if (id === "7d" || id === "30d" || id === "90d" || id === "all") setHorizon(id);
	}

	async function mountTab(tab: TimeModeTab): Promise<void> {
		const timer = plugin.timer;
		if (!timer) return;
		if (tab === "sessions" && sessionsEl) await timer.mountSessionsPanel(sessionsEl);
	}

	function selectTab(tab: TimeModeTab): void {
		activeTab = tab;
		void plugin.patchSettings({timeModeTab: tab});
		void mountTab(tab);
	}

	onMount(() => {
		if (activeTab === "sessions") void mountTab("sessions");
	});

	$: if (activeTab === "sessions" && sessionsEl) void mountTab("sessions");
</script>

<div class="fulcrum-time-shell">
	<div class="fulcrum-time-shell__header">
		<div class="fulcrum-time-shell__tabs" role="tablist" aria-label="Time views">
			{#each tabs as tab}
				<button
					type="button"
					role="tab"
					class="fulcrum-time-shell__tab"
					class:fulcrum-time-shell__tab--active={activeTab === tab.id}
					aria-selected={activeTab === tab.id}
					on:click={() => selectTab(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
		{#if activeTab === "overview"}
			<div class="fulcrum-time-shell__range" role="tablist" aria-label="Time range">
				<span class="fulcrum-time-shell__range-label">Range</span>
				{#each horizonOptions as opt (opt.id)}
					<button
						type="button"
						role="tab"
						class="fulcrum-time-shell__range-seg"
						class:fulcrum-time-shell__range-seg--active={horizon === opt.id}
						aria-selected={horizon === opt.id}
						on:click={() => onHorizonSelect(opt.id)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="fulcrum-time-shell__panel">
		{#if activeTab === "overview"}
			<TimeTrackedMain {plugin} {hoverParentLeaf} {horizon} />
		{:else if activeTab === "sessions"}
			<div class="fulcrum-timer-embed-host" bind:this={sessionsEl}></div>
		{/if}
	</div>
</div>

<style>
	.fulcrum-time-shell__header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
	}
	.fulcrum-time-shell__tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.fulcrum-time-shell__tab {
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		border-radius: 6px;
		padding: 0.25rem 0.65rem;
		font-size: var(--font-ui-small);
		cursor: pointer;
	}
	.fulcrum-time-shell__tab--active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}
	.fulcrum-time-shell__range {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.35rem;
		margin-left: auto;
	}
	.fulcrum-time-shell__range-label {
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.fulcrum-time-shell__range-seg {
		font-size: var(--font-ui-smaller);
		padding: 0.25rem 0.55rem;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		background: var(--background-secondary);
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		line-height: 1.3;
	}
	.fulcrum-time-shell__range-seg--active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}
	.fulcrum-timer-embed-host {
		min-height: 200px;
	}
</style>

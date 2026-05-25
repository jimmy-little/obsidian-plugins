<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {TimeModeTab} from "../timer/types";
	import TimeTrackedMain from "./TimeTrackedMain.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let activeTab: TimeModeTab = plugin.settings.timeModeTab ?? "overview";

	const tabs: {id: TimeModeTab; label: string}[] = [
		{id: "overview", label: "Overview"},
		{id: "activity", label: "Activity"},
		{id: "sessions", label: "Sessions"},
		{id: "entryGrid", label: "Entry grid"},
	];

	let activityEl: HTMLDivElement | null = null;
	let sessionsEl: HTMLDivElement | null = null;
	let entryGridEl: HTMLDivElement | null = null;

	async function mountTab(tab: TimeModeTab): Promise<void> {
		const timer = plugin.timer;
		if (!timer) return;
		if (tab === "activity" && activityEl) await timer.mountActivityPanel(activityEl);
		if (tab === "sessions" && sessionsEl) await timer.mountSessionsPanel(sessionsEl);
		if (tab === "entryGrid" && entryGridEl) await timer.mountEntryGridPanel(entryGridEl);
	}

	function selectTab(tab: TimeModeTab): void {
		activeTab = tab;
		void plugin.patchSettings({timeModeTab: tab});
		void mountTab(tab);
	}

	onMount(() => {
		if (activeTab !== "overview") void mountTab(activeTab);
	});

	$: if (activeTab === "activity" && activityEl) void mountTab("activity");
	$: if (activeTab === "sessions" && sessionsEl) void mountTab("sessions");
	$: if (activeTab === "entryGrid" && entryGridEl) void mountTab("entryGrid");
</script>

<div class="fulcrum-time-shell">
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

	<div class="fulcrum-time-shell__panel">
		{#if activeTab === "overview"}
			<TimeTrackedMain {plugin} {hoverParentLeaf} />
		{:else if activeTab === "activity"}
			<div class="fulcrum-timer-embed-host" bind:this={activityEl}></div>
		{:else if activeTab === "sessions"}
			<div class="fulcrum-timer-embed-host" bind:this={sessionsEl}></div>
		{:else if activeTab === "entryGrid"}
			<div class="fulcrum-timer-embed-host" bind:this={entryGridEl}></div>
		{/if}
	</div>
</div>

<style>
	.fulcrum-time-shell__tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.75rem;
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
	.fulcrum-timer-embed-host {
		min-height: 200px;
	}
</style>

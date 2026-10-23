<script lang="ts">
	import {onDestroy, tick} from "svelte";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {timerRevision} from "../fulcrum/stores";
	import {activeTimerDisplayKey} from "../timer/activeTimerSet";

	export let plugin: FulcrumHost;

	let host: HTMLDivElement | undefined;
	let activeCount = 0;
	let panelMounted = false;
	let lastPathKey = "";
	let syncSerial = 0;

	async function syncActiveTimers(): Promise<void> {
		const serial = ++syncSerial;
		const rows = plugin.timer.listActiveTimersInMemory();
		if (serial !== syncSerial) return;

		const nextKey = activeTimerDisplayKey(rows);
		const nextCount = rows.length;

		if (nextCount === 0) {
			if (panelMounted) {
				plugin.timer.unmountDashboardActiveTimers();
				panelMounted = false;
			}
			activeCount = 0;
			lastPathKey = "";
			return;
		}

		activeCount = nextCount;
		await tick();
		if (serial !== syncSerial || !host) return;

		if (!panelMounted) {
			await plugin.timer.mountDashboardActiveTimers(host);
			panelMounted = true;
			lastPathKey = nextKey;
			return;
		}

		if (lastPathKey === nextKey) return;

		await plugin.timer.refreshDashboardActiveTimers();
		lastPathKey = nextKey;
	}

	$: void $timerRevision, void syncActiveTimers();

	onDestroy(() => {
		syncSerial++;
		plugin.timer.unmountDashboardActiveTimers();
		panelMounted = false;
		lastPathKey = "";
	});
</script>

{#if activeCount > 0}
	<section class="fulcrum-section fulcrum-dashboard-active-timers-section">
		<h2>Active timers</h2>
		<div class="fulcrum-dashboard-active-timers" bind:this={host}></div>
	</section>
{/if}

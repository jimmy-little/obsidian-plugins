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
	let scannedOnce = false;
	let syncSerial = 0;

	async function syncActiveTimers(): Promise<void> {
		const serial = ++syncSerial;
		const rows = scannedOnce
			? plugin.timer.listActiveTimersInMemory()
			: await plugin.timer.getActiveTimers();
		scannedOnce = true;
		if (serial !== syncSerial) return;

		const nextKey = activeTimerDisplayKey(rows);
		const nextCount = rows.length;

		if (nextCount === 0) {
			if (panelMounted) {
				plugin.timer.unmountTodayActiveTimers();
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
			await plugin.timer.mountTodayActiveTimers(host);
			panelMounted = true;
			lastPathKey = nextKey;
			return;
		}

		if (lastPathKey === nextKey) return;

		await plugin.timer.refreshTodayActiveTimers();
		lastPathKey = nextKey;
	}

	$: void $timerRevision, void syncActiveTimers();

	onDestroy(() => {
		syncSerial++;
		plugin.timer.unmountTodayActiveTimers();
		panelMounted = false;
		lastPathKey = "";
	});
</script>

{#if activeCount > 0}
	<div class="fulcrum-today__block fulcrum-today-active-timers-section">
		<h2 class="fulcrum-today__block-title">Running</h2>
		<div class="fulcrum-today-active-timers" bind:this={host}></div>
	</div>
{/if}

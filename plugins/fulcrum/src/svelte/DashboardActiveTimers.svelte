<script lang="ts">
	import {onDestroy, tick} from "svelte";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {timerRevision} from "../fulcrum/stores";

	export let plugin: FulcrumHost;

	let host: HTMLDivElement | undefined;
	let activeCount = 0;
	let panelMounted = false;
	let lastRenderedCount = 0;
	let syncSerial = 0;

	async function syncActiveTimers(): Promise<void> {
		const serial = ++syncSerial;
		const rows = plugin.timer.listActiveTimersInMemory();
		if (serial !== syncSerial) return;

		const nextCount = rows.length;

		if (nextCount === 0) {
			if (panelMounted) {
				plugin.timer.unmountDashboardActiveTimers();
				panelMounted = false;
				lastRenderedCount = 0;
			}
			activeCount = 0;
			return;
		}

		activeCount = nextCount;
		await tick();
		if (serial !== syncSerial || !host) return;

		if (!panelMounted) {
			await plugin.timer.mountDashboardActiveTimers(host);
			panelMounted = true;
			lastRenderedCount = nextCount;
			return;
		}

		await plugin.timer.refreshDashboardActiveTimers();
		lastRenderedCount = nextCount;
	}

	$: void $timerRevision, void syncActiveTimers();

	onDestroy(() => {
		syncSerial++;
		plugin.timer.unmountDashboardActiveTimers();
		panelMounted = false;
		lastRenderedCount = 0;
	});
</script>

{#if activeCount > 0}
	<section class="fulcrum-section fulcrum-dashboard-active-timers-section">
		<h2>Active timers</h2>
		<div class="fulcrum-dashboard-active-timers" bind:this={host}></div>
	</section>
{/if}

<script lang="ts">
	import {onDestroy, tick} from "svelte";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {timerRevision} from "../fulcrum/stores";
	import {activeTimerDisplayKey} from "../timer/activeTimerSet";

	export let plugin: FulcrumHost;
	export let projectPath: string;

	let host: HTMLDivElement | undefined;
	let activeCount = 0;
	let panelMounted = false;
	let lastPathKey = "";
	let lastProjectPath = "";
	let syncSerial = 0;

	async function syncActiveTimers(): Promise<void> {
		const serial = ++syncSerial;
		const rows = plugin.timer.listActiveTimersForProjectInMemory(projectPath);
		if (serial !== syncSerial) return;

		const nextKey = activeTimerDisplayKey(rows);
		const nextCount = rows.length;

		if (nextCount === 0) {
			if (panelMounted) {
				plugin.timer.unmountProjectActiveTimers();
				panelMounted = false;
			}
			activeCount = 0;
			lastPathKey = "";
			lastProjectPath = projectPath;
			return;
		}

		activeCount = nextCount;
		await tick();
		if (serial !== syncSerial || !host) return;

		if (panelMounted && lastProjectPath !== projectPath) {
			plugin.timer.unmountProjectActiveTimers();
			panelMounted = false;
			lastPathKey = "";
		}

		if (!panelMounted) {
			await plugin.timer.mountProjectActiveTimers(host, projectPath);
			panelMounted = true;
			lastPathKey = nextKey;
			lastProjectPath = projectPath;
			return;
		}

		if (lastPathKey === nextKey) return;

		await plugin.timer.refreshProjectActiveTimers();
		lastPathKey = nextKey;
		lastProjectPath = projectPath;
	}

	$: void $timerRevision, void projectPath, void syncActiveTimers();

	onDestroy(() => {
		syncSerial++;
		plugin.timer.unmountProjectActiveTimers();
		panelMounted = false;
		lastPathKey = "";
	});
</script>

{#if activeCount > 0}
	<section class="fulcrum-section fulcrum-project-active-timers-section">
		<h2 class="fulcrum-section-head__title">Active timers</h2>
		<div class="fulcrum-project-active-timers" bind:this={host}></div>
	</section>
{/if}

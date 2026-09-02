<script lang="ts">
	import {onDestroy, tick} from "svelte";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {timerRevision} from "../fulcrum/stores";

	export let plugin: FulcrumHost;
	export let projectPath: string;

	let host: HTMLDivElement | undefined;
	let activeCount = 0;
	let panelMounted = false;
	let lastRenderedCount = 0;
	let lastProjectPath = "";
	let syncSerial = 0;

	async function syncActiveTimers(): Promise<void> {
		const serial = ++syncSerial;
		const rows = plugin.timer.listActiveTimersForProjectInMemory(projectPath);
		if (serial !== syncSerial) return;

		const nextCount = rows.length;

		if (nextCount === 0) {
			if (panelMounted) {
				plugin.timer.unmountProjectActiveTimers();
				panelMounted = false;
				lastRenderedCount = 0;
			}
			activeCount = 0;
			lastProjectPath = projectPath;
			return;
		}

		activeCount = nextCount;
		await tick();
		if (serial !== syncSerial || !host) return;

		if (panelMounted && lastProjectPath !== projectPath) {
			plugin.timer.unmountProjectActiveTimers();
			panelMounted = false;
			lastRenderedCount = 0;
		}

		if (!panelMounted) {
			await plugin.timer.mountProjectActiveTimers(host, projectPath);
			panelMounted = true;
			lastRenderedCount = nextCount;
			lastProjectPath = projectPath;
			return;
		}

		await plugin.timer.refreshProjectActiveTimers();
		lastRenderedCount = nextCount;
		lastProjectPath = projectPath;
	}

	$: void $timerRevision, void projectPath, void syncActiveTimers();

	onDestroy(() => {
		syncSerial++;
		plugin.timer.unmountProjectActiveTimers();
		panelMounted = false;
		lastRenderedCount = 0;
	});
</script>

{#if activeCount > 0}
	<section class="fulcrum-section fulcrum-project-active-timers-section">
		<h2 class="fulcrum-section-head__title">Active timers</h2>
		<div class="fulcrum-project-active-timers" bind:this={host}></div>
	</section>
{/if}

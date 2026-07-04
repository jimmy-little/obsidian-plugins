<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {timerRevision} from "../fulcrum/stores";
	import TaskCardTimerSlot from "./TaskCardTimerSlot.svelte";

	export let plugin: FulcrumHost;
	export let projectPath: string;

	let timerFilePaths: string[] = [];
	let syncSerial = 0;

	async function syncActiveTimers(): Promise<void> {
		const serial = ++syncSerial;
		const rows = await plugin.timer.getActiveTimersForProject(projectPath);
		if (serial !== syncSerial) return;
		timerFilePaths = rows.map((row) => row.filePath);
	}

	$: void $timerRevision, void projectPath, void syncActiveTimers();
</script>

{#if timerFilePaths.length > 0}
	<div class="fulcrum-project-banner__active-timers" aria-label="Active timers">
		{#each timerFilePaths as filePath (filePath)}
			<TaskCardTimerSlot {plugin} {filePath} showStop={true} placement="row" />
		{/each}
	</div>
{/if}

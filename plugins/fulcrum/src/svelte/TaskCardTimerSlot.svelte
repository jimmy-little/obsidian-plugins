<script lang="ts">
	import {onDestroy, onMount} from "svelte";
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {timerRevision} from "../fulcrum/stores";
	import type {TimeEntry} from "../timer/types";

	export let plugin: FulcrumHost;
	export let filePath: string;

	let entry: TimeEntry | null = null;
	let elapsedText = "";
	let tickId: number | undefined;

	function refreshEntry(): void {
		entry = null;
		for (const row of plugin.timer.listActiveTimersInMemory()) {
			if (row.filePath === filePath) {
				entry = row.entry;
				break;
			}
		}
		updateElapsed();
	}

	function updateElapsed(): void {
		if (!entry?.startTime) {
			elapsedText = "";
			return;
		}
		elapsedText = plugin.timer.formatTimeAsHHMMSS(
			plugin.timer.getActiveEntryElapsedMs(entry),
		);
	}

	function stopIcon(el: HTMLElement): void {
		setIcon(el, "square");
	}

	async function stopTimer(): Promise<void> {
		await plugin.stopTimerInNote(filePath);
	}

	$: void $timerRevision, refreshEntry();

	onMount(() => {
		refreshEntry();
		tickId = window.setInterval(() => {
			refreshEntry();
		}, 1000);
	});

	onDestroy(() => {
		if (tickId != null) window.clearInterval(tickId);
	});
</script>

{#if entry?.startTime}
	<div class="fulcrum-task-card__timer" aria-label="Active timer">
		<span class="fulcrum-task-card__timer-elapsed">{elapsedText}</span>
		<button
			type="button"
			class="fulcrum-task-card__timer-stop clickable-icon"
			aria-label="Stop timer"
			title="Stop timer"
			on:click|stopPropagation={stopTimer}
		>
			<span class="fulcrum-task-card__timer-stop-icon" use:stopIcon aria-hidden="true"></span>
		</button>
	</div>
{/if}

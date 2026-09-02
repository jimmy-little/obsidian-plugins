<script lang="ts">
	import {onDestroy, onMount} from "svelte";
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {settingsRevision, timerRevision} from "../fulcrum/stores";
	import type {TimeEntry} from "../timer/types";

	export let plugin: FulcrumHost;
	export let filePath: string;
	/** When true, show a stop control beside the elapsed time (project/area views). */
	export let showStop = false;
	/** `footer` = bottom-right of the card; `row` = inline on the main row. */
	export let placement: "footer" | "row" = "footer";
	/** Compact timer widget with +/- adjust buttons (task cards). */
	export let showAdjustControls = false;

	let entry: TimeEntry | null = null;
	let elapsedText = "";
	let tickId: number | undefined;

	$: adjustMinutes = Math.max(
		1,
		Number((void $settingsRevision, plugin.settings.timer.timeAdjustMinutes)) || 5,
	);

	function refreshEntry(): void {
		entry = plugin.timer.findActiveEntryForFile(filePath);
		updateElapsed();
	}

	function updateElapsed(): void {
		if (!entry?.startTime) {
			elapsedText = "";
			return;
		}
		elapsedText = plugin.timer.formatTimeForTimerDisplay(
			plugin.timer.getActiveEntryElapsedMs(entry),
		);
	}

	async function adjustStart(offsetMinutes: number): Promise<void> {
		await plugin.timer.adjustActiveTimerStart(filePath, offsetMinutes, entry?.id);
		refreshEntry();
	}

	async function stopTimer(): Promise<void> {
		await plugin.stopTimerInNote(filePath);
	}

	function stopIcon(el: HTMLElement): void {
		setIcon(el, "square");
	}

	$: void $timerRevision, refreshEntry();

	onMount(() => {
		refreshEntry();
		tickId = window.setInterval(() => {
			if (entry) updateElapsed();
			else refreshEntry();
		}, 1000);
	});

	onDestroy(() => {
		if (tickId != null) window.clearInterval(tickId);
	});
</script>

{#if entry?.startTime}
	<div
		class="fulcrum-task-card__timer"
		class:fulcrum-task-card__timer--footer={placement === "footer"}
		class:fulcrum-task-card__timer--row={placement === "row"}
		class:fulcrum-task-card__timer--adjust={showAdjustControls}
		aria-label="Active timer"
	>
		{#if showAdjustControls}
			<div class="fulcrum-timer-timer-container fulcrum-task-card__timer-widget">
				<div class="fulcrum-timer-timer-display">{elapsedText}</div>
				<div class="fulcrum-timer-adjust-buttons">
					<button
						type="button"
						class="fulcrum-timer-btn-adjust"
						aria-label="Subtract {adjustMinutes} minutes from timer"
						on:pointerdown|stopPropagation|preventDefault
						on:mousedown|stopPropagation|preventDefault
						on:click|stopPropagation|preventDefault={() => void adjustStart(-adjustMinutes)}
					>
						-{adjustMinutes}
					</button>
					<button
						type="button"
						class="fulcrum-timer-btn-adjust"
						aria-label="Add {adjustMinutes} minutes to timer"
						on:pointerdown|stopPropagation|preventDefault
						on:mousedown|stopPropagation|preventDefault
						on:click|stopPropagation|preventDefault={() => void adjustStart(adjustMinutes)}
					>
						+{adjustMinutes}
					</button>
				</div>
			</div>
		{:else}
			<span class="fulcrum-task-card__timer-elapsed">{elapsedText}</span>
		{/if}
		{#if showStop}
			<button
				type="button"
				class="fulcrum-task-card__timer-stop clickable-icon"
				aria-label="Stop timer"
				title="Stop timer"
				on:click|stopPropagation={stopTimer}
			>
				<span class="fulcrum-task-card__timer-stop-icon" use:stopIcon aria-hidden="true"></span>
			</button>
		{/if}
	</div>
{/if}

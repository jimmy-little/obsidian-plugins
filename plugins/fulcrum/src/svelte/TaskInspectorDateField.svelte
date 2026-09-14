<script lang="ts">
	import {dueDateOnDayPreservingTime} from "../fulcrum/kanban/taskFieldUpdate";
	import {isoForTaskDatePreset, TASK_DATE_PRESETS, type TaskDatePresetId} from "../fulcrum/taskSchedulePresets";

	export let label: string;
	export let date = "";
	export let time = "";
	export let existingIso: string | undefined = undefined;
	export let weekStartDay = 1;
	export let onChange: (date: string, time: string) => void | Promise<void>;

	function emitChange(nextDate: string, nextTime: string): void {
		date = nextDate;
		time = nextTime;
		void onChange(date, time);
	}

	function applyPreset(id: TaskDatePresetId): void {
		const next = isoForTaskDatePreset(id, weekStartDay);
		const merged = dueDateOnDayPreservingTime(existingIso, next);
		const tMatch = merged.match(/T(\d{2}:\d{2})/);
		emitChange(next, tMatch?.[1] ?? time);
	}

	function clearDate(): void {
		emitChange("", "");
	}
</script>

<div class="fulcrum-tasks-inspector__field fulcrum-tasks-inspector__date-field">
	<span class="fulcrum-tasks-inspector__label">{label}</span>
	<div class="fulcrum-tasks-inspector__datetime">
		<input
			type="date"
			class="fulcrum-tasks-inspector__input"
			bind:value={date}
			on:change={() => void onChange(date, time)}
		/>
		<input
			type="time"
			class="fulcrum-tasks-inspector__input"
			bind:value={time}
			on:change={() => void onChange(date, time)}
		/>
	</div>
	<div class="fulcrum-tasks-inspector__date-quick" role="group" aria-label="{label} quick set">
		{#each TASK_DATE_PRESETS as preset (preset.id)}
			<button
				type="button"
				class="fulcrum-tasks-inspector__date-quick-btn"
				class:is-active={date === isoForTaskDatePreset(preset.id, weekStartDay)}
				on:click={() => applyPreset(preset.id)}
			>
				{preset.title}
			</button>
		{/each}
		<button
			type="button"
			class="fulcrum-tasks-inspector__date-quick-btn fulcrum-tasks-inspector__date-quick-btn--clear"
			title="Clear"
			on:click={clearDate}
		>
			×
		</button>
	</div>
</div>

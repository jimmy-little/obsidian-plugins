<script lang="ts">
	import {addDaysIso, addMonthsIso, todayLocalISODate} from "../fulcrum/utils/dates";
	import {dueDateOnDayPreservingTime} from "../fulcrum/kanban/taskFieldUpdate";

	export let label: string;
	export let date = "";
	export let time = "";
	export let existingIso: string | undefined = undefined;
	export let onChange: (date: string, time: string) => void | Promise<void>;

	function emitChange(nextDate: string, nextTime: string): void {
		date = nextDate;
		time = nextTime;
		void onChange(date, time);
	}

	function applyQuick(action: "today" | "+1d" | "+1w" | "+1m" | "clear"): void {
		if (action === "clear") {
			emitChange("", "");
			return;
		}
		const base = date.trim() || todayLocalISODate();
		let next = base;
		if (action === "today") next = todayLocalISODate();
		else if (action === "+1d") next = addDaysIso(base, 1);
		else if (action === "+1w") next = addDaysIso(base, 7);
		else if (action === "+1m") next = addMonthsIso(base, 1);
		const merged = dueDateOnDayPreservingTime(existingIso, next);
		const tMatch = merged.match(/T(\d{2}:\d{2})/);
		emitChange(next, tMatch?.[1] ?? time);
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
		<button type="button" class="fulcrum-tasks-inspector__date-quick-btn" title="Today" on:click={() => applyQuick("today")}>☀</button>
		<button type="button" class="fulcrum-tasks-inspector__date-quick-btn" on:click={() => applyQuick("+1d")}>+1d</button>
		<button type="button" class="fulcrum-tasks-inspector__date-quick-btn" on:click={() => applyQuick("+1w")}>+1w</button>
		<button type="button" class="fulcrum-tasks-inspector__date-quick-btn" on:click={() => applyQuick("+1m")}>+1m</button>
		<button type="button" class="fulcrum-tasks-inspector__date-quick-btn fulcrum-tasks-inspector__date-quick-btn--clear" title="Clear" on:click={() => applyQuick("clear")}>×</button>
	</div>
</div>

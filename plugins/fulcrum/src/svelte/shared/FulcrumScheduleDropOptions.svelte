<script lang="ts">
	import type {CalendarTaskScheduleField} from "../../fulcrum/settingsDefaults";

	export let value: CalendarTaskScheduleField;
	export let onChange: (value: CalendarTaskScheduleField) => void | Promise<void>;

	function handleChange(ev: Event): void {
		const v = (ev.currentTarget as HTMLSelectElement).value;
		if (v === "due" || v === "scheduled" || v === "ask") void onChange(v);
	}
</script>

<label class="fulcrum-calendar__schedule-mode">
	<span class="fulcrum-calendar__schedule-mode-label">Set date as</span>
	<select
		class="dropdown fulcrum-calendar__schedule-mode-select"
		aria-label="Date field when scheduling tasks"
		value={value}
		on:change={handleChange}
	>
		<option value="due">Due</option>
		<option value="scheduled">Scheduled</option>
		<option value="ask">Ask each time</option>
	</select>
</label>

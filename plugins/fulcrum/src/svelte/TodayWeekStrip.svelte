<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {settingsRevision} from "../fulcrum/stores";
	import {todayLocalISODate} from "../fulcrum/utils/dates";
	import {buildTodayWeekDays} from "../fulcrum/today/todayWeek";

	export let plugin: FulcrumHost;
	export let focalDateIso: string;
	export let onPickDay: (iso: string) => void;
	export let onAddDay: (ev: MouseEvent, iso: string) => void;
	export let onPrevWeek: () => void;
	export let onNextWeek: () => void;

	$: sRev = $settingsRevision;
	$: weekStart = (void sRev, plugin.settings.calendarFirstDayOfWeek);
	$: days = buildTodayWeekDays(focalDateIso, weekStart, todayLocalISODate());
</script>

<nav class="fulcrum-today-week" aria-label="Week">
	<button type="button" class="fulcrum-today-week__nav" aria-label="Previous week" on:click={onPrevWeek}>
		‹
	</button>
	<div class="fulcrum-today-week__days">
		{#each days as day (day.iso)}
			<div class="fulcrum-today-week__cell">
				<button
					type="button"
					class="fulcrum-today-week__day"
					class:fulcrum-today-week__day--today={day.isToday}
					class:fulcrum-today-week__day--focal={day.isFocal}
					aria-current={day.isFocal ? "date" : undefined}
					aria-label={day.iso}
					on:click={() => onPickDay(day.iso)}
				>
					<span class="fulcrum-today-week__wd">{day.weekday}</span>
					<span class="fulcrum-today-week__num">{day.dayNum}</span>
				</button>
				<button
					type="button"
					class="fulcrum-today-week__add"
					aria-label={`Add on ${day.iso}`}
					on:click={(e) => onAddDay(e, day.iso)}
				>
					+
				</button>
			</div>
		{/each}
	</div>
	<button type="button" class="fulcrum-today-week__nav" aria-label="Next week" on:click={onNextWeek}>
		›
	</button>
</nav>

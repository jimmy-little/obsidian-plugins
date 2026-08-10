<script lang="ts">
	import type {CalendarEvent} from "../fulcrum/utils/calendarEvents";

	export let event: CalendarEvent;
	/** When false, the chip is not a drag source (e.g. dashboard preview-only). */
	export let draggable = true;
	export let onDragStart: ((ev: DragEvent, e: CalendarEvent) => void) | undefined = undefined;
	export let onDragEnd: (() => void) | undefined = undefined;
	export let onContextMenu: ((ev: MouseEvent, e: CalendarEvent) => void) | undefined = undefined;
</script>

<button
	type="button"
	class="fulcrum-calendar__event fulcrum-calendar__event--{event.kind}"
	class:fulcrum-calendar__event--ghost={event.isGhostOccurrence}
	style={event.accentCss ? `--fulcrum-event-accent: ${event.accentCss}` : undefined}
	data-fulcrum-calendar-event
	draggable={draggable ? "true" : undefined}
	on:dragstart={(ev) => {
		ev.stopPropagation();
		onDragStart?.(ev, event);
	}}
	on:dragend={onDragEnd}
	on:click={(ev) => {
		ev.preventDefault();
		event.open();
	}}
	on:contextmenu={(ev) => onContextMenu?.(ev, event)}
>
	<span class="fulcrum-calendar__event-icon" aria-hidden="true">
		{#if event.kind === "task" || event.kind === "logged"}
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.25"
				stroke-linecap="round"
				stroke-linejoin="round"
				><path d="M20 6 9 17l-5-5" /></svg
			>
		{:else if event.kind === "planned" || event.kind === "planner"}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg
			>
		{:else if event.kind === "note"}
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
					points="14 2 14 8 20 8"
				/><line x1="16" y1="13" x2="8" y2="13" /><line
					x1="16"
					y1="17"
					x2="8"
					y2="17"
				/></svg
			>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><rect x="3" y="4" width="18" height="18" rx="2" /><path
					d="M16 2v4M8 2v4M3 10h18"
				/></svg
			>
		{/if}
	</span>
	<span class="fulcrum-calendar__event-title">{event.title}</span>
</button>

<script lang="ts">
	import {onMount} from "svelte";

	export let startMinutes: number;
	export let startTimeMs: number;
	export let title: string;
	export let accentCss: string | null = null;
	export let onOpen: () => void;

	const TOTAL_MINUTES = 24 * 60;
	const TICK_MS = 60_000;

	let blockEl: HTMLButtonElement | undefined;

	function applySize(): void {
		if (!blockEl) return;
		const durationMinutes = Math.max(1, Math.round((Date.now() - startTimeMs) / 60_000));
		const topPct = (startMinutes / TOTAL_MINUTES) * 100;
		const heightPct = (durationMinutes / TOTAL_MINUTES) * 100;
		blockEl.style.top = `${topPct}%`;
		blockEl.style.height = `${heightPct}%`;
	}

	onMount(() => {
		applySize();
		const id = window.setInterval(applySize, TICK_MS);
		return () => window.clearInterval(id);
	});
</script>

<button
	type="button"
	bind:this={blockEl}
	class="fulcrum-calendar__timed-event fulcrum-calendar__timed-event--logged fulcrum-calendar__timed-event--active"
	style={accentCss ? `--fulcrum-event-accent: ${accentCss};` : undefined}
	data-fulcrum-calendar-event
	data-fulcrum-active-timer
	on:click={(ev) => {
		ev.preventDefault();
		onOpen();
	}}
>
	<span class="fulcrum-calendar__timed-event-icon" aria-hidden="true">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="10" />
			<path d="M12 6v6l4 2" />
		</svg>
	</span>
	<span class="fulcrum-calendar__timed-event-title">{title}</span>
</button>

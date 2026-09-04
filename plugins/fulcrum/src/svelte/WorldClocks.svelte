<script lang="ts">
	import {onMount} from "svelte";
	import {settingsRevision} from "../fulcrum/stores";
	import {
		formatClockTimeInZone,
		isDaytimeInTimeZone,
		parseWorldClockSettings,
	} from "../fulcrum/utils/worldClocks";

	export let plugin: {settings: {worldClocks: string}};

	let now = new Date();
	onMount(() => {
		const id = window.setInterval(() => {
			now = new Date();
		}, 30_000);
		return () => window.clearInterval(id);
	});

	$: clocks = (void $settingsRevision, parseWorldClockSettings(plugin.settings.worldClocks));
</script>

<div class="fulcrum-world-clocks" aria-label="World clocks">
	{#each clocks as clock (clock.label + (clock.timeZone ?? ""))}
		{@const daytime = isDaytimeInTimeZone(now, clock.timeZone)}
		<div class="fulcrum-world-clock">
			<span
				class="fulcrum-world-clock__glyph"
				title={daytime ? "Daytime (7am–7pm)" : "Nighttime"}
				aria-label={daytime ? "Sun" : "Moon"}
			>{daytime ? "☀" : "☾"}</span>
			<span class="fulcrum-world-clock__time">{formatClockTimeInZone(now, clock.timeZone)}</span>
			<span class="fulcrum-world-clock__label">{clock.label}</span>
		</div>
	{/each}
</div>

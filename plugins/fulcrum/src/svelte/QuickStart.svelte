<script lang="ts">
	import {onDestroy, onMount} from "svelte";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import FulcrumGlobalFilterStrip from "./shared/FulcrumGlobalFilterStrip.svelte";

	export let plugin: FulcrumHost;

	let timerHost: HTMLDivElement | undefined;

	onMount(async () => {
		if (timerHost) {
			await plugin.timer.mountQuickStartView(timerHost);
		}
	});

	onDestroy(() => {
		plugin.timer.unmountQuickStartView();
	});
</script>

<div class="fulcrum-quickstart fulcrum-standalone-with-filter">
	<div class="fulcrum-standalone-with-filter__main fulcrum-quickstart__main" bind:this={timerHost}></div>
	<FulcrumGlobalFilterStrip {plugin} />
</div>

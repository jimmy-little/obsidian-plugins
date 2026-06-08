<script lang="ts">
	import { getImageGridSlots, imageGridLayoutClass } from "../calendar/imageGrid";

	export let urls: string[] = [];

	$: slots = getImageGridSlots(urls.slice(0, 4));
	$: layoutClass = imageGridLayoutClass(Math.min(urls.length, 4));
</script>

<div class="repose-image-grid {layoutClass}" aria-hidden={urls.length === 0}>
	{#each slots as url, i (i)}
		<div class="repose-image-grid-cell" class:repose-image-grid-cell--empty={!url}>
			{#if url}
				<img src={url} alt="" loading="lazy" />
			{/if}
		</div>
	{/each}
</div>

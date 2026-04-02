<script lang="ts">
	import type {TFile} from "obsidian";

	export let file: TFile;
	export let label: string;
	export let subline: string;
	export let accentCss: string;
	export let selectedPath: string | null;
	export let onSelect: (path: string) => void;

	function activateRow(): void {
		onSelect(file.path);
	}

	function onRowKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		activateRow();
	}
</script>

<div
	role="button"
	tabindex="0"
	class="orbit-pl-row"
	class:orbit-pl-row--active={selectedPath === file.path}
	style={`--orbit-pl-accent: ${accentCss}`}
	aria-label={label}
	on:click={activateRow}
	on:keydown={onRowKeydown}
>
	<div class="orbit-pl-row__inner">
		<div class="orbit-pl-row__head">
			<span class="orbit-pl-row__name">{label}</span>
		</div>
		{#if subline}
			<p class="orbit-pl-row__desc">{subline}</p>
		{/if}
	</div>
</div>

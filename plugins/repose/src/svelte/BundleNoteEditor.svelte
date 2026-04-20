<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type { TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { BundledNoteEditorHost } from "../ui/bundledNoteEditor";

	export let plugin: ReposePlugin;
	export let file: TFile;

	let root: HTMLDivElement;
	let host: BundledNoteEditorHost | null = null;

	onMount(() => {
		host = new BundledNoteEditorHost(plugin, root, file);
		plugin.addChild(host);
	});

	onDestroy(() => {
		host?.unload();
	});
</script>

<div class="repose-bundle-note-editor markdown-source-view" bind:this={root}></div>

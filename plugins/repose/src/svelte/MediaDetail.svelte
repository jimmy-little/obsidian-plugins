<script lang="ts">
	import type { TFile } from "obsidian";
	import type ReposePlugin from "../main";
	import { readMediaItem } from "../media/mediaModel";
	import ShowDetail from "./ShowDetail.svelte";

	export let plugin: ReposePlugin;
	export let selectedPath: string | null;

	$: file = selectedPath ? (plugin.app.vault.getAbstractFileByPath(selectedPath) as TFile | null) : null;
	$: item = file ? readMediaItem(plugin.app, file) : null;

	async function openNote(): Promise<void> {
		if (!file) return;
		await plugin.app.workspace.getLeaf("tab").openFile(file);
	}

	async function toggleWatched(): Promise<void> {
		if (!selectedPath) return;
		await plugin.toggleWatchedFrontmatter(selectedPath);
	}
</script>

<div class="repose-media-detail">
	{#if !item || !file}
		<p class="repose-muted">Pick an item from the list.</p>
	{:else if item.mediaType === "show"}
		<ShowDetail {plugin} showFile={file} />
	{:else}
		<header class="repose-media-detail__header">
			<h2 class="repose-media-detail__title">{item.title}</h2>
			<div class="repose-media-detail__actions">
				<button type="button" on:click={openNote}>Open note</button>
				<button type="button" on:click={toggleWatched}>
					{item.watchedDate ? "Mark unwatched" : "Mark watched"}
				</button>
			</div>
		</header>
		<p class="repose-muted">Type: {item.mediaType}{item.status ? ` · ${item.status}` : ""}</p>
	{/if}
</div>


<script lang="ts">
	import type { TFile } from "obsidian";
	import type { MediaHeroPalette } from "../media/bannerSample";
	import type ReposePlugin from "../main";
	import { resolveMediaTypeForFile, resolveSerialHostFile } from "../media/mediaDetect";
	import ShowDetail from "./ShowDetail.svelte";
	import EpisodeDetail from "./EpisodeDetail.svelte";

	export let plugin: ReposePlugin;
	export let file: TFile;
	/** MarkdownView.containerEl — palette + tint target (covers .view-content background). */
	export let tintRootEl: HTMLElement;

	$: mt = resolveMediaTypeForFile(plugin.app, file, plugin.settings);
	$: hostFile = mt === "episode" ? resolveSerialHostFile(plugin.app, file, plugin.settings) : null;

	function onSelectPath(path: string): void {
		plugin.reposeRequestSelectPath?.(path);
	}

	function onPalette(p: MediaHeroPalette | null): void {
		if (!tintRootEl) return;
		if (!p) {
			tintRootEl.removeAttribute("data-repose-tint");
			tintRootEl.style.removeProperty("--repose-sample-r");
			tintRootEl.style.removeProperty("--repose-sample-g");
			tintRootEl.style.removeProperty("--repose-sample-b");
			return;
		}
		tintRootEl.setAttribute("data-repose-tint", "1");
		tintRootEl.style.setProperty("--repose-sample-r", String(p.r));
		tintRootEl.style.setProperty("--repose-sample-g", String(p.g));
		tintRootEl.style.setProperty("--repose-sample-b", String(p.b));
	}
</script>

<div class="repose-md-chrome-root repose-view-root">
	{#if mt === "book"}
		<ShowDetail
			{plugin}
			showFile={file}
			{onSelectPath}
			{onPalette}
			onGoHome={() => void plugin.openRepose({ landing: true })}
			embeddedMarkdownChrome={true}
			hideOpenNoteButton={true}
		/>
	{:else if mt === "episode"}
		<EpisodeDetail
			{plugin}
			episodeFile={file}
			{hostFile}
			{onSelectPath}
			{onPalette}
			suppressDetail={false}
		/>
	{/if}
</div>

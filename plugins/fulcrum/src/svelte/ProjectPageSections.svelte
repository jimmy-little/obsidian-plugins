<script lang="ts">
	import {TAbstractFile, TFile} from "obsidian";
	import {onDestroy, onMount} from "svelte";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision} from "../fulcrum/stores";
	import {parseProjectPageSections, type ProjectPageSection} from "../fulcrum/projectNote";
	import ProjectPageSectionBody from "./ProjectPageSectionBody.svelte";

	export let plugin: FulcrumHost;
	export let projectPath: string;

	let sections: ProjectPageSection[] = [];
	let loadId = 0;

	async function loadSections(): Promise<void> {
		const id = ++loadId;
		const file = plugin.app.vault.getAbstractFileByPath(projectPath);
		if (!(file instanceof TFile)) {
			if (id === loadId) sections = [];
			return;
		}
		try {
			const body = await plugin.app.vault.read(file);
			const parsed = parseProjectPageSections(body, plugin.settings.projectLogSectionHeading);
			if (id === loadId) sections = parsed;
		} catch {
			if (id === loadId) sections = [];
		}
	}

	function onVaultModify(file: TAbstractFile): void {
		if (file instanceof TFile && file.path === projectPath) {
			void loadSections();
		}
	}

	onMount(() => {
		plugin.app.vault.on("modify", onVaultModify);
	});

	onDestroy(() => {
		plugin.app.vault.off("modify", onVaultModify);
	});

	$: {
		void $indexRevision;
		void projectPath;
		void loadSections();
	}
</script>

{#if sections.length > 0}
	<div class="fulcrum-project-page-sections">
		{#each sections as section (section.title)}
			<section class="fulcrum-section fulcrum-project-page-section">
				<h2>{section.title}</h2>
				<ProjectPageSectionBody
					{plugin}
					sourcePath={projectPath}
					markdown={section.markdown}
				/>
			</section>
		{/each}
	</div>
{/if}

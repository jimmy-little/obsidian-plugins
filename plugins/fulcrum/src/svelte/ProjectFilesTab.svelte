<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {
		listProjectFolderEntries,
		resolveProjectContentFolder,
		type ProjectFolderEntry,
	} from "../fulcrum/utils/projectContentFolder";

	export let plugin: FulcrumHost;
	export let projectPath: string;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	function fileIcon(el: HTMLElement, ext: string): {update: (next: string) => void} {
		const icon = ext === "md" ? "file-text" : ext ? "file" : "file";
		setIcon(el, icon);
		return {
			update(next: string) {
				el.empty();
				setIcon(el, next === "md" ? "file-text" : next ? "file" : "file");
			},
		};
	}

	$: folder = resolveProjectContentFolder(plugin.app, projectPath);
	$: entries = folder ? listProjectFolderEntries(folder) : [];
	$: folderLabel = folder?.path ?? projectPath;

	function openEntry(entry: ProjectFolderEntry): void {
		plugin.openLinkedNoteFromFulcrum(entry.path, hoverParentLeaf);
	}

	function formatModified(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
</script>

<section class="fulcrum-project-files" aria-label="Project files">
	{#if !folder}
		<p class="fulcrum-muted">Could not resolve a folder for this project.</p>
	{:else if entries.length === 0}
		<p class="fulcrum-muted">No files in <code>{folderLabel}</code>.</p>
	{:else}
		<p class="fulcrum-project-files__hint fulcrum-muted">
			Files in <code>{folderLabel}</code>
		</p>
		<ul class="fulcrum-project-files__list">
			{#each entries as entry (entry.path)}
				<li>
					<button
						type="button"
						class="fulcrum-project-files__row"
						on:click={() => openEntry(entry)}
					>
						<span
							class="fulcrum-project-files__icon"
							use:fileIcon={entry.extension}
							aria-hidden="true"
						></span>
						<span class="fulcrum-project-files__main">
							<span class="fulcrum-project-files__name">{entry.name}</span>
							{#if entry.folderPath}
								<span class="fulcrum-project-files__path">{entry.folderPath}/</span>
							{/if}
						</span>
						<span class="fulcrum-project-files__mtime">{formatModified(entry.modifiedMs)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

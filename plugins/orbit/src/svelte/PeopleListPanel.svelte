<script lang="ts">
	import {onMount} from "svelte";
	import type {TFile} from "obsidian";
	import type {OrbitHost} from "../orbit/pluginHost";
	import {collectPeopleMarkdownFiles} from "../orbit/collectPeopleFiles";
	import {resolvePersonAvatarSrc} from "../orbit/personAvatar";
	import {
		readPersonFrontmatter,
		displayNameForPerson,
		formatPersonWorkLocationLine,
		stripWikiLinkDisplay,
	} from "../orbit/personModel";
	import OrbitPersonListRow from "./OrbitPersonListRow.svelte";

	export let plugin: OrbitHost;
	export let selectedPath: string | null;
	export let onSelectPerson: (path: string) => void;

	let searchQuery = "";
	let listRev = 0;

	function accentForFile(f: TFile): string {
		const fm = readPersonFrontmatter(plugin.app.metadataCache.getFileCache(f));
		const c = fm.color?.trim();
		if (c && (/^#[0-9a-f]{3,8}$/i.test(c) || /^rgb/i.test(c))) return c;
		return "var(--background-modifier-border)";
	}

	function labelFor(f: TFile): string {
		const fm = readPersonFrontmatter(plugin.app.metadataCache.getFileCache(f));
		return displayNameForPerson(fm, f.basename);
	}

	function initialsFor(f: TFile): string {
		const label = labelFor(f);
		const parts = label.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
		return label.slice(0, 2).toUpperCase() || "?";
	}

	function avatarSrcFor(f: TFile): string | null {
		return resolvePersonAvatarSrc(plugin.app, f, plugin.settings.avatarFrontmatterField);
	}

	function sublineFor(f: TFile): string {
		const fm = readPersonFrontmatter(plugin.app.metadataCache.getFileCache(f));
		return formatPersonWorkLocationLine(fm);
	}

	function sortFiles(files: TFile[]): TFile[] {
		return [...files].sort((a, b) =>
			labelFor(a).localeCompare(labelFor(b), undefined, {sensitivity: "base"}),
		);
	}

	$: raw = (listRev, collectPeopleMarkdownFiles(plugin.app, plugin.settings.peopleDirs));
	$: sorted = sortFiles(raw);
	$: filtered = ((): TFile[] => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return sorted;
		return sorted.filter((f) => {
			const fm = readPersonFrontmatter(plugin.app.metadataCache.getFileCache(f));
			const pos = stripWikiLinkDisplay(fm.position?.trim() ?? "").trim();
			const line = `${labelFor(f)} ${sublineFor(f)} ${pos}`.toLowerCase();
			return line.includes(q);
		});
	})();

	function bump(): void {
		listRev++;
	}

	onMount(() => {
		plugin.registerEvent(plugin.app.metadataCache.on("changed", bump));
		plugin.registerEvent(plugin.app.vault.on("create", bump));
		plugin.registerEvent(plugin.app.vault.on("delete", bump));
		plugin.registerEvent(plugin.app.vault.on("rename", bump));
	});
</script>

<div class="orbit-people-panel">
	<div class="orbit-people-panel__search">
		<input
			class="search-input"
			type="search"
			placeholder="Search people"
			aria-label="Search people"
			bind:value={searchQuery}
		/>
	</div>
	{#if filtered.length === 0}
		<p class="orbit-muted orbit-people-panel__empty">
			{raw.length === 0
				? "No notes found under your people directories."
				: "No matches."}
		</p>
	{:else}
		<ul class="orbit-sidebar-people-list">
			{#each filtered as f (f.path)}
				<li>
					<OrbitPersonListRow
						file={f}
						label={labelFor(f)}
						subline={sublineFor(f)}
						accentCss={accentForFile(f)}
						avatarSrc={avatarSrcFor(f)}
						initials={initialsFor(f)}
						avatarStyle={plugin.settings.avatarStyle}
						{selectedPath}
						onSelect={onSelectPerson}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>

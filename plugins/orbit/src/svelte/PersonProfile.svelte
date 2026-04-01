<script lang="ts">
	import {onDestroy, onMount} from "svelte";
	import {TFile} from "obsidian";
	import type {OrbitHost} from "../orbit/pluginHost";
	import {readPersonFrontmatter, displayNameForPerson} from "../orbit/personModel";
	import {
		collectInteractions,
		mergeActivityFeed,
		quickNoteEntriesFromPersonBody,
		type InteractionEntry,
	} from "../orbit/interactions";
	import {computePersonStats, type PersonStatsTiles} from "../orbit/stats";
	import {wikiLinkPathsFromText, resolveWikiPath} from "../orbit/orgLinks";
	import {VIEW_ORBIT_PERSON} from "../orbit/constants";

	export let plugin: OrbitHost;
	export let filePath: string;

	let personFile: TFile | null = null;
	let displayName = "";
	let bannerColor = "";
	let avatarSrc: string | null = null;
	let initials = "";
	let company = "";
	let orgUpPaths: {label: string; path: string}[] = [];
	let orgDownPaths: {label: string; path: string}[] = [];
	let activity: InteractionEntry[] = [];
	let stats: PersonStatsTiles | null = null;
	let quickDraft = "";
	let unsub: (() => void) | null = null;

	function resolveAvatarSrc(raw: string | undefined): string | null {
		if (!raw?.trim()) return null;
		const s = raw.trim();
		if (/^https?:\/\//i.test(s)) return s;
		const dest = plugin.app.metadataCache.getFirstLinkpathDest(s, filePath);
		if (dest) {
			const af = plugin.app.vault.getAbstractFileByPath(dest);
			if (af && af instanceof TFile) return plugin.app.vault.getResourcePath(af);
		}
		const direct = plugin.app.vault.getAbstractFileByPath(s);
		if (direct && direct instanceof TFile) return plugin.app.vault.getResourcePath(direct);
		return null;
	}

	function rebuild(): void {
		const f = plugin.app.vault.getAbstractFileByPath(filePath);
		if (!f || !(f instanceof TFile)) {
			personFile = null;
			return;
		}
		personFile = f;
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = readPersonFrontmatter(cache);
		const rawFm = cache?.frontmatter as Record<string, unknown> | undefined;
		const avKey = plugin.settings.avatarFrontmatterField;
		const avatarRaw =
			typeof rawFm?.[avKey] === "string"
				? (rawFm[avKey] as string)
				: typeof rawFm?.avatar === "string"
					? rawFm.avatar
					: fm.avatar;
		displayName = displayNameForPerson(fm, f.basename);
		bannerColor = (fm.color?.trim() || plugin.settings.defaultBannerColor).trim();
		avatarSrc = resolveAvatarSrc(avatarRaw);
		const parts = displayName.split(/\s+/).filter(Boolean);
		initials =
			parts.length >= 2
				? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
				: displayName.slice(0, 2).toUpperCase() || "?";
		company = fm.company?.trim() ?? "";

		orgUpPaths = [];
		for (const lt of wikiLinkPathsFromText(fm.org_up)) {
			const p = resolveWikiPath(plugin.app, lt, f);
			if (p) orgUpPaths.push({label: lt, path: p});
		}
		orgDownPaths = [];
		const downRaw = fm.org_down;
		let downList: string[] = [];
		if (typeof downRaw === "string") downList = wikiLinkPathsFromText(downRaw);
		else if (Array.isArray(downRaw)) {
			for (const x of downRaw) downList.push(...wikiLinkPathsFromText(String(x)));
		}
		for (const lt of downList) {
			const p = resolveWikiPath(plugin.app, lt, f);
			if (p) orgDownPaths.push({label: lt, path: p});
		}

		void plugin.app.vault.read(f).then((body) => {
			const back = collectInteractions(plugin.app, f, plugin.settings);
			const quick = quickNoteEntriesFromPersonBody(f, body);
			activity = mergeActivityFeed(back, quick);
			stats = computePersonStats(activity);
		});
	}

	$: filePath, void rebuild();

	function fmtDate(ms: number | null): string {
		if (ms == null) return "—";
		try {
			return new Date(ms).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return "—";
		}
	}

	function kindLabel(k: InteractionEntry["kind"]): string {
		if (k === "meeting") return "Meeting";
		if (k === "call") return "Call";
		if (k === "quick") return "Quick note";
		return "Note";
	}

	async function openRawNote(): Promise<void> {
		if (!personFile) return;
		await plugin.openMarkdownFile(personFile);
	}

	async function openPersonPath(path: string): Promise<void> {
		const leaf = plugin.app.workspace.getLeaf("split", "vertical");
		await leaf.setViewState({
			type: VIEW_ORBIT_PERSON,
			active: true,
			state: {path},
		});
		await plugin.app.workspace.revealLeaf(leaf);
	}

	async function submitQuick(): Promise<void> {
		const t = quickDraft.trim();
		if (!t || !personFile) return;
		await plugin.appendQuickNote(personFile, t);
		quickDraft = "";
		rebuild();
	}

	function focusQuick(): void {
		const el = document.querySelector<HTMLTextAreaElement>(".orbit-quick-note__input");
		el?.focus();
	}

	onMount(() => {
		const ref = plugin.app.metadataCache.on("changed", (file) => {
			if (file?.path === filePath) rebuild();
		});
		const refVault = plugin.app.vault.on("modify", (file) => {
			if (file?.path === filePath) rebuild();
		});
		unsub = () => {
			plugin.app.metadataCache.offref(ref);
			plugin.app.vault.offref(refVault);
		};
	});

	onDestroy(() => {
		unsub?.();
	});
</script>

<div class="orbit-profile orbit-view-root">
	<header class="orbit-banner" style={`--orbit-banner-bg: ${bannerColor}`}>
		<div class="orbit-banner__inner">
			<div class="orbit-banner__actions">
				<button type="button" class="orbit-btn" on:click={openRawNote}>Open note</button>
				<button type="button" class="orbit-btn" disabled title="Coming soon">Snapshot</button>
				<button type="button" class="orbit-btn" on:click={focusQuick}>New quick note</button>
			</div>
			<h1 class="orbit-banner__title">{displayName}</h1>
			{#if company}
				<p class="orbit-banner__company">{company}</p>
			{/if}
		</div>
		<div class="orbit-banner__avatar-wrap">
			<div class="orbit-banner__avatar orbit-banner__avatar--{plugin.settings.avatarStyle}">
				{#if avatarSrc}
					<img src={avatarSrc} alt="" />
				{:else}
					<span class="orbit-banner__initials">{initials}</span>
				{/if}
			</div>
		</div>
	</header>

	{#if stats}
		<section class="orbit-section orbit-stats" aria-label="Stats">
			<div class="orbit-stat-tile">
				<span class="orbit-stat-tile__label">Last contacted</span>
				<span class="orbit-stat-tile__value">{fmtDate(stats.lastContacted)}</span>
			</div>
			<div class="orbit-stat-tile">
				<span class="orbit-stat-tile__label">Total interactions</span>
				<span class="orbit-stat-tile__value">{stats.totalInteractions}</span>
			</div>
			<div class="orbit-stat-tile">
				<span class="orbit-stat-tile__label">This month</span>
				<span class="orbit-stat-tile__value">{stats.thisMonth}</span>
			</div>
			<div class="orbit-stat-tile">
				<span class="orbit-stat-tile__label">Avg cadence</span>
				<span class="orbit-stat-tile__value">
					{stats.avgCadenceDays != null ? `${stats.avgCadenceDays} days` : "—"}
				</span>
			</div>
			<div class="orbit-stat-tile">
				<span class="orbit-stat-tile__label">First contact</span>
				<span class="orbit-stat-tile__value">{fmtDate(stats.firstContact)}</span>
			</div>
			<div class="orbit-stat-tile">
				<span class="orbit-stat-tile__label">Month streak</span>
				<span class="orbit-stat-tile__value">{stats.monthStreak}</span>
			</div>
		</section>
	{/if}

	{#if orgUpPaths.length > 0 || orgDownPaths.length > 0}
		<section class="orbit-section">
			<h2 class="orbit-section__title">Org</h2>
			{#if orgUpPaths.length > 0}
				<div class="orbit-org-row">
					<span class="orbit-org-row__label">Reports to</span>
					{#each orgUpPaths as o}
						<button type="button" class="orbit-chip" on:click={() => openPersonPath(o.path)}>
							{o.label}
						</button>
					{/each}
				</div>
			{/if}
			{#if orgDownPaths.length > 0}
				<div class="orbit-org-row">
					<span class="orbit-org-row__label">Direct reports</span>
					{#each orgDownPaths as o}
						<button type="button" class="orbit-chip" on:click={() => openPersonPath(o.path)}>
							{o.label}
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<section class="orbit-section">
		<h2 class="orbit-section__title">Activity</h2>
		{#if activity.length === 0}
			<p class="orbit-muted">No interactions yet. Link to this person from meeting notes, calls, or projects.</p>
		{:else}
			<ul class="orbit-activity-list">
				{#each activity as row}
					<li class="orbit-activity-row">
						<span class="orbit-activity-row__kind" title={kindLabel(row.kind)}>{kindLabel(row.kind)}</span>
						<div class="orbit-activity-row__body">
							{#if row.kind === "quick" && row.quickBody}
								<span class="orbit-muted">{fmtDate(row.dateMs)}</span>
								<p class="orbit-activity-row__quick">{row.quickBody}</p>
							{:else}
								<button
									type="button"
									class="orbit-linklike"
									on:click={() => void plugin.app.workspace.getLeaf("tab").openFile(row.file)}
								>
									{row.title}
								</button>
								<span class="orbit-muted">{fmtDate(row.dateMs)}</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<footer class="orbit-quick-note">
		<label class="orbit-quick-note__label" for="orbit-quick-input">Quick note</label>
		<textarea
			id="orbit-quick-input"
			class="orbit-quick-note__input"
			rows="2"
			placeholder="Type a note… Use [[links]] to reference pages."
			bind:value={quickDraft}
			on:keydown={(e) => {
				if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					void submitQuick();
				}
			}}
		/>
		<button type="button" class="orbit-btn orbit-btn--primary" on:click={() => void submitQuick()}>Add to note</button>
	</footer>
</div>

<style>
	.orbit-profile {
		padding: 0 0 1.25rem;
		min-height: 100%;
		box-sizing: border-box;
	}
	.orbit-banner {
		position: relative;
		background: var(--orbit-banner-bg, var(--background-secondary));
		padding: 1.25rem 1rem 2.5rem;
		border-radius: 0 0 var(--radius-m, 8px) var(--radius-m, 8px);
	}
	.orbit-banner__inner {
		max-width: 42rem;
	}
	.orbit-banner__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: flex-end;
		margin-bottom: 0.75rem;
	}
	.orbit-banner__title {
		margin: 0;
		font-size: var(--font-ui-large);
		font-weight: 700;
		color: var(--text-on-accent, var(--text-normal));
		mix-blend-mode: normal;
	}
	.orbit-banner__company {
		margin: 0.35rem 0 0;
		font-size: var(--font-ui-small);
		opacity: 0.9;
	}
	.orbit-banner__avatar-wrap {
		position: absolute;
		left: 1rem;
		bottom: -1.25rem;
	}
	.orbit-banner__avatar {
		width: 4.25rem;
		height: 4.25rem;
		border-radius: 999px;
		border: 3px solid var(--background-primary);
		background: var(--background-modifier-border);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}
	.orbit-banner__avatar--cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.orbit-banner__avatar--thumbnail {
		border-radius: var(--radius-s, 6px);
	}
	.orbit-banner__avatar img {
		max-width: 100%;
		max-height: 100%;
		object-fit: cover;
	}
	.orbit-banner__initials {
		font-size: var(--font-ui-medium);
		font-weight: 700;
		color: var(--text-normal);
	}
	.orbit-section {
		margin-top: 1.5rem;
		padding: 0 1rem;
	}
	.orbit-section__title {
		margin: 0 0 0.5rem;
		font-size: var(--font-ui-medium);
		font-weight: 600;
	}
	.orbit-muted {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}
	.orbit-stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: 0.5rem;
	}
	.orbit-stat-tile {
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s, 6px);
		padding: 0.45rem 0.5rem;
		background: var(--background-primary);
	}
	.orbit-stat-tile__label {
		display: block;
		font-size: calc(var(--font-ui-smaller) - 1px);
		color: var(--text-muted);
	}
	.orbit-stat-tile__value {
		font-weight: 600;
		font-size: var(--font-ui-small);
	}
	.orbit-org-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.35rem;
	}
	.orbit-org-row__label {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		min-width: 5.5rem;
	}
	.orbit-chip {
		font: inherit;
		font-size: var(--font-ui-small);
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		cursor: pointer;
	}
	.orbit-chip:hover {
		background: var(--background-modifier-hover);
	}
	.orbit-activity-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.orbit-activity-row {
		display: flex;
		gap: 0.65rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--background-modifier-border);
	}
	.orbit-activity-row:last-child {
		border-bottom: none;
	}
	.orbit-activity-row__kind {
		flex: 0 0 4.5rem;
		font-size: calc(var(--font-ui-smaller) - 1px);
		color: var(--text-muted);
	}
	.orbit-activity-row__body {
		flex: 1;
		min-width: 0;
	}
	.orbit-linklike {
		display: inline;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--text-accent);
		cursor: pointer;
		text-align: left;
	}
	.orbit-activity-row__quick {
		margin: 0.2rem 0 0;
		font-size: var(--font-ui-small);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.orbit-quick-note {
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--background-modifier-border);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.orbit-quick-note__label {
		font-size: var(--font-ui-smaller);
		font-weight: 600;
	}
	.orbit-quick-note__input {
		width: 100%;
		min-height: 2.5rem;
		resize: vertical;
		font: inherit;
		font-size: var(--font-ui-small);
		padding: 0.45rem 0.5rem;
		border-radius: var(--radius-s, 6px);
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
	}
	.orbit-btn {
		font: inherit;
		font-size: var(--font-ui-smaller);
		padding: 0.25rem 0.55rem;
		border-radius: var(--radius-s, 6px);
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
		cursor: pointer;
	}
	.orbit-btn:hover:not(:disabled) {
		background: var(--background-modifier-hover);
	}
	.orbit-btn--primary {
		align-self: flex-start;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}
</style>

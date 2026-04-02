<script lang="ts">
	import {onDestroy, onMount} from "svelte";
	import {setIcon, TFile} from "obsidian";

	function orbitBannerIcon(el: HTMLElement, icon: string): {update: (next: string) => void} {
		setIcon(el, icon);
		return {
			update(next: string) {
				el.empty();
				setIcon(el, next);
			},
		};
	}
	import type {OrbitHost} from "../orbit/pluginHost";
	import {readPersonFrontmatter, displayNameForPerson, formatPersonWorkLocationLine} from "../orbit/personModel";
	import {
		collectInteractions,
		mergeActivityFeed,
		quickNoteEntriesFromPersonBody,
		type InteractionEntry,
	} from "../orbit/interactions";
	import {loadOrbitActivityPreviews} from "../orbit/loadActivityPreviews";
	import {computePersonStats, type PersonStatsTiles} from "../orbit/stats";
	import {wikiLinkPathsFromText, resolveWikiPath} from "../orbit/orgLinks";
	import {VIEW_ORBIT_PERSON} from "../orbit/constants";
	import OrbitActivityRow from "./OrbitActivityRow.svelte";

	const ACTIVITY_PAGE_SIZE = 25;

	type OrgPersonPill = {
		path: string;
		label: string;
		displayName: string;
		avatarSrc: string | null;
	};

	export let plugin: OrbitHost;
	export let filePath: string;

	let personFile: TFile | null = null;
	let displayName = "";
	let bannerColor = "";
	let avatarSrc: string | null = null;
	let initials = "";
	let workLocationLine = "";
	let orgUpPaths: OrgPersonPill[] = [];
	let orgDownPaths: OrgPersonPill[] = [];
	let activity: InteractionEntry[] = [];
	/** How many activity rows to render (rest via “Load more”). */
	let activityVisibleCount = ACTIVITY_PAGE_SIZE;
	let activityPreviews: Record<string, string> = {};
	let stats: PersonStatsTiles | null = null;
	let quickDraft = "";
	let unsub: (() => void) | null = null;

	function resolveAvatarSrcForNote(raw: string | undefined, sourceNotePath: string): string | null {
		if (!raw?.trim()) return null;
		const s = raw.trim();
		if (/^https?:\/\//i.test(s)) return s;
		const dest = plugin.app.metadataCache.getFirstLinkpathDest(s, sourceNotePath);
		if (dest) {
			const af = plugin.app.vault.getAbstractFileByPath(dest);
			if (af && af instanceof TFile) return plugin.app.vault.getResourcePath(af);
		}
		const direct = plugin.app.vault.getAbstractFileByPath(s);
		if (direct && direct instanceof TFile) return plugin.app.vault.getResourcePath(direct);
		return null;
	}

	function enrichOrgPerson(linkPath: string, linkLabel: string): OrgPersonPill {
		const pf = plugin.app.vault.getAbstractFileByPath(linkPath);
		if (!(pf instanceof TFile)) {
			return {path: linkPath, label: linkLabel, displayName: linkLabel, avatarSrc: null};
		}
		const c = plugin.app.metadataCache.getFileCache(pf);
		const fm = readPersonFrontmatter(c);
		const rf = c?.frontmatter as Record<string, unknown> | undefined;
		const avKey = plugin.settings.avatarFrontmatterField;
		const avatarRaw =
			typeof rf?.[avKey] === "string"
				? (rf[avKey] as string)
				: typeof rf?.avatar === "string"
					? rf.avatar
					: fm.avatar;
		return {
			path: linkPath,
			label: linkLabel,
			displayName: displayNameForPerson(fm, pf.basename),
			avatarSrc: resolveAvatarSrcForNote(avatarRaw, pf.path),
		};
	}

	function rebuild(): void {
		const f = plugin.app.vault.getAbstractFileByPath(filePath);
		if (!f || !(f instanceof TFile)) {
			personFile = null;
			activity = [];
			stats = null;
			return;
		}
		personFile = f;
		activity = [];
		activityVisibleCount = ACTIVITY_PAGE_SIZE;
		stats = computePersonStats([]);
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
		avatarSrc = resolveAvatarSrcForNote(avatarRaw, f.path);
		const parts = displayName.split(/\s+/).filter(Boolean);
		initials =
			parts.length >= 2
				? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
				: displayName.slice(0, 2).toUpperCase() || "?";
		workLocationLine = formatPersonWorkLocationLine(fm);

		orgUpPaths = [];
		for (const lt of wikiLinkPathsFromText(fm.org_up)) {
			const p = resolveWikiPath(plugin.app, lt, f);
			if (p) orgUpPaths.push(enrichOrgPerson(p, lt));
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
			if (p) orgDownPaths.push(enrichOrgPerson(p, lt));
		}

		void plugin.app.vault.read(f).then(async (body) => {
			const back = await collectInteractions(plugin.app, f, plugin.settings);
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

	function fmtActivityWhen(row: InteractionEntry): string {
		try {
			if (row.showTimeInFeed) {
				return new Date(row.dateMs).toLocaleString(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
					hour: "numeric",
					minute: "2-digit",
				});
			}
			return new Date(row.dateMs).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return "—";
		}
	}

	$: displayedActivity = activity.slice(
		0,
		Math.min(activityVisibleCount, activity.length),
	);

	$: activityPreviewKey =
		activity.length > 0
			? `${filePath}\0${activityVisibleCount}\0${displayedActivity.map((r) => `${r.kind}:${r.file.path}:${r.dateMs}:${r.quickBody ?? ""}`).join("\0")}\0${plugin.settings.activityPreviewEntryField}\0${plugin.settings.activityPreviewMaxLines}`
			: "";

	$: if (activityPreviewKey) {
		const key = activityPreviewKey;
		const rows = displayedActivity;
		const vault = plugin.app.vault;
		const entryField = plugin.settings.activityPreviewEntryField;
		const maxLines = plugin.settings.activityPreviewMaxLines;
		void loadOrbitActivityPreviews(
			vault,
			rows.map((r) => ({kind: r.kind, path: r.file.path, title: r.title})),
			entryField,
			maxLines,
		).then((m) => {
			if (key !== activityPreviewKey) return;
			activityPreviews = m;
		});
	} else {
		activityPreviews = {};
	}

	function loadMoreActivity(): void {
		activityVisibleCount = Math.min(activity.length, activityVisibleCount + ACTIVITY_PAGE_SIZE);
	}

	async function openRawNote(): Promise<void> {
		if (!personFile) return;
		await plugin.openMarkdownFile(personFile);
	}

	function openOrgChartSidebar(): void {
		if (!personFile) return;
		void plugin.openOrgChartForAnchor(personFile.path);
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

	function linearizeSrgb(c: number): number {
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	}

	/** Prefer light toolbar text/buttons (Fulcrum "on-dark") vs dark (on-light) from hex banner color. */
	function bannerUiOnDark(bannerCssColor: string): boolean {
		const m = bannerCssColor.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
		if (!m) return true;
		let s = m[1];
		if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
		const r = parseInt(s.slice(0, 2), 16) / 255;
		const g = parseInt(s.slice(2, 4), 16) / 255;
		const b = parseInt(s.slice(4, 6), 16) / 255;
		const lum =
			0.2126 * linearizeSrgb(r) + 0.7152 * linearizeSrgb(g) + 0.0722 * linearizeSrgb(b);
		return lum <= 0.55;
	}

	$: bannerOnDark = bannerUiOnDark(bannerColor);

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
		<div
			class="orbit-banner__inner"
			class:orbit-banner__inner--on-dark={bannerOnDark}
			class:orbit-banner__inner--on-light={!bannerOnDark}
		>
			<div class="orbit-banner__top">
				<div class="orbit-banner__left">
					<div class="orbit-banner__avatar orbit-banner__avatar--{plugin.settings.avatarStyle}">
						{#if avatarSrc}
							<img src={avatarSrc} alt="" />
						{:else}
							<span class="orbit-banner__initials">{initials}</span>
						{/if}
					</div>
					<h1 class="orbit-banner__title">{displayName}</h1>
					{#if workLocationLine}
						<p class="orbit-banner__company">{workLocationLine}</p>
					{/if}
				</div>
				<div class="orbit-banner__actions">
					<div class="orbit-banner-btn-row">
						<button
							type="button"
							class="orbit-banner-btn orbit-banner-btn--icon-only"
							aria-label="Open note"
							title="Open note"
							on:click={() => void openRawNote()}
						>
							<span class="orbit-banner-btn__icon" use:orbitBannerIcon={"file-input"} aria-hidden="true"></span>
						</button>
						<button
							type="button"
							class="orbit-banner-btn orbit-banner-btn--icon-only"
							disabled
							aria-label="Snapshot"
							title="Coming soon"
						>
							<span class="orbit-banner-btn__icon" use:orbitBannerIcon={"camera"} aria-hidden="true"></span>
						</button>
					</div>
					<div class="orbit-banner-btn-row">
						<button
							type="button"
							class="orbit-banner-btn orbit-banner-btn--icon-only"
							aria-label="Org chart"
							title="Org chart"
							on:click={openOrgChartSidebar}
						>
							<span
								class="orbit-banner-btn__icon orbit-banner-btn__icon--flip"
								use:orbitBannerIcon={"git-fork"}
								aria-hidden="true"
							></span>
						</button>
						<span class="orbit-banner-btn-slot" aria-hidden="true"></span>
					</div>
				</div>
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

	{#if personFile}
		<section class="orbit-section orbit-section--quick-notes" aria-label="Quick notes">
			<div class="orbit-quick-notes-row">
				<textarea
					class="orbit-quick-note-input"
					rows="1"
					placeholder="Add a quick note…"
					aria-label="Quick note"
					bind:value={quickDraft}
					on:keydown={(e) => {
						if (e.key !== "Enter" || e.shiftKey) return;
						e.preventDefault();
						void submitQuick();
					}}
				/>
				<button type="button" class="orbit-quick-note-btn" on:click={() => void submitQuick()}>
					Add Quick Note
				</button>
			</div>
		</section>
	{/if}

	{#if orgUpPaths.length > 0 || orgDownPaths.length > 0}
		<section class="orbit-section">
			<h2 class="orbit-section__title">Org</h2>
			{#if orgUpPaths.length > 0}
				<div class="orbit-org-row orbit-org-row--pills">
					<span class="orbit-org-row__label">Reports to</span>
					<div class="orbit-org-pills">
						{#each orgUpPaths as o (o.path)}
							<button
								type="button"
								class="fulcrum-person-inline-pill"
								aria-label={o.displayName}
								on:click={() => openPersonPath(o.path)}
							>
								<span class="fulcrum-person-inline-pill__avatar" aria-hidden="true">
									{#if o.avatarSrc}
										<img src={o.avatarSrc} alt="" />
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
											<circle cx="12" cy="8" r="3" />
											<path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
										</svg>
									{/if}
								</span>
								<span class="fulcrum-person-inline-pill__name">{o.displayName}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
			{#if orgDownPaths.length > 0}
				<div class="orbit-org-row orbit-org-row--pills">
					<span class="orbit-org-row__label">Direct reports</span>
					<div class="orbit-org-pills">
						{#each orgDownPaths as o (o.path)}
							<button
								type="button"
								class="fulcrum-person-inline-pill"
								aria-label={o.displayName}
								on:click={() => openPersonPath(o.path)}
							>
								<span class="fulcrum-person-inline-pill__avatar" aria-hidden="true">
									{#if o.avatarSrc}
										<img src={o.avatarSrc} alt="" />
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
											<circle cx="12" cy="8" r="3" />
											<path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
										</svg>
									{/if}
								</span>
								<span class="fulcrum-person-inline-pill__name">{o.displayName}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<section class="orbit-section">
		<h2 class="orbit-section__title">Activity</h2>
		{#if activity.length === 0}
			<p class="orbit-muted">No interactions yet. Link to this person from meeting notes, calls, or projects.</p>
		{:else}
			{#if activity.length > displayedActivity.length}
				<p class="orbit-muted orbit-activity-feed__count">
					Showing {displayedActivity.length} of {activity.length}
				</p>
			{/if}
			<div class="orbit-activity-feed">
				{#each displayedActivity as row (row.kind === "quick" ? `q:${row.dateMs}:${row.quickBody ?? ""}` : row.file.path)}
					<OrbitActivityRow
						{plugin}
						{row}
						whenLabel={fmtActivityWhen(row)}
						bodyPreview={row.kind === "quick" ? undefined : activityPreviews[row.file.path]}
					/>
				{/each}
			</div>
			{#if activity.length > displayedActivity.length}
				<div class="orbit-activity-load-more">
					<button type="button" class="orbit-btn" on:click={loadMoreActivity}>
						Load more ({activity.length - displayedActivity.length} remaining)
					</button>
				</div>
			{/if}
		{/if}
	</section>
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
		border-radius: var(--radius-l, 10px);
		overflow: hidden;
		margin: 0 1rem 0.5rem;
		box-sizing: border-box;
	}
	.orbit-banner__inner {
		position: relative;
		padding: 1.15rem 1.25rem 1.2rem;
		box-sizing: border-box;
	}
	.orbit-banner__top {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem 1.25rem;
		align-items: start;
	}
	.orbit-banner__left {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		min-width: 0;
	}
	.orbit-banner__actions {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;
		width: 100%;
		max-width: 11.5rem;
		justify-self: end;
	}
	.orbit-banner__title {
		margin: 0.65rem 0 0;
		font-size: clamp(1.2rem, 2vw, 1.65rem);
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.02em;
		color: var(--text-normal);
	}
	.orbit-banner__inner--on-dark .orbit-banner__title {
		color: rgba(255, 255, 255, 0.97);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
	}
	.orbit-banner__company {
		margin: 0.35rem 0 0;
		font-size: var(--font-ui-small);
		color: var(--text-muted);
	}
	.orbit-banner__inner--on-dark .orbit-banner__company {
		color: rgba(255, 255, 255, 0.88);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.orbit-banner__avatar {
		width: 5.75rem;
		height: 5.75rem;
		flex-shrink: 0;
		border-radius: 999px;
		border: 3px solid color-mix(in srgb, var(--background-primary) 88%, transparent);
		background: var(--background-modifier-border);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
	}
	.orbit-banner__inner--on-dark .orbit-banner__avatar {
		border-color: rgba(255, 255, 255, 0.35);
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
		font-size: var(--font-ui-large);
		font-weight: 700;
		color: var(--text-normal);
	}
	.orbit-banner__inner--on-dark .orbit-banner__initials {
		color: rgba(255, 255, 255, 0.95);
	}
	.orbit-banner-btn {
		--input-shadow: none;
		box-shadow: none;
		font: inherit;
		font-size: var(--font-ui-small);
		font-weight: 500;
		padding: 0.38rem 0.65rem;
		border-radius: var(--radius-s, 6px);
		cursor: pointer;
		text-align: center;
		line-height: 1.25;
	}
	.orbit-banner__inner--on-dark .orbit-banner-btn {
		background: rgba(255, 255, 255, 0.14);
		border: 1px solid rgba(255, 255, 255, 0.38);
		color: rgba(255, 255, 255, 0.96);
	}
	.orbit-banner__inner--on-dark .orbit-banner-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.24);
		border-color: rgba(255, 255, 255, 0.55);
	}
	.orbit-banner__inner--on-light .orbit-banner-btn {
		background: color-mix(in srgb, var(--background-primary) 88%, transparent);
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 85%, transparent);
		color: var(--text-normal);
	}
	.orbit-banner__inner--on-light .orbit-banner-btn:hover:not(:disabled) {
		background: var(--background-modifier-hover);
	}
	.orbit-banner__inner--on-dark .orbit-banner-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.orbit-banner-btn-row {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: 0.4rem;
		width: 100%;
	}
	.orbit-banner-btn-row > .orbit-banner-btn {
		flex: 1 1 0;
		min-width: 0;
	}
	.orbit-banner-btn--icon-only {
		display: inline-flex !important;
		align-items: center;
		justify-content: center;
		padding: 0.3rem 0.4rem !important;
		min-width: 2rem;
		min-height: 2rem;
		line-height: 0;
	}
	.orbit-banner-btn__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.05rem;
		height: 1.05rem;
	}
	.orbit-banner-btn__icon--flip {
		transform: rotate(180deg);
	}
	.orbit-banner-btn-slot {
		flex: 1 1 0;
		min-width: 0;
		min-height: 2rem;
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
	.orbit-section--quick-notes {
		margin-top: 0.35rem;
	}
	.orbit-quick-notes-row {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: 0.55rem;
		width: 100%;
		box-sizing: border-box;
	}
	.orbit-quick-note-input {
		flex: 1 1 auto;
		min-width: 0;
		display: block;
		box-sizing: border-box;
		margin: 0;
		padding: 0.4rem 0.55rem;
		min-height: calc(1.35em + 0.8rem);
		max-height: calc(1.35em + 0.8rem);
		height: calc(1.35em + 0.8rem);
		resize: none;
		overflow-x: auto;
		overflow-y: hidden;
		line-height: 1.35;
		font-size: var(--font-ui-small);
		font-family: inherit;
		border-radius: var(--radius-s, 6px);
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 35%, var(--background-modifier-border));
		background: var(--background-primary);
		color: var(--text-normal);
	}
	.orbit-quick-note-input:focus {
		border-color: color-mix(in srgb, var(--interactive-accent) 65%, var(--background-modifier-border));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
		outline: none;
	}
	.orbit-quick-note-btn {
		flex: 0 0 auto;
		align-self: stretch;
		--input-shadow: none;
		box-shadow: none;
		padding: 0.4rem 0.75rem;
		border-radius: var(--radius-s, 6px);
		font-size: var(--font-ui-small);
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		font-family: inherit;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 82%, rgba(0, 0, 0, 0.12));
	}
	.orbit-quick-note-btn:hover:not(:disabled) {
		filter: brightness(1.06);
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
	.orbit-org-row--pills {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.55rem;
		margin-bottom: 0.45rem;
	}
	.orbit-org-row__label {
		flex: 0 0 auto;
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		min-width: 5.5rem;
	}
	.orbit-org-pills {
		display: flex;
		flex-flow: row wrap;
		align-items: center;
		gap: 0.35rem 0.4rem;
		flex: 1 1 auto;
		min-width: 0;
	}
	.orbit-org-pills .fulcrum-person-inline-pill {
		font: inherit;
		cursor: pointer;
		max-width: 100%;
	}
	.orbit-activity-feed__count {
		margin: 0 0 0.5rem;
	}
	.orbit-activity-feed {
		margin: 0;
		padding: 0;
	}
	/* Fulcrum-style timeline: hide stems above first / below last row so the spine connects cleanly. */
	.orbit-activity-feed :global(.orbit-activity-row:first-child .orbit-activity-timeline__stem--before) {
		visibility: hidden;
		min-height: 0.4rem;
	}
	.orbit-activity-feed :global(.orbit-activity-row:last-child .orbit-activity-timeline__stem--after) {
		visibility: hidden;
		min-height: 0.4rem;
	}
	.orbit-activity-load-more {
		margin-top: 0.75rem;
		padding: 0 1rem;
	}
	.orbit-activity-load-more .orbit-btn {
		width: 100%;
		max-width: 20rem;
		padding: 0.45rem 0.65rem;
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

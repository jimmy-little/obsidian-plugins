<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {setIcon} from "obsidian";
	import {onMount} from "svelte";

	function bannerBtnIcon(el: HTMLElement, icon: string): { update: (next: string) => void } {
		setIcon(el, icon);
		return {
			update(next: string) {
				el.empty();
				setIcon(el, next);
			},
		};
	}
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision} from "../fulcrum/stores";
	import {parseList} from "../fulcrum/settingsDefaults";
	import type {AtomicNoteRow, ProjectRollup} from "../fulcrum/types";
	import {
		daysSinceCalendar,
		daysUntilCalendar,
		formatShortMonthDay,
		formatTrackedMinutesShort,
		urgencyColorForDays,
	} from "../fulcrum/utils/dates";
	import {
		buildActivityRowModels,
		buildNextUpSegments,
		incompleteProjectTasks,
		leadingTimelineEmojiFromNoteType,
	} from "../fulcrum/utils/projectActivity";
	import {
		LAPSE_PUBLIC_API_READY_EVENT,
		LAPSE_PUBLIC_API_UNLOAD_EVENT,
	} from "@obsidian-suite/interop";
	import {getLapseApi, runLapseQuickStartForProject} from "../fulcrum/lapseIntegration";
	import {preferLightForegroundOnAccentCss} from "../fulcrum/utils/projectVisual";
	import type {ProjectLogActivityEntry} from "../fulcrum/projectNote";
	import {loadActivityFeedPreviews} from "../fulcrum/loadActivityFeedPreviews";
	import ActivityRow from "./ActivityRow.svelte";
	import NextUpMeetingCard from "./NextUpMeetingCard.svelte";
	import TaskCard from "./TaskCard.svelte";

	export let plugin: FulcrumHost;
	export let projectPath: string;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	/** When set, show a back control (Project Manager shell exit or standalone “home”). */
	export let onBackFromProject: (() => void) | undefined = undefined;
	export let backTargetLabel = "Dashboard";

	let rollup: ProjectRollup | null = null;
	let rollupLoadId = 0;
	let rollupMissing = false;

	$: rev = $indexRevision;
	$: {
		void rev;
		void projectPath;
		if (!plugin.vaultIndex.resolveProjectByPath(projectPath)) {
			rollupMissing = true;
			rollup = null;
		} else {
			rollupMissing = false;
			const id = ++rollupLoadId;
			void plugin.vaultIndex.getProjectRollup(projectPath, plugin.settings).then((r) => {
				if (id === rollupLoadId) rollup = r;
			});
		}
	}

	let logEntries: ProjectLogActivityEntry[] = [];
	let logBusy = false;
	let logDraft = "";

	async function loadLogActivity(): Promise<void> {
		logEntries = await plugin.loadProjectLogActivity(projectPath);
	}

	$: {
		void rev;
		void projectPath;
		void loadLogActivity();
	}

	$: doneTask = new Set(parseList(plugin.settings.taskDoneStatuses));

	$: daysSinceReview = rollup
		? daysSinceCalendar(rollup.pageMeta.lastReviewed)
		: null;
	$: daysReview = rollup ? daysUntilCalendar(rollup.pageMeta.nextReview) : null;
	$: colorReview = urgencyColorForDays(daysReview);

	function openPath(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	function noteChipsNext(n: AtomicNoteRow): import("../fulcrum/utils/projectActivity").ActivityChip[] {
		const c: import("../fulcrum/utils/projectActivity").ActivityChip[] = [];
		if (n.dateDisplay) c.push({kind: "date", label: n.dateDisplay});
		if (n.noteType) c.push({kind: "type", label: n.noteType.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")});
		for (const t of n.tags) c.push({kind: "tag", label: `#${t}`});
		if (n.trackedMinutes > 0) c.push({kind: "tracked", label: formatTrackedMinutesShort(n.trackedMinutes)});
		if (n.priority) c.push({kind: "misc", label: n.priority});
		return c;
	}

	function jiraHref(raw: string | undefined): string | null {
		if (!raw?.trim()) return null;
		const t = raw.trim();
		if (/^https?:\/\//i.test(t)) return t;
		return null;
	}

	async function appendLog(): Promise<void> {
		if (logBusy) return;
		logBusy = true;
		try {
			await plugin.appendProjectLogEntry(projectPath, logDraft);
			logDraft = "";
			await loadLogActivity();
		} finally {
			logBusy = false;
		}
	}

	function onQuickNoteKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" || ev.shiftKey) return;
		ev.preventDefault();
		void appendLog();
	}

	async function captureSnapshot(): Promise<void> {
		await plugin.archiveProjectSnapshot(projectPath);
	}

	function markReviewed(): void {
		plugin.openMarkReviewedModal(projectPath, () => void loadLogActivity());
	}

	function openProjectProperties(): void {
		plugin.openProjectNoteProperties(projectPath);
	}

	$: nextUpSeg = rollup
		? buildNextUpSegments(rollup, doneTask, 8, plugin.settings.taskTag)
		: {meetings: [], items: []};
	$: nextUpMeetings = nextUpSeg.meetings;
	$: nextUpListItems = nextUpSeg.items;

	$: openTasks = rollup ? incompleteProjectTasks(rollup.tasks, doneTask) : [];

	$: activityRows = rollup
		? buildActivityRowModels(rollup, logEntries, {
				projectPath,
				doneTask,
				openPath,
				openTask: (t) => plugin.openIndexedTask(t, hoverParentLeaf),
				formatTracked: formatTrackedMinutesShort,
			})
		: [];

	let activityFeedPreviews: Record<string, string> = {};

	/** Stable key so async preview loads don’t apply after project/activity list changes. */
	$: activityFeedPreviewKey =
		rollup && activityRows.length > 0
			? `${projectPath}\u0000${activityRows.map((r) => r.id).join("\u0000")}\u0000${plugin.settings.atomicNoteEntryField}`
			: "";

	$: if (activityFeedPreviewKey) {
		const key = activityFeedPreviewKey;
		const rows = activityRows;
		const vault = plugin.app.vault;
		const entryField = plugin.settings.atomicNoteEntryField;
		void loadActivityFeedPreviews(vault, rows, entryField, 10).then((m) => {
			if (key !== activityFeedPreviewKey) return;
			activityFeedPreviews = m;
		});
	} else {
		activityFeedPreviews = {};
	}

	$: noteFolderHint =
		plugin.settings.atomicNoteFolderPrefixes.trim().length === 0;

	$: ticketUrl = rollup ? jiraHref(rollup.pageMeta.jira) : null;

	$: bannerMode = !rollup
		? "plain"
		: rollup.hasBannerImage
			? "image"
			: rollup.hasProjectColor
				? "solid"
				: "plain";

	/** White/light text on banner (image, or solid color that reads as “dark” via WCAG luminance). */
	$: bannerLightFg =
		bannerMode === "image" ||
		(bannerMode === "solid" && !!rollup && preferLightForegroundOnAccentCss(rollup.accentColorCss));

	/** Text/icon color on solid buttons that use project color as background. */
	$: ctaFgOnAccent = !rollup
		? "var(--text-on-accent)"
		: preferLightForegroundOnAccentCss(rollup.accentColorCss)
			? "rgba(255, 255, 255, 0.97)"
			: "rgba(24, 24, 28, 0.95)";

	$: statusPillText = rollup ? rollup.project.status.toUpperCase() : "";

	function statusPillKind(status: string): string {
		const x = status.toLowerCase();
		if (
			x === "active" ||
			x.includes("progress") ||
			x.includes("ongoing")
		) {
			return "active";
		}
		if (x.includes("done") || x.includes("complete") || x.includes("closed")) {
			return "done";
		}
		if (x.includes("block") || x.includes("hold") || x.includes("pause")) {
			return "blocked";
		}
		return "neutral";
	}

	$: statusKind = rollup ? statusPillKind(rollup.project.status) : "neutral";

	function markProjectComplete(): void {
		plugin.openMarkProjectCompleteModal(projectPath);
	}

	$: taskSourceMode = plugin.settings.taskSourceMode;
	$: showNewInlineTaskBtn = taskSourceMode === "obsidianTasks" || taskSourceMode === "both";
	$: showNewTaskNoteBtn = taskSourceMode === "taskNotes" || taskSourceMode === "both";
	$: showNewNoteFromTemplateBtn = plugin.settings.projectNewNoteTemplatePath.trim().length > 0;

	let lapseApiAvailable = !!getLapseApi(plugin.app);

	onMount(() => {
		const sync = (): void => {
			lapseApiAvailable = !!getLapseApi(plugin.app);
		};
		sync();
		window.addEventListener(LAPSE_PUBLIC_API_READY_EVENT, sync);
		window.addEventListener(LAPSE_PUBLIC_API_UNLOAD_EVENT, sync);
		return () => {
			window.removeEventListener(LAPSE_PUBLIC_API_READY_EVENT, sync);
			window.removeEventListener(LAPSE_PUBLIC_API_UNLOAD_EVENT, sync);
		};
	});

	function startLapseTimer(): void {
		if (!rollup) return;
		void runLapseQuickStartForProject(
			plugin.app,
			rollup.project.name,
			rollup.project.file.path,
		);
	}
</script>

{#if rollupMissing}
	<p class="fulcrum-muted">Project not found in index. Check folder settings and frontmatter.</p>
{:else if !rollup}
	<p class="fulcrum-muted">Loading project…</p>
{:else}
	<div
		class="fulcrum-project"
		style="--fulcrum-accent: {rollup.accentColorCss}; --fulcrum-cta-fg: {ctaFgOnAccent};"
	>
		<div
			class="fulcrum-project-banner"
			class:fulcrum-project-banner--image={bannerMode === "image"}
			class:fulcrum-project-banner--solid={bannerMode === "solid"}
			class:fulcrum-project-banner--plain={bannerMode === "plain"}
			style={bannerMode === "solid" ? `background-color: ${rollup.accentColorCss};` : undefined}
		>
			{#if rollup.hasBannerImage && rollup.bannerImageSrc}
				<img class="fulcrum-project-banner__img" src={rollup.bannerImageSrc} alt="" />
				<div class="fulcrum-project-banner__scrim" />
			{/if}
			<div
				class="fulcrum-project-banner__inner"
				class:fulcrum-project-banner__inner--has-foot={true}
				class:fulcrum-project-banner__inner--on-dark={bannerLightFg}
				class:fulcrum-project-banner__inner--on-light={!bannerLightFg}
			>
				<div class="fulcrum-project-banner__top">
					<div class="fulcrum-project-banner__left">
						<h1 class="fulcrum-project-banner__title">{rollup.project.name}</h1>
						{#if rollup.pageMeta.description}
							<p class="fulcrum-project-banner__desc">{rollup.pageMeta.description}</p>
						{/if}
					</div>
					<div class="fulcrum-project-banner__right">
						{#if rollup.project.areaName}
							<div class="fulcrum-project-banner__area">{rollup.project.areaName}</div>
						{/if}
						<div class="fulcrum-project-banner__actions">
							<div class="fulcrum-banner-btn-row">
								<button
									type="button"
									class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
									aria-label="Open note"
									title="Open note"
									on:click={() => openPath(rollup.project.file.path)}
								>
									<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"file-input"} aria-hidden="true"></span>
								</button>
								<button
									type="button"
									class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
									aria-label="Capture snapshot"
									title="Capture snapshot"
									on:click={() => void captureSnapshot()}
								>
									<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"camera"} aria-hidden="true"></span>
								</button>
							</div>
							<div class="fulcrum-banner-btn-row">
								<button
									type="button"
									class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
									aria-label="Edit properties"
									title="Edit properties (YAML)"
									on:click={openProjectProperties}
								>
									<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"file-json"} aria-hidden="true"></span>
								</button>
								<span class="fulcrum-banner-btn-slot" aria-hidden="true"></span>
							</div>
							<div class="fulcrum-banner-btn-row">
								<button
									type="button"
									class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
									aria-label="Mark reviewed"
									title="Mark reviewed"
									on:click={markReviewed}
								>
									<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"glasses"} aria-hidden="true"></span>
								</button>
								<button
									type="button"
									class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
									aria-label="Mark project complete"
									title="Mark project complete"
									on:click={markProjectComplete}
								>
									<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"folder-check"} aria-hidden="true"></span>
								</button>
							</div>
							{#if showNewNoteFromTemplateBtn || showNewInlineTaskBtn}
								<div class="fulcrum-banner-btn-row">
									{#if showNewNoteFromTemplateBtn}
										<button
											type="button"
											class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
											aria-label="New note from template"
											title="New note from template"
											on:click={() =>
												void plugin.createNewNoteFromTemplateForProject(
													projectPath,
													hoverParentLeaf,
												)}
										>
											<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"file-plus"} aria-hidden="true"></span>
										</button>
									{:else}
										<span class="fulcrum-banner-btn-slot" aria-hidden="true"></span>
									{/if}
									{#if showNewInlineTaskBtn}
										<button
											type="button"
											class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
											aria-label="New task"
											title="New task"
											on:click={() => plugin.openNewInlineTaskForProject(projectPath)}
										>
											<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"check"} aria-hidden="true"></span>
										</button>
									{:else}
										<span class="fulcrum-banner-btn-slot" aria-hidden="true"></span>
									{/if}
								</div>
							{/if}
							{#if showNewTaskNoteBtn || lapseApiAvailable}
								<div class="fulcrum-banner-btn-row">
									{#if showNewTaskNoteBtn}
										<button
											type="button"
											class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
											aria-label="New task note"
											title="New task note"
											on:click={() => plugin.openTaskNoteCreateForProject(projectPath)}
										>
											<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"file-check"} aria-hidden="true"></span>
										</button>
									{:else}
										<span class="fulcrum-banner-btn-slot" aria-hidden="true"></span>
									{/if}
									{#if lapseApiAvailable}
										<button
											type="button"
											class="fulcrum-banner-btn fulcrum-banner-btn--half fulcrum-banner-btn--icon-only"
											aria-label="Start Lapse timer (Quick Start) for this project"
											title="Start a Lapse timer (Quick Start) for this project"
											on:click={startLapseTimer}
										>
											<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"play"} aria-hidden="true"></span>
										</button>
									{:else}
										<span class="fulcrum-banner-btn-slot" aria-hidden="true"></span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="fulcrum-project-banner__foot">
					<div class="fulcrum-project-banner__foot-left">
						{#if onBackFromProject}
							<button
								type="button"
								class="fulcrum-banner-btn fulcrum-banner-btn--icon-only fulcrum-project-banner__shell-back"
								on:click={onBackFromProject}
								aria-label="Back to {backTargetLabel}"
								title="Back to {backTargetLabel}"
							>
								<span
									class="fulcrum-banner-btn__icon fulcrum-project-banner__shell-back-icon"
									use:bannerBtnIcon={"layout-dashboard"}
									aria-hidden="true"
								></span>
							</button>
						{/if}
						{#if statusPillText}
							<button
								type="button"
								class="fulcrum-status-pill fulcrum-status-pill--banner fulcrum-status-pill--jira fulcrum-status-pill--clickable"
								data-fulcrum-status={statusKind}
								title="Change status"
								on:click={() => {
									plugin.openChangeProjectStatusModal(
										projectPath,
										rollup.project.status,
										(newPath) => {
											if (newPath) void plugin.openProjectSummary(newPath);
										},
									);
								}}
							>
								{statusPillText}
							</button>
						{/if}
						{#if ticketUrl}
							<a
								href={ticketUrl}
								class="external-link fulcrum-project-banner__extlink"
								target="_blank"
								rel="noopener noreferrer"
							>
								External link
							</a>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="fulcrum-project-meta-strip">
			<div class="fulcrum-project-meta-strip__row">
				{#if rollup.pageMeta.lastReviewed}
					<span>
						Last reviewed {formatShortMonthDay(rollup.pageMeta.lastReviewed)}
						{#if daysSinceReview !== null}
							<span class="fulcrum-meta-days fulcrum-meta-days--since">
								(+{daysSinceReview}d)
							</span>
						{/if}
					</span>
				{/if}
				{#if rollup.pageMeta.lastReviewed && rollup.pageMeta.nextReview}
					<span class="fulcrum-meta-sep">·</span>
				{/if}
				{#if rollup.pageMeta.nextReview}
					<span>
						Next review {formatShortMonthDay(rollup.pageMeta.nextReview)}
						{#if daysReview !== null}
							<span class="fulcrum-meta-days" style="color: {colorReview};">
								({daysReview}d)
							</span>
						{/if}
					</span>
				{/if}
			</div>
		</div>

		<div class="fulcrum-hero-row fulcrum-hero-row--quad">
			<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
				<div class="fulcrum-mega-stat__value">
					{formatTrackedMinutesShort(rollup.aggregatedTrackedMinutes) || "0m"}
				</div>
				<div class="fulcrum-mega-stat__label">Time tracked</div>
			</div>
			<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
				<div class="fulcrum-mega-stat__value">
					{rollup.doneTasks}<span class="fulcrum-mega-stat__sub"> / {rollup.totalTasks}</span>
				</div>
				<div class="fulcrum-mega-stat__label">Completed</div>
			</div>
			<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
				<div class="fulcrum-mega-stat__value">{rollup.openTasks}</div>
				<div class="fulcrum-mega-stat__label">Open tasks</div>
			</div>
			<div class="fulcrum-mega-stat fulcrum-mega-stat--neutral">
				<div class="fulcrum-mega-stat__value">{rollup.atomicNotes.length}</div>
				<div class="fulcrum-mega-stat__label">Notes</div>
			</div>
		</div>

		<section class="fulcrum-section fulcrum-section--quick-notes" aria-label="Quick notes">
			<div class="fulcrum-quick-notes-row">
				<textarea
					class="fulcrum-quick-note-input"
					rows="1"
					placeholder="Add a quick note…"
					bind:value={logDraft}
					disabled={logBusy}
					on:keydown={onQuickNoteKeydown}
				/>
				<button
					type="button"
					class="fulcrum-quick-note-btn"
					disabled={logBusy}
					on:click={() => void appendLog()}
				>
					Add Quick Note
				</button>
			</div>
		</section>

		<section class="fulcrum-section">
			<div class="fulcrum-section-head">
				<h2 class="fulcrum-section-head__title">Next up</h2>
			</div>
			{#if nextUpMeetings.length === 0 && nextUpListItems.length === 0}
				<p class="fulcrum-muted">Nothing on the horizon...</p>
			{:else}
				{#if nextUpMeetings.length > 0}
					<div class="fulcrum-next-up-meetings-row" role="list" aria-label="Upcoming meetings">
						{#each nextUpMeetings as m (m.file.path)}
							<div class="fulcrum-next-up-meetings-row__cell" role="listitem">
								<NextUpMeetingCard meeting={m} onOpen={openPath} />
							</div>
						{/each}
					</div>
				{/if}
				{#if nextUpListItems.length > 0}
					<ul
						class="fulcrum-activity-list fulcrum-activity-list--timeline fulcrum-next-up-list"
						class:fulcrum-next-up-list--with-meetings-above={nextUpMeetings.length > 0}
					>
						{#each nextUpListItems as item}
							<li>
								{#if item.kind === "note" && item.note}
									<ActivityRow
										variant="icon"
										title={item.note.entryTitle}
										chips={noteChipsNext(item.note)}
										kind="note"
										timelineEmoji={leadingTimelineEmojiFromNoteType(item.note.noteType)}
										whenClick={() => item.note && openPath(item.note.file.path)}
										accentColorCss={rollup.accentColorCss}
										{plugin}
										hoverParentLeaf={hoverParentLeaf}
										hoverPath={item.note.file.path}
									/>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<section class="fulcrum-section">
			<h2>Tasks</h2>
			{#if rollup.tasks.length === 0}
				<p class="fulcrum-muted">No tasks in your indexed sources link to this project.</p>
			{:else if openTasks.length === 0}
				<p class="fulcrum-muted">No incomplete tasks.</p>
			{:else}
				<ul class="fulcrum-task-list fulcrum-task-agenda-list">
					{#each openTasks as t}
						<li>
							<TaskCard
								plugin={plugin}
								task={t}
								done={false}
								showProjectLink={false}
								anchorLeaf={hoverParentLeaf}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="fulcrum-section">
			<h2>Activity</h2>
			{#if noteFolderHint && rollup.atomicNotes.length === 0 && activityRows.length === 0}
				<p class="fulcrum-muted">
					Add atomic note folder prefixes in Fulcrum settings to include linked notes here.
				</p>
			{:else if activityRows.length === 0}
				<p class="fulcrum-muted">No activity to show yet.</p>
			{:else}
				<ul class="fulcrum-activity-list fulcrum-activity-list--timeline">
					{#each activityRows as row}
						<li>
							<ActivityRow
								variant="timeline"
								title={row.title}
								chips={row.chips}
								kind={row.kind}
								timelineEmoji={row.timelineEmoji}
								whenClick={row.open}
								{plugin}
								hoverParentLeaf={hoverParentLeaf}
								hoverPath={row.hoverPath}
								suppressHoverPreview={true}
								accentColorCss={rollup.accentColorCss}
								bodyPreview={row.hoverPath ? activityFeedPreviews[row.hoverPath] : undefined}
								previewAccentCss={rollup.accentColorCss}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if rollup.relatedPeople?.length > 0}
			<section class="fulcrum-section fulcrum-section--people">
				<h2 class="fulcrum-section--people__title">Related people</h2>
				<div class="fulcrum-people-grid">
					{#each rollup.relatedPeople as person (person.file.path)}
						<button
							type="button"
							class="fulcrum-person-card"
							aria-label={person.name}
							on:click={() => openPath(person.file.path)}
						>
							<div
								class="fulcrum-person-card__top"
								class:fulcrum-person-card__top--has-banner={!!person.bannerImageSrc}
								style:background-image={person.bannerImageSrc
									? `url(${JSON.stringify(person.bannerImageSrc)})`
									: undefined}
							>
								<div class="fulcrum-person-card__avatar">
									{#if person.avatarSrc}
										<img src={person.avatarSrc} alt="" />
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
											<circle cx="12" cy="8" r="3"/>
											<path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
										</svg>
									{/if}
								</div>
							</div>
							<span class="fulcrum-person-card__name">{person.name}</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}

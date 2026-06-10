<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import {Menu, setIcon} from "obsidian";
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
	import {isDoneStatus, parseDoneStatusSet, parseList} from "../fulcrum/settingsDefaults";
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
		leadingTimelineEmojiFromNoteType,
	} from "../fulcrum/utils/projectActivity";
	import {preferLightForegroundOnAccentCss} from "../fulcrum/utils/projectVisual";
	import type {ProjectLogActivityEntry} from "../fulcrum/projectNote";
	import {loadActivityFeedPreviews} from "../fulcrum/loadActivityFeedPreviews";
	import ActivityRow from "./ActivityRow.svelte";
	import NextUpMeetingCard from "./NextUpMeetingCard.svelte";
	import TaskListPanel from "./TaskListPanel.svelte";
	import KanbanMain from "./KanbanMain.svelte";
	import CalendarMain from "./CalendarMain.svelte";
	import GanttMain from "./GanttMain.svelte";
	import ProjectFilesTab from "./ProjectFilesTab.svelte";
	import ProjectPageSections from "./ProjectPageSections.svelte";
	import ConduitProjectToolbar from "./ConduitProjectToolbar.svelte";
	import PersonCard from "./PersonCard.svelte";

	type ProjectSummaryTab = "overview" | "list" | "board" | "timeline" | "calendar" | "files";
	const PROJECT_TABS: {id: ProjectSummaryTab; label: string}[] = [
		{id: "overview", label: "Overview"},
		{id: "list", label: "List"},
		{id: "board", label: "Board"},
		{id: "timeline", label: "Timeline"},
		{id: "calendar", label: "Calendar"},
		{id: "files", label: "Files"},
	];
	const PROJECT_TAB_LS = "fulcrum-project-summary-tab";

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

	$: doneTask = parseDoneStatusSet(plugin.settings.taskDoneStatuses);

	$: daysSinceReview = rollup
		? daysSinceCalendar(rollup.pageMeta.lastReviewed)
		: null;
	$: daysReview = rollup ? daysUntilCalendar(rollup.pageMeta.nextReview) : null;
	$: colorReview = urgencyColorForDays(daysReview);

	function openPath(path: string): void {
		plugin.openLinkedNoteFromFulcrum(path, hoverParentLeaf);
	}

	function openRelatedProject(path: string): void {
		void plugin.openProjectSummary(path);
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

	function startProjectTimer(): void {
		if (!rollup) return;
		void plugin.startTimerInNote(rollup.project.file.path, {
			projectName: rollup.project.name,
			noteTitle: rollup.project.name,
		});
	}

	let activeTab: ProjectSummaryTab = "overview";

	onMount(() => {
		try {
			const stored = localStorage.getItem(PROJECT_TAB_LS);
			if (stored && PROJECT_TABS.some((t) => t.id === stored)) {
				activeTab = stored as ProjectSummaryTab;
			}
		} catch {
			/* ignore */
		}
	});

	function selectTab(id: ProjectSummaryTab): void {
		activeTab = id;
		try {
			localStorage.setItem(PROJECT_TAB_LS, id);
		} catch {
			/* ignore */
		}
	}

	function openHeaderMenu(ev: MouseEvent): void {
		if (!rollup) return;
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("Open note");
			item.setIcon("square-arrow-out-up-right");
			item.onClick(() => openPath(rollup.project.file.path));
		});
		if (ticketUrl) {
			const url = ticketUrl;
			menu.addItem((item) => {
				item.setTitle("External link");
				item.setIcon("external-link");
				item.onClick(() => window.open(url, "_blank", "noopener,noreferrer"));
			});
		}
		menu.addItem((item) => {
			item.setTitle("Capture snapshot");
			item.setIcon("camera");
			item.onClick(() => void captureSnapshot());
		});
		menu.addItem((item) => {
			item.setTitle("Edit properties");
			item.setIcon("file-json");
			item.onClick(() => openProjectProperties());
		});
		if (plugin.conduitCanSync()) {
			if (plugin.conduitIsProjectSyncEnabled(projectPath)) {
				menu.addItem((item) => {
					item.setTitle("Stop Sync with Reminders");
					item.setIcon("bell-off");
					item.onClick(() => void plugin.conduitStopRemindersSync(projectPath));
				});
			} else {
				menu.addItem((item) => {
					item.setTitle("Sync with Reminders");
					item.setIcon("bell");
					item.onClick(() => void plugin.conduitStartRemindersSync(projectPath));
				});
			}
		}
		menu.addItem((item) => {
			item.setTitle("Mark reviewed");
			item.setIcon("glasses");
			item.onClick(() => markReviewed());
		});
		menu.addItem((item) => {
			item.setTitle("Add milestone");
			item.setIcon("gem");
			item.onClick(() => plugin.openAddMilestoneModal(projectPath));
		});
		menu.addItem((item) => {
			item.setTitle("Mark project complete");
			item.setIcon("folder-check");
			item.onClick(() => markProjectComplete());
		});
		if (showNewNoteFromTemplateBtn) {
			menu.addItem((item) => {
				item.setTitle("New note from template");
				item.setIcon("file-plus");
				item.onClick(() =>
					void plugin.createNewNoteFromTemplateForProject(projectPath, hoverParentLeaf),
				);
			});
		}
		if (showNewInlineTaskBtn) {
			menu.addItem((item) => {
				item.setTitle("New task");
				item.setIcon("check");
				item.onClick(() => plugin.openNewInlineTaskForProject(projectPath));
			});
		}
		if (showNewTaskNoteBtn) {
			menu.addItem((item) => {
				item.setTitle("New task note");
				item.setIcon("file-check");
				item.onClick(() => plugin.openTaskNoteCreateForProject(projectPath));
			});
		}
		menu.addItem((item) => {
			item.setTitle("Start timer in project note");
			item.setIcon("play");
			item.onClick(() => startProjectTimer());
		});
		menu.showAtMouseEvent(ev);
	}
</script>

{#if rollupMissing}
	<p class="fulcrum-muted">Project not found in index. Check folder settings and frontmatter.</p>
{:else if !rollup}
	<p class="fulcrum-muted">Loading project…</p>
{:else}
	<div
		class="fulcrum-project fulcrum-project--tabbed"
		style="--fulcrum-accent: {rollup.accentColorCss}; --fulcrum-cta-fg: {ctaFgOnAccent};"
	>
		<div class="fulcrum-project-header">
		<div
			class="fulcrum-project-banner fulcrum-project-banner--compact"
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
				class="fulcrum-project-banner__inner fulcrum-project-banner__inner--compact"
				class:fulcrum-project-banner__inner--on-dark={bannerLightFg}
				class:fulcrum-project-banner__inner--on-light={!bannerLightFg}
			>
				<div class="fulcrum-project-banner__head">
					<div class="fulcrum-project-banner__identity">
						<div class="fulcrum-project-banner__title-row">
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
							<h1 class="fulcrum-project-banner__title">{rollup.project.name}</h1>
						</div>
						{#if rollup.project.areaName}
							<div class="fulcrum-project-banner__area">{rollup.project.areaName}</div>
						{/if}
						{#if rollup.relatedProjects?.length > 0 || rollup.relatedProducts?.length > 0}
							<div class="fulcrum-project-banner__related">
								{#if rollup.relatedProjects?.length > 0}
									<div class="fulcrum-project-banner__related-row">
										{#each rollup.relatedProjects as p (p.file.path)}
											<button
												type="button"
												class="fulcrum-project-related-pill"
												title={p.name}
												on:click={() => openRelatedProject(p.file.path)}
											>
												<span
													class="fulcrum-project-related-pill__icon"
													use:bannerBtnIcon={"folder"}
													aria-hidden="true"
												></span>
												<span class="fulcrum-project-related-pill__label">{p.name}</span>
											</button>
										{/each}
									</div>
								{/if}
								{#if rollup.relatedProducts?.length > 0}
									<div class="fulcrum-project-banner__related-row">
										{#each rollup.relatedProducts as note (note.file.path)}
											<button
												type="button"
												class="fulcrum-project-related-pill"
												title={note.name}
												on:click={() => openPath(note.file.path)}
											>
												<span
													class="fulcrum-project-related-pill__icon"
													use:bannerBtnIcon={"app-window"}
													aria-hidden="true"
												></span>
												<span class="fulcrum-project-related-pill__label">{note.name}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
						{#if rollup.pageMeta.description}
							<p class="fulcrum-project-banner__desc">{rollup.pageMeta.description}</p>
						{/if}
						{#if rollup.pageMeta.agentSummary?.trim()}
							<div class="fulcrum-project-banner__agent-summary">
								<span
									class="fulcrum-project-banner__agent-summary-icon"
									use:bannerBtnIcon={"bot"}
									aria-hidden="true"
								></span>
								<p class="fulcrum-project-banner__agent-summary-text">
									{rollup.pageMeta.agentSummary}
								</p>
							</div>
						{/if}
					</div>
					<div class="fulcrum-project-banner__head-actions-col">
						<div class="fulcrum-project-banner__head-actions">
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
							<button
								type="button"
								class="fulcrum-banner-btn fulcrum-banner-btn--icon-only fulcrum-project-banner__menu-btn"
								aria-label="Project actions"
								title="Project actions"
								on:click={openHeaderMenu}
							>
								<span class="fulcrum-banner-btn__icon" use:bannerBtnIcon={"circle-ellipsis"} aria-hidden="true"></span>
							</button>
						</div>
						<ConduitProjectToolbar {plugin} {projectPath} />
					</div>
				</div>
			</div>
		</div>

		<nav class="fulcrum-project-tabs" aria-label="Project views">
			{#each PROJECT_TABS as tab (tab.id)}
				<button
					type="button"
					class="fulcrum-project-tabs__btn"
					class:fulcrum-project-tabs__btn--active={activeTab === tab.id}
					aria-selected={activeTab === tab.id}
					role="tab"
					style={activeTab === tab.id
						? `--fulcrum-tab-accent: ${rollup.accentColorCss}; --fulcrum-tab-fg: ${ctaFgOnAccent};`
						: undefined}
					on:click={() => selectTab(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</nav>
		</div>

		<div
			class="fulcrum-project-tab-panel"
			class:fulcrum-project-tab-panel--fill={activeTab === "list" ||
				activeTab === "board" ||
				activeTab === "calendar" ||
				activeTab === "timeline"}
			class:fulcrum-project-tab-panel--scroll={activeTab === "overview" ||
				activeTab === "files"}
		>
		{#if activeTab === "overview"}
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

		<ProjectPageSections {plugin} {projectPath} />

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
								task={row.task}
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
					{#each rollup.relatedPeople as person (person.file?.path ?? `ghost:${person.linkText}`)}
						<PersonCard person={person} {plugin} onKnownClick={openPath} />
					{/each}
				</div>
			</section>
		{/if}

		{:else if activeTab === "list"}
			<TaskListPanel
				{plugin}
				{hoverParentLeaf}
				filterProjectPath={projectPath}
				embedded={true}
				scheduleDragContext={false}
			/>
		{:else if activeTab === "board"}
			<KanbanMain {plugin} {hoverParentLeaf} filterProjectPath={projectPath} embedded={true} />
		{:else if activeTab === "timeline"}
			<GanttMain
				{plugin}
				{hoverParentLeaf}
				filterProjectPath={projectPath}
				variant="compact"
				embedded={true}
			/>
		{:else if activeTab === "calendar"}
			<CalendarMain
				{plugin}
				{hoverParentLeaf}
				filterProjectPath={projectPath}
				projectAtomicNotes={rollup.atomicNotes}
				embedded={true}
			/>
		{:else if activeTab === "files"}
			<ProjectFilesTab {plugin} {projectPath} {hoverParentLeaf} />
		{/if}
		</div>
	</div>
{/if}

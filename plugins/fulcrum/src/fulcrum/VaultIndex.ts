import {MarkdownView, type App, type Editor, TFile} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {resolveAreasRoot, resolveProjectsRoot} from "./settingsDefaults";
import {parseDoneStatusSet, isDoneStatus, isProjectDone, parseList} from "./settingsDefaults";
import {readProjectPageMeta} from "./projectNote";
import type {
	AtomicNoteRow,
	IndexedArea,
	IndexedMeeting,
	IndexedProject,
	IndexedTask,
	IndexSnapshot,
	PersonWorksWithEntry,
	ProjectRollup,
} from "./types";
import {isUnderFolder, projectStatusFromSubfolderLayout} from "./utils/paths";
import {formatShortMonthDay, isOverdue, parseFrontmatterDateToMs} from "./utils/dates";
import {parseAreaLinkPaths, parseWikiLink} from "./utils/wikilinks";
import {parseFolderPrefixList, isUnderAtomicPrefixes} from "./utils/atomicFolders";
import {
	resolveInlineTaskProjectFile,
	resolveProjectFileFromFm,
} from "./utils/projectLink";
import {readTrackedMinutesFromFm} from "./utils/trackedMinutes";
import {resolveTaskTimelineFields} from "./utils/taskTimeline";
import {meetingEffectiveMinutes, meetingHasPositiveTrackedMinutes} from "./utils/meetingEffectiveMinutes";
import {readLifeModeFromFrontmatter} from "./utils/areaFocusFilter";
import {resolveBannerImageSrc, resolveProjectAccentCss} from "./utils/projectVisual";
import {bumpIndexRevision} from "./stores";
import {
	fileMatchesFolderScope,
	fileMatchesFolderScopeWithExcludes,
	parseFolderPathList,
	parseFolderScopeList,
} from "./utils/folderScopes";
import {
	isCheckboxLine,
	parseCheckboxLineTitle,
	parseInlinePriority,
	parseInlineTags,
	parseObsidianTasksEmojiDates,
	lineIncludesTag,
	stripHtmlComments,
} from "./utils/inlineTasks";
import {applyTimeRangeToTaskDates, parseTimeRangeFromLine} from "./utils/dayPlannerTime";
import {indexDailyPlannerEvents, plannerTrackedMinutesForProject} from "./utils/dailyPlannerEvents";
import {buildPersonWorksWithIndex} from "../orbit/orbit/personWorksWith";
import {
	buildNoteBodyPreview,
	parseTagsFromFm,
	resolveEntryTitle,
	resolveNoteType,
} from "./utils/notePreview";
import {collectRelatedPeople} from "./projectPeople";
import {
	collectRelatedProductsFromFrontmatter,
	collectRelatedProjectsFromFrontmatter,
} from "./projectRelatedLinks";
import {parseRemindersFromFm, readTaskRecurrenceFields} from "./taskFmParse";

function fmString(fm: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!fm) return undefined;
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		const y = v.getFullYear();
		const m = String(v.getMonth() + 1).padStart(2, "0");
		const d = String(v.getDate()).padStart(2, "0");
		const h = String(v.getHours()).padStart(2, "0");
		const min = String(v.getMinutes()).padStart(2, "0");
		return `${y}-${m}-${d}T${h}:${min}`;
	}
	return undefined;
}

function fmNumber(fm: Record<string, unknown> | undefined, key: string): number | undefined {
	if (!fm || !key) return undefined;
	const v = fm[key];
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const t = v.trim();
		if (!t) return undefined;
		const n = Number.parseFloat(t);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

/** First matching key wins. `true` / `false` or common string forms. */
function fmBooleanLoose(
	fm: Record<string, unknown> | undefined,
	keys: string[],
): boolean | undefined {
	if (!fm) return undefined;
	for (const key of keys) {
		const v = fm[key];
		if (v === true) return true;
		if (v === false) return false;
		if (typeof v === "string") {
			const s = v.trim().toLowerCase();
			if (s === "true" || s === "yes" || s === "1") return true;
			if (s === "false" || s === "no" || s === "0") return false;
		}
	}
	return undefined;
}

function tagsIncludeTask(fm: Record<string, unknown>, tag: string): boolean {
	const t = fm.tags;
	const want = tag.toLowerCase();
	if (Array.isArray(t)) {
		return t.some((x) => String(x).toLowerCase() === want);
	}
	if (typeof t === "string") {
		return t
			.split(/[\s,]+/)
			.map((s) => s.replace(/^#/, "").toLowerCase())
			.includes(want);
	}
	return false;
}

/** Same eligibility as the project branch in `rebuild()` (explicit type or infer-without-area-type). */
function noteQualifiesForProjectIndex(
	path: string,
	fm: Record<string, unknown> | undefined,
	s: FulcrumSettings,
): boolean {
	if (!fm || !isUnderFolder(path, resolveProjectsRoot(s))) return false;
	const tVal = fmString(fm, s.typeField)?.toLowerCase();
	const areaTypeLc = s.areaTypeValue.toLowerCase();
	const projectTypeLc = s.projectTypeValue.toLowerCase();
	const isExplicitProject = tVal === projectTypeLc;
	const isInferredProject = s.inferProjectsInAreasFolder && tVal !== areaTypeLc;
	return isExplicitProject || isInferredProject;
}

function createdAtMsForFile(file: TFile, fm: Record<string, unknown> | undefined): number {
	if (fm) {
		for (const k of ["created", "createdDate"]) {
			const v = fmString(fm, k);
			if (v) {
				let t = Date.parse(v);
				if (Number.isNaN(t) && v.length >= 10) {
					t = Date.parse(v.slice(0, 10) + "T12:00:00");
				}
				if (!Number.isNaN(t)) return t;
			}
		}
	}
	return file.stat.ctime;
}

function projectLinksFromFm(
	fm: Record<string, unknown> | undefined,
	settings: FulcrumSettings,
	sourcePath: string,
	app: App,
): TFile[] {
	if (!fm) return [];
	const out: TFile[] = [];
	const keys = [
		settings.taskProjectsField.trim() || "projects",
		settings.projectLinkField.trim() || "project",
	];
	const seen = new Set<string>();
	for (const key of keys) {
		const raw = fm[key];
		const items = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
		for (const item of items) {
			if (typeof item !== "string") continue;
			const pl = parseWikiLink(item);
			if (!pl) continue;
			const dest = app.metadataCache.getFirstLinkpathDest(pl, sourcePath);
			if (dest instanceof TFile && !seen.has(dest.path)) {
				seen.add(dest.path);
				out.push(dest);
			}
		}
	}
	return out;
}

function augmentTaskRelationships(
	tasks: IndexedTask[],
	taskNotePaths: Set<string>,
	app: App,
	settings: FulcrumSettings,
): void {
	const subtaskCounts = new Map<string, number>();
	for (const t of tasks) {
		if (t.source !== "taskNote") continue;
		const cache = app.metadataCache.getFileCache(t.file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		const links = projectLinksFromFm(fm, settings, t.file.path, app);
		for (const linked of links) {
			if (!taskNotePaths.has(linked.path)) continue;
			if (linked.path === t.file.path) continue;
			t.parentTaskPath = linked.path;
			subtaskCounts.set(linked.path, (subtaskCounts.get(linked.path) ?? 0) + 1);
			break;
		}
	}
	for (const t of tasks) {
		if (t.source === "taskNote" && taskNotePaths.has(t.file.path)) {
			const n = subtaskCounts.get(t.file.path) ?? 0;
			if (n > 0) {
				t.subtaskCount = n;
				t.isProjectTask = true;
			}
		}
	}
}

function sameIndexedTask(a: IndexedTask, b: IndexedTask): boolean {
	if (a.file.path !== b.file.path || a.source !== b.source) return false;
	if (a.source === "inline") return a.line === b.line;
	return true;
}

export class VaultIndex {
	private app: App;
	private getSettings: () => FulcrumSettings;
	private snapshot: IndexSnapshot = {
		areas: [],
		projects: [],
		tasks: [],
		meetings: [],
		plannerEvents: [],
		personWorksWith: new Map(),
		rebuiltAt: 0,
	};
	private debounceHandle: number | null = null;
	private maxWaitHandle: number | null = null;
	private idleDebounceHandle: number | null = null;
	private rebuildGeneration = 0;
	private rebuildInflight = false;
	private rebuildPending = false;
	private rollupAtomicNotesByProject: Map<string, AtomicNoteRow[]> | null = null;
	private rollupAtomicNotesIndexAt = 0;
	private rollupAtomicNotesInflight: Promise<Map<string, AtomicNoteRow[]>> | null = null;
	private rollupCache = new Map<string, ProjectRollup>();
	private rollupInflight = new Map<string, Promise<ProjectRollup | null>>();

	private clearRollupCaches(): void {
		this.rollupAtomicNotesByProject = null;
		this.rollupAtomicNotesIndexAt = 0;
		this.rollupCache.clear();
	}

	/** Debounce for background metadata changes (non-active notes). */
	static readonly REBUILD_DEBOUNCE_MS = 400;
	static readonly REBUILD_MAX_WAIT_MS = 2000;
	/** While a note is open in an editor, wait for a typing pause before re-indexing. */
	static readonly IDLE_REBUILD_MS = 2500;
	/** Yield to the main thread while scanning large vaults. */
	static readonly REBUILD_YIELD_EVERY = 32;

	constructor(app: App, getSettings: () => FulcrumSettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	getSnapshot(): IndexSnapshot {
		return this.snapshot;
	}

	/**
	 * Apply a local patch to one indexed task and bump the view revision so UI
	 * updates immediately. Pair with `scheduleRebuild()` so the vault scan catches up.
	 */
	patchIndexedTask(
		task: IndexedTask,
		patch: Partial<
			Pick<
				IndexedTask,
				| "status"
				| "completedDate"
				| "title"
				| "priority"
				| "dueDate"
				| "scheduledDate"
				| "tags"
				| "inlineTags"
			>
		>,
	): void {
		const tasks = this.snapshot.tasks;
		const idx = tasks.findIndex((t) => sameIndexedTask(t, task));
		if (idx < 0) return;
		const next = [...tasks];
		next[idx] = {...tasks[idx]!, ...patch};
		this.snapshot = {...this.snapshot, tasks: next};
		bumpIndexRevision();
	}

	/** Remove one task from the in-memory index and bump revision (pair with scheduleRebuild). */
	removeIndexedTask(task: IndexedTask): void {
		const tasks = this.snapshot.tasks;
		const idx = tasks.findIndex((t) => sameIndexedTask(t, task));
		if (idx < 0) return;
		const next = tasks.filter((_, i) => i !== idx);
		this.snapshot = {...this.snapshot, tasks: next};
		bumpIndexRevision();
	}

	scheduleRebuild(): void {
		if (this.rebuildInflight) {
			this.rebuildPending = true;
			return;
		}
		if (this.debounceHandle != null) {
			window.clearTimeout(this.debounceHandle);
		}
		this.debounceHandle = window.setTimeout(() => {
			this.debounceHandle = null;
			this.clearMaxWaitTimer();
			void this.rebuild();
		}, VaultIndex.REBUILD_DEBOUNCE_MS);
		if (this.maxWaitHandle == null) {
			this.maxWaitHandle = window.setTimeout(() => {
				this.maxWaitHandle = null;
				if (this.debounceHandle != null) {
					window.clearTimeout(this.debounceHandle);
					this.debounceHandle = null;
				}
				void this.rebuild();
			}, VaultIndex.REBUILD_MAX_WAIT_MS);
		}
	}

	/**
	 * Metadata cache updates for the note being edited fire on every keystroke.
	 * While typing, only re-index checkbox lines (inline tasks, planner blocks).
	 * Background notes use normal debounced rebuild. Persisted modifies of an
	 * open editor file use the same idle path so autosave does not thrash the index.
	 */
	scheduleRebuildFromMetadataChange(file: TFile, _options?: {persisted?: boolean}): void {
		if (this.isFileOpenInMarkdownEditor(file.path)) {
			if (!this.fileNeedsIndexWhileEditing(file)) return;
			this.scheduleIdleRebuild();
			return;
		}
		this.scheduleRebuild();
	}

	/** Live editor: index only when the cursor is on a task / planner checkbox line. */
	private fileNeedsIndexWhileEditing(file: TFile): boolean {
		const editor = this.getActiveMarkdownEditorForPath(file.path);
		if (!editor) return false;
		return isCheckboxLine(editor.getLine(editor.getCursor().line));
	}

	private getActiveMarkdownEditorForPath(path: string): Editor | null {
		let editor: Editor | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path && view.getMode() !== "preview") {
				editor = view.editor;
			}
		});
		return editor;
	}

	private scheduleIdleRebuild(): void {
		if (this.idleDebounceHandle != null) {
			window.clearTimeout(this.idleDebounceHandle);
		}
		this.idleDebounceHandle = window.setTimeout(() => {
			this.idleDebounceHandle = null;
			void this.rebuild();
		}, VaultIndex.IDLE_REBUILD_MS);
	}

	private isFileOpenInMarkdownEditor(path: string): boolean {
		let open = false;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path) open = true;
		});
		return open;
	}

	private clearMaxWaitTimer(): void {
		if (this.maxWaitHandle != null) {
			window.clearTimeout(this.maxWaitHandle);
			this.maxWaitHandle = null;
		}
	}

	/** Cancel pending debounced rebuild (e.g. before explicit `rebuild()`). */
	cancelScheduledRebuild(): void {
		if (this.debounceHandle != null) {
			window.clearTimeout(this.debounceHandle);
			this.debounceHandle = null;
		}
		this.clearMaxWaitTimer();
		if (this.idleDebounceHandle != null) {
			window.clearTimeout(this.idleDebounceHandle);
			this.idleDebounceHandle = null;
		}
		this.rebuildPending = false;
	}

	private yieldToMain(): Promise<void> {
		return new Promise((resolve) => window.setTimeout(resolve, 0));
	}

	private isRebuildStale(generation: number): boolean {
		return generation !== this.rebuildGeneration;
	}

	async rebuild(): Promise<void> {
		this.rebuildGeneration += 1;
		const generation = this.rebuildGeneration;
		this.cancelScheduledRebuild();
		if (this.rebuildInflight) {
			this.rebuildPending = true;
			return;
		}
		this.rebuildInflight = true;
		try {
			await this.rebuildCore(generation);
		} finally {
			this.rebuildInflight = false;
			if (this.rebuildPending) {
				this.rebuildPending = false;
				this.scheduleRebuild();
			}
		}
	}

	private async rebuildCore(generation: number): Promise<void> {
		const s = this.getSettings();
		const areas: IndexedArea[] = [];
		const projects: IndexedProject[] = [];
		const tasks: IndexedTask[] = [];
		const meetings: IndexedMeeting[] = [];

		const typeField = s.typeField;
		const areasRoot = resolveAreasRoot(s);
		const projectsRoot = resolveProjectsRoot(s);
		const statusKey = s.projectStatusField.trim().replace(/:+$/u, "") || "status";

		let scannedNotes = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			scannedNotes += 1;
			if (scannedNotes % VaultIndex.REBUILD_YIELD_EVERY === 0) {
				await this.yieldToMain();
				if (this.isRebuildStale(generation)) return;
			}
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			const path = file.path;

			const inArea = isUnderFolder(path, areasRoot);
			const inProject = isUnderFolder(path, projectsRoot);
			const inMeetings = isUnderFolder(path, s.meetingsFolder);

			const tVal = fmString(fm, typeField)?.toLowerCase();
			const areaTypeLc = s.areaTypeValue.toLowerCase();

			if (inArea && fm && tVal === areaTypeLc) {
				const wr = fmBooleanLoose(fm, ["work-related", "workRelated"]);
				const lifeModeRaw = readLifeModeFromFrontmatter(fm, s);
				areas.push({
					file,
					name: fmString(fm, "name") ?? file.basename,
					status: fmString(fm, "status"),
					color: fmString(fm, "color"),
					icon: fmString(fm, "icon"),
					description: fmString(fm, "description"),
					workRelated: wr === true ? true : wr === false ? false : undefined,
					lifeMode: lifeModeRaw,
				});
				continue;
			}

			if (inProject && fm && noteQualifiesForProjectIndex(path, fm, s)) {
				const areaFilesResolved: TFile[] = [];
				const seenAreaPath = new Set<string>();
				for (const link of parseAreaLinkPaths(fm[s.areaLinkField])) {
					const dest = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
					if (dest && !seenAreaPath.has(dest.path)) {
						seenAreaPath.add(dest.path);
						areaFilesResolved.push(dest);
					}
				}
				const areaFile = areaFilesResolved[0] ?? null;
				const statusRaw =
					s.projectStatusIndication === "subfolder"
						? projectStatusFromSubfolderLayout(path, projectsRoot)
						: (fmString(fm, statusKey) ?? "active").toLowerCase();
				const endRaw =
					fmString(fm, "endDate") ??
					fmString(fm, s.projectEndDateField) ??
					fmString(fm, "launchDate");
				const endDate =
					endRaw && endRaw.length >= 10 ? endRaw.slice(0, 10) : endRaw || undefined;
				const rankKey = s.projectRankField.trim() || "rank";
				projects.push({
					file,
					name: fmString(fm, "name") ?? file.basename,
					status: statusRaw,
					priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
					startDate: fmString(fm, "startDate"),
					completedDate: fmString(fm, "completedDate"),
					areaFile,
					areaName: areaFile?.basename.replace(/\.md$/i, ""),
					areaFiles: areaFilesResolved,
					banner: fmString(fm, s.projectBannerField),
					color: fmString(fm, s.projectColorField),
					description: fmString(fm, "description"),
					nextReview: fmString(fm, s.projectNextReviewField),
					deadline: fmString(fm, s.projectDeadlineField),
					endDate,
					rank: fmNumber(fm, rankKey),
				});
				continue;
			}

			if (inMeetings && fm) {
				const dateFromStart =
					s.meetingStartTimeField?.trim() &&
					fmString(fm, s.meetingStartTimeField);
				const dateRaw =
					(dateFromStart && String(dateFromStart).trim()) ||
					fmString(fm, s.meetingDateField) ||
					undefined;

				let duration: number | undefined;
				const endRaw =
					s.meetingEndTimeField?.trim() &&
					fmString(fm, s.meetingEndTimeField);
				const endStr =
					(endRaw && String(endRaw).trim()) || undefined;
				if (dateRaw && endStr) {
					const startMs = Date.parse(dateRaw);
					const endMs = Date.parse(endStr);
					if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
						duration = Math.round((endMs - startMs) / 60000);
					}
				}
				if (duration == null) {
					const durRaw = fm[s.meetingDurationField];
					duration =
						typeof durRaw === "number"
							? durRaw
							: typeof durRaw === "string"
								? Number.parseFloat(durRaw)
								: undefined;
				}
				if (duration != null && !Number.isFinite(duration)) {
					duration = undefined;
				}

				const tmRaw = fm[s.meetingTotalMinutesField];
				const totalMinutesTracked =
					typeof tmRaw === "number"
						? tmRaw
						: typeof tmRaw === "string"
							? Number.parseFloat(tmRaw)
							: undefined;
				const pl = parseWikiLink(fm[s.projectLinkField]);
				const projectFile = pl
					? this.app.metadataCache.getFirstLinkpathDest(pl, file.path)
					: null;
				meetings.push({
					file,
					date: dateRaw ?? undefined,
					endTime: endStr,
					title: fmString(fm, s.meetingTitleField) ?? file.basename,
					duration: duration != null && duration > 0 ? duration : undefined,
					totalMinutesTracked: Number.isFinite(totalMinutesTracked)
						? totalMinutesTracked
						: undefined,
					projectFile,
				});
			}
		}

		const projectPaths = new Set(projects.map((p) => p.file.path));
		const taskNoteRoots = parseFolderPathList(s.taskNotesFolderPaths);
		const inlineScope = parseFolderScopeList(s.obsidianTasksFolderPaths);
		const useTaskNotes = s.taskSourceMode === "taskNotes" || s.taskSourceMode === "both";
		const useInline = s.taskSourceMode === "obsidianTasks" || s.taskSourceMode === "both";
		let inlineRegex: RegExp | null = null;
		const rxRaw = s.inlineTaskRegex.trim();
		if (rxRaw) {
			try {
				inlineRegex = new RegExp(rxRaw);
			} catch {
				inlineRegex = null;
			}
		}
		const openStatus = parseList(s.taskStatuses)[0] ?? "todo";
		const doneStatus = parseList(s.taskDoneStatuses)[0] ?? "done";
		const taskNotePaths = new Set<string>();
		const inlineIncludeTag = s.inlineTaskIncludeTag.trim();

		if (useTaskNotes) {
			let scannedTaskNotes = 0;
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (!fileMatchesFolderScope(file.path, taskNoteRoots)) continue;
				scannedTaskNotes += 1;
				if (scannedTaskNotes % VaultIndex.REBUILD_YIELD_EVERY === 0) {
					await this.yieldToMain();
					if (this.isRebuildStale(generation)) return;
				}
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter as Record<string, unknown> | undefined;
				if (!fm) continue;
				const tVal = fmString(fm, typeField)?.toLowerCase();
				if (!tagsIncludeTask(fm, s.taskTag) && tVal !== "task") continue;

				const projectFile = resolveProjectFileFromFm(
					this.app,
					fm,
					file.path,
					s.projectLinkField,
				);
				const al = parseWikiLink(fm[s.areaLinkField]);
				const areaFile = al
					? this.app.metadataCache.getFirstLinkpathDest(al, file.path)
					: null;
				const status = fmString(fm, s.taskStatusField) ?? openStatus;
				const due =
					fmString(fm, s.taskDueDateField) || fmString(fm, "due");
				const sched =
					fmString(fm, s.taskScheduledDateField) ?? fmString(fm, "scheduled");
				const startKey = s.taskStartTimeField?.trim() || "startTime";
				const endKey = s.taskEndTimeField?.trim() || "endTime";
				const durKey = s.taskDurationField?.trim() || "duration";
				const startTimeRaw = fmString(fm, startKey)?.trim();
				const endTimeRaw = fmString(fm, endKey)?.trim();
				const durN = fmNumber(fm, durKey);
				const recFields = readTaskRecurrenceFields(fm, s);
				const timeline = resolveTaskTimelineFields(fm, s.timer, file.path, sched, due);
				taskNotePaths.add(file.path);
				tasks.push({
					file,
					title: fmString(fm, s.taskTitleField) ?? file.basename,
					status,
					priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
					dueDate: due,
					scheduledDate: sched,
					completedDate: fmString(fm, s.taskCompletedDateField),
					startTime: startTimeRaw || undefined,
					endTime: endTimeRaw || undefined,
					durationMinutes:
						durN != null && Number.isFinite(durN) && durN > 0 ? Math.round(durN) : undefined,
					ganttDate: timeline.ganttDate,
					ganttTimeEntrySpan: timeline.ganttTimeEntrySpan,
					projectFile,
					areaFile,
					tags: parseTagsFromFm(fm),
					createdAtMs: createdAtMsForFile(file, fm),
					source: "taskNote",
					trackedMinutes: readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField),
					recurrence: recFields.recurrence,
					recurrenceAnchor: recFields.recurrenceAnchor,
					completeInstances: recFields.completeInstances,
					skippedInstances: recFields.skippedInstances,
					reminders: parseRemindersFromFm(fm, s),
					recurrenceParentPath: recFields.recurrenceParentPath,
					occurrenceDate: recFields.occurrenceDate,
				});
			}
		}

		if (useInline) {
			let scanned = 0;
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (this.isRebuildStale(generation)) return;
				if (
					!projectPaths.has(file.path) &&
					!fileMatchesFolderScopeWithExcludes(
						file.path,
						inlineScope.include,
						inlineScope.exclude,
						inlineScope.excludeFilenames,
					)
				) {
					continue;
				}
				const cache = this.app.metadataCache.getFileCache(file);
				const listItems = cache?.listItems;
				if (!listItems?.length) continue;

				scanned += 1;
				if (scanned % VaultIndex.REBUILD_YIELD_EVERY === 0) {
					await this.yieldToMain();
					if (this.isRebuildStale(generation)) return;
				}

				const lines = (await this.app.vault.cachedRead(file)).split(/\n/);
				const fm = cache?.frontmatter as Record<string, unknown> | undefined;
				const areaFile = (() => {
					const al = parseWikiLink(fm?.[s.areaLinkField]);
					return al
						? this.app.metadataCache.getFirstLinkpathDest(al, file.path)
						: null;
				})();

				for (const item of listItems) {
					if (item.task === undefined) continue;
					const lineNo = item.position?.start?.line;
					if (lineNo === undefined) continue;
					const rawLine = lines[lineNo] ?? "";
					const titleBare = parseCheckboxLineTitle(rawLine);
					if (titleBare === null) continue;
					const {title: titleEmoji, dueDate: dueEm, scheduledDate: schedEm} =
						parseObsidianTasksEmojiDates(titleBare);
					if (inlineIncludeTag && !lineIncludesTag(titleBare, inlineIncludeTag)) continue;
					if (inlineRegex && !inlineRegex.test(titleEmoji)) continue;
					const proj = resolveInlineTaskProjectFile(
						this.app,
						rawLine,
						file,
						fm,
						projectPaths,
						projects,
						s.projectLinkField,
					);
					const indexBroadInline =
						s.taskIndexScope === "all" || s.taskSourceMode === "both";
					if (!proj && !indexBroadInline) continue;
					if (
						!proj &&
						indexBroadInline &&
						s.taskSourceMode !== "both" &&
						!schedEm &&
						!dueEm &&
						!parseTimeRangeFromLine(titleEmoji)
					) {
						continue;
					}
					const enriched = applyTimeRangeToTaskDates({
						title: titleEmoji,
						scheduledDate: schedEm,
						dueDate: dueEm,
					});
					const isChecked = item.task === "x" || item.task === "X";
					const startKey = s.taskStartTimeField?.trim() || "startTime";
					const endKey = s.taskEndTimeField?.trim() || "endTime";
					const durKey = s.taskDurationField?.trim() || "duration";
					const startTimeRaw = fmString(fm, startKey)?.trim();
					const endTimeRaw = fmString(fm, endKey)?.trim();
					const durN = fmNumber(fm, durKey);
					const inlineTags = parseInlineTags(titleBare);
					const inlinePri = parseInlinePriority(titleBare);
					const timeline = resolveTaskTimelineFields(
						fm,
						s.timer,
						file.path,
						enriched.scheduledDate,
						enriched.dueDate,
					);
					tasks.push({
						file,
						title: stripHtmlComments(enriched.title).replace(/\s+/g, " ").trim() || enriched.title,
						status: isChecked ? doneStatus : openStatus,
						priority: inlinePri,
						dueDate: enriched.dueDate,
						scheduledDate: enriched.scheduledDate,
						completedDate: undefined,
						startTime: startTimeRaw || undefined,
						endTime: endTimeRaw || undefined,
						durationMinutes:
							enriched.durationMinutes ??
							(durN != null && Number.isFinite(durN) && durN > 0 ? Math.round(durN) : undefined),
						ganttDate: timeline.ganttDate,
						ganttTimeEntrySpan: timeline.ganttTimeEntrySpan,
						projectFile: proj,
						areaFile,
						tags: [],
						inlineTags,
						createdAtMs: file.stat.ctime,
						source: "inline",
						line: lineNo,
						trackedMinutes: readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField),
					});
				}
			}
		}

		augmentTaskRelationships(tasks, taskNotePaths, this.app, s);

		const plannerEvents = await indexDailyPlannerEvents(this.app, s, projects);
		if (this.isRebuildStale(generation)) return;

		// Publish the main snapshot first so status/title edits feel instant.
		// Collaborator indexing is heavy (reads meeting bodies) — refresh in background.
		this.snapshot = {
			areas,
			projects,
			tasks,
			meetings,
			plannerEvents,
			personWorksWith: this.snapshot.personWorksWith,
			rebuiltAt: Date.now(),
		};
		this.clearRollupCaches();
		bumpIndexRevision();

		void this.refreshPersonWorksWithInBackground(meetings, s, generation);
	}

	private async refreshPersonWorksWithInBackground(
		meetings: IndexedMeeting[],
		s: FulcrumSettings,
		generation: number,
	): Promise<void> {
		try {
			const personWorksWith = await buildPersonWorksWithIndex(this.app, meetings, s);
			if (this.isRebuildStale(generation)) return;
			this.snapshot = {...this.snapshot, personWorksWith};
			bumpIndexRevision();
		} catch (e) {
			console.error("Fulcrum: person works-with index failed", e);
		}
	}

	resolveProjectByPath(path: string): IndexedProject | undefined {
		return this.snapshot.projects.find((p) => p.file.path === path);
	}

	getPersonWorksWith(personPath: string): PersonWorksWithEntry[] {
		return this.snapshot.personWorksWith.get(personPath) ?? [];
	}

	async getProjectRollup(
		projectPath: string,
		s: FulcrumSettings,
	): Promise<ProjectRollup | null> {
		const cacheKey = `${projectPath}:${this.snapshot.rebuiltAt}`;
		const cached = this.rollupCache.get(cacheKey);
		if (cached) return cached;

		const inflight = this.rollupInflight.get(cacheKey);
		if (inflight) return inflight;

		const promise = this.buildProjectRollup(projectPath, s)
			.then((rollup) => {
				if (this.rollupInflight.get(cacheKey) === promise) {
					this.rollupInflight.delete(cacheKey);
				}
				if (rollup) this.rollupCache.set(cacheKey, rollup);
				return rollup;
			})
			.catch((err) => {
				if (this.rollupInflight.get(cacheKey) === promise) {
					this.rollupInflight.delete(cacheKey);
				}
				console.error("Fulcrum: project rollup failed", projectPath, err);
				return null;
			});
		this.rollupInflight.set(cacheKey, promise);
		return promise;
	}

	private async buildAtomicNotesByProject(
		s: FulcrumSettings,
	): Promise<Map<string, AtomicNoteRow[]>> {
		if (
			this.rollupAtomicNotesByProject &&
			this.rollupAtomicNotesIndexAt === this.snapshot.rebuiltAt
		) {
			return this.rollupAtomicNotesByProject;
		}
		if (this.rollupAtomicNotesInflight) {
			return this.rollupAtomicNotesInflight;
		}

		const promise = this.scanAtomicNotesByProject(s).finally(() => {
			if (this.rollupAtomicNotesInflight === promise) {
				this.rollupAtomicNotesInflight = null;
			}
		});
		this.rollupAtomicNotesInflight = promise;
		return promise;
	}

	private async scanAtomicNotesByProject(
		s: FulcrumSettings,
	): Promise<Map<string, AtomicNoteRow[]>> {
		const map = new Map<string, AtomicNoteRow[]>();
		const year = String(new Date().getFullYear());
		const typeField = s.typeField;
		const prefixes = parseFolderPrefixList(s.atomicNoteFolderPrefixes);
		const linkField = s.projectLinkField;
		const taskNoteRoots = parseFolderPathList(s.taskNotesFolderPaths);
		const entryKey = s.atomicNoteEntryField;
		const meetingStartKey = s.meetingStartTimeField?.trim();
		const projectPaths = new Set(this.snapshot.projects.map((p) => p.file.path));

		if (prefixes.length === 0) {
			this.rollupAtomicNotesByProject = map;
			this.rollupAtomicNotesIndexAt = this.snapshot.rebuiltAt;
			return map;
		}

		for (const f of this.app.vault.getMarkdownFiles()) {
			if (projectPaths.has(f.path)) continue;
			if (
				taskNoteRoots.length > 0 &&
				fileMatchesFolderScope(f.path, taskNoteRoots)
			) {
				continue;
			}
			if (!isUnderAtomicPrefixes(f.path, prefixes, year)) continue;

			const cache = this.app.metadataCache.getFileCache(f);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			const projectFile = resolveProjectFileFromFm(this.app, fm, f.path, linkField);
			if (!projectFile || !projectPaths.has(projectFile.path)) continue;

			const dateRaw =
				fmString(fm, "date") ??
				fmString(fm, "startTime") ??
				fmString(fm, "startDate");
			const fmStartTime =
				fmString(fm, "startTime")?.trim() ||
				(meetingStartKey ? fmString(fm, meetingStartKey)?.trim() : undefined);
			const startTime =
				fmStartTime ||
				(dateRaw && dateRaw.length > 10 ? dateRaw : undefined) ||
				undefined;
			const anchorDateMs = parseFrontmatterDateToMs(dateRaw) ?? undefined;
			const dateSort = dateRaw
				? dateRaw.slice(0, 10)
				: new Date(f.stat.mtime).toISOString().slice(0, 10);
			let body = "";
			try {
				body = await this.app.vault.cachedRead(f);
			} catch {
				body = "";
			}
			const fmEntry = fmString(fm, entryKey) ?? fmString(fm, "entry");
			const entryTitle = resolveEntryTitle({
				body,
				fmEntry,
				basename: f.basename,
				entryFieldKey: entryKey,
			});
			const noteType = resolveNoteType(body, fmString(fm, typeField));
			const bodyPreview = buildNoteBodyPreview(body, entryTitle, entryKey);
			const endTimeRaw =
				fmString(fm, "endTime")?.trim() ||
				(s.meetingEndTimeField?.trim()
					? fmString(fm, s.meetingEndTimeField)?.trim()
					: undefined);
			const row: AtomicNoteRow = {
				file: f,
				status: fmString(fm, s.taskStatusField) ?? fmString(fm, "status"),
				dateSort,
				startTime: startTime || undefined,
				dateDisplay: formatShortMonthDay(dateSort) || dateSort,
				trackedMinutes: readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField),
				entryTitle,
				noteType,
				bodyPreview,
				tags: parseTagsFromFm(fm),
				priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
				anchorDateMs,
				modifiedMs: f.stat.mtime,
				endTime: endTimeRaw || undefined,
			};
			const rows = map.get(projectFile.path) ?? [];
			rows.push(row);
			map.set(projectFile.path, rows);
		}

		for (const rows of map.values()) {
			rows.sort((a, b) => {
				const c = b.dateSort.localeCompare(a.dateSort);
				if (c !== 0) return c;
				return b.file.basename.localeCompare(a.file.basename);
			});
		}

		this.rollupAtomicNotesByProject = map;
		this.rollupAtomicNotesIndexAt = this.snapshot.rebuiltAt;
		return map;
	}

	private async buildProjectRollup(
		projectPath: string,
		s: FulcrumSettings,
	): Promise<ProjectRollup | null> {
		const project = this.resolveProjectByPath(projectPath);
		if (!project) return null;

		const done = parseDoneStatusSet(s.taskDoneStatuses);
		const projectTasks = this.snapshot.tasks.filter(
			(t) => t.projectFile?.path === projectPath,
		);
		const projectNoteTasks = projectTasks.filter(
			(t) => t.source === "inline" && t.file.path === projectPath,
		);
		// Exclude inline tasks on the project note from rollup lists (shown as task cards on Overview).
		const rollupTasks = projectTasks.filter(
			(t) => !(t.source === "inline" && t.file.path === projectPath),
		);
		const meetings = this.snapshot.meetings.filter(
			(m) => m.projectFile?.path === projectPath,
		);

		const atomicNotesByProject = await this.buildAtomicNotesByProject(s);
		const atomicRows = [...(atomicNotesByProject.get(projectPath) ?? [])];

		let doneTasks = 0;
		let overdueTasks = 0;
		for (const t of projectTasks) {
			const isDone = isDoneStatus(t.status, done);
			if (isDone) doneTasks++;
			if (isOverdue(t.dueDate, isDone)) overdueTasks++;
		}
		const totalTasks = projectTasks.length;
		const openTasks = totalTasks - doneTasks;
		const completionRatio =
			totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

		const openTaskList = rollupTasks.filter((t) => !isDoneStatus(t.status, done));
		const priorityRank: Record<string, number> = {high: 3, medium: 2, low: 1};
		const nextTasks = [...openTaskList].sort((a, b) => {
			const ad = a.dueDate ?? "\uffff";
			const bd = b.dueDate ?? "\uffff";
			if (ad !== bd) return ad.localeCompare(bd);
			const ap = priorityRank[a.priority ?? ""] ?? 0;
			const bp = priorityRank[b.priority ?? ""] ?? 0;
			return bp - ap;
		});

		const pageMeta = readProjectPageMeta(this.app, project.file, s);
		const projectFm = this.app.metadataCache.getFileCache(project.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const projectSelfMinutes = readTrackedMinutesFromFm(
			projectFm,
			s.taskTrackedMinutesField,
		);

		let taskTracked = 0;
		for (const t of rollupTasks) {
			const tfm = this.app.metadataCache.getFileCache(t.file)?.frontmatter as
				| Record<string, unknown>
				| undefined;
			taskTracked += readTrackedMinutesFromFm(tfm, s.taskTrackedMinutesField);
		}

		let atomicSum = 0;
		const atomicPaths = new Set<string>();
		for (const r of atomicRows) {
			atomicSum += r.trackedMinutes;
			atomicPaths.add(r.file.path);
		}

		let meetingOnlyMinutes = 0;
		for (const m of meetings) {
			const meetingMinutes = meetingEffectiveMinutes(m);

			if (atomicPaths.has(m.file.path)) {
				// Atomic row already summed readTrackedMinutesFromFm when keys align.
				if (!meetingHasPositiveTrackedMinutes(m)) meetingOnlyMinutes += meetingMinutes;
			} else {
				meetingOnlyMinutes += meetingMinutes;
			}
		}

		const plannerTrackedMinutes = plannerTrackedMinutesForProject(
			this.snapshot.plannerEvents,
			projectPath,
		);

		const aggregatedTrackedMinutes =
			projectSelfMinutes +
			taskTracked +
			atomicSum +
			meetingOnlyMinutes +
			plannerTrackedMinutes;

		const hasProjectColor = Boolean(project.color?.trim());
		const bannerImageSrc = resolveBannerImageSrc(
			this.app,
			project.file,
			project.banner,
		);
		const accentColorCss = resolveProjectAccentCss(
			hasProjectColor ? project.color : undefined,
		);
		const relatedPeople = await collectRelatedPeople(
			this.app,
			projectPath,
			project.file,
			projectTasks,
			meetings,
			atomicRows,
			s,
		);
		const relatedProjects = collectRelatedProjectsFromFrontmatter(
			this.app,
			projectPath,
			project.file,
			(p) => this.resolveProjectByPath(p),
			s,
		);
		const relatedProducts = collectRelatedProductsFromFrontmatter(
			this.app,
			projectPath,
			project.file,
			s,
		);

		return {
			project,
			tasks: rollupTasks,
			projectNoteTasks,
			meetings,
			atomicNotes: atomicRows,
			totalTasks,
			doneTasks,
			openTasks,
			overdueTasks,
			completionRatio,
			nextTasks,
			aggregatedTrackedMinutes,
			plannerTrackedMinutes,
			pageMeta,
			bannerImageSrc,
			accentColorCss,
			hasBannerImage: bannerImageSrc != null,
			hasProjectColor,
			relatedPeople,
			relatedProjects,
			relatedProducts,
		};
	}

	/** Active projects: not done by status or completed-folder placement. */
	getActiveProjects(s: FulcrumSettings): IndexedProject[] {
		return this.snapshot.projects.filter((p) => !isProjectDone(p, s));
	}

	projectsForArea(areaFile: TFile): IndexedProject[] {
		return this.snapshot.projects.filter((p) =>
			p.areaFiles.some((a) => a.path === areaFile.path),
		);
	}
}

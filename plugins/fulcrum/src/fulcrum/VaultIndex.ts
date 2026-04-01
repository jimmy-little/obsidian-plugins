import type {App, TFile} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {parseList} from "./settingsDefaults";
import {readProjectPageMeta} from "./projectNote";
import type {
	AtomicNoteRow,
	IndexedArea,
	IndexedMeeting,
	IndexedProject,
	IndexedTask,
	IndexSnapshot,
	ProjectRollup,
} from "./types";
import {isUnderFolder, projectStatusFromSubfolderLayout} from "./utils/paths";
import {formatShortMonthDay, isOverdue} from "./utils/dates";
import {parseAreaLinkPaths, parseWikiLink} from "./utils/wikilinks";
import {parseFolderPrefixList, isUnderAtomicPrefixes} from "./utils/atomicFolders";
import {
	fileLinksToProject,
	firstLinkedProjectFileInLine,
	resolveProjectFileFromFm,
} from "./utils/projectLink";
import {readTrackedMinutesFromFm} from "./utils/trackedMinutes";
import {meetingEffectiveMinutes, meetingHasPositiveTrackedMinutes} from "./utils/meetingEffectiveMinutes";
import {resolveBannerImageSrc, resolveProjectAccentCss} from "./utils/projectVisual";
import {bumpIndexRevision} from "./stores";
import {fileMatchesFolderScope, parseFolderPathList} from "./utils/folderScopes";
import {
	parseCheckboxLineTitle,
	parseObsidianTasksEmojiDates,
} from "./utils/inlineTasks";
import {
	buildNoteBodyPreview,
	parseTagsFromFm,
	resolveEntryTitle,
	resolveNoteType,
} from "./utils/notePreview";
import {collectRelatedPeople} from "./projectPeople";

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

export class VaultIndex {
	private app: App;
	private getSettings: () => FulcrumSettings;
	private snapshot: IndexSnapshot = {
		areas: [],
		projects: [],
		tasks: [],
		meetings: [],
		rebuiltAt: 0,
	};
	private debounceHandle: number | null = null;
	private maxWaitHandle: number | null = null;

	static readonly REBUILD_DEBOUNCE_MS = 120;
	static readonly REBUILD_MAX_WAIT_MS = 750;

	constructor(app: App, getSettings: () => FulcrumSettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	getSnapshot(): IndexSnapshot {
		return this.snapshot;
	}

	scheduleRebuild(): void {
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
	}

	async rebuild(): Promise<void> {
		this.cancelScheduledRebuild();
		const s = this.getSettings();
		const areas: IndexedArea[] = [];
		const projects: IndexedProject[] = [];
		const tasks: IndexedTask[] = [];
		const meetings: IndexedMeeting[] = [];

		const typeField = s.typeField;
		const apRoot = s.areasProjectsFolder;
		const statusKey = s.projectStatusField.trim().replace(/:+$/u, "") || "status";

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			const path = file.path;

			const inAP = isUnderFolder(path, apRoot);
			const inMeetings = isUnderFolder(path, s.meetingsFolder);

			const tVal = fmString(fm, typeField)?.toLowerCase();
			const areaTypeLc = s.areaTypeValue.toLowerCase();
			const projectTypeLc = s.projectTypeValue.toLowerCase();

			if (inAP && fm && tVal === areaTypeLc) {
				const wr = fmBooleanLoose(fm, ["work-related", "workRelated"]);
				areas.push({
					file,
					name: fmString(fm, "name") ?? file.basename,
					status: fmString(fm, "status"),
					color: fmString(fm, "color"),
					icon: fmString(fm, "icon"),
					description: fmString(fm, "description"),
					workRelated: wr === true ? true : wr === false ? false : undefined,
				});
				continue;
			}

			const isExplicitProject = tVal === projectTypeLc;
			const isInferredProject =
				s.inferProjectsInAreasFolder && tVal !== areaTypeLc;
			if (inAP && fm && (isExplicitProject || isInferredProject)) {
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
						? projectStatusFromSubfolderLayout(path, apRoot)
						: (fmString(fm, statusKey) ?? "active").toLowerCase();
				const launchRaw = fmString(fm, s.projectLaunchDateField)?.trim();
				const launchDate =
					launchRaw && launchRaw.length >= 10 ? launchRaw.slice(0, 10) : launchRaw || undefined;
				const rankKey = s.projectRankField.trim() || "rank";
				projects.push({
					file,
					name: fmString(fm, "name") ?? file.basename,
					status: statusRaw,
					priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
					startDate: fmString(fm, "startDate"),
					dueDate: fmString(fm, s.taskDueDateField),
					completedDate: fmString(fm, "completedDate"),
					areaFile,
					areaName: areaFile?.basename.replace(/\.md$/i, ""),
					areaFiles: areaFilesResolved,
					banner: fmString(fm, s.projectBannerField),
					color: fmString(fm, s.projectColorField),
					description: fmString(fm, "description"),
					nextReview: fmString(fm, s.projectNextReviewField),
					launchDate,
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
		const inlineRoots = parseFolderPathList(s.obsidianTasksFolderPaths);
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

		if (useTaskNotes) {
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (!fileMatchesFolderScope(file.path, taskNoteRoots)) continue;
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
				const status = (fmString(fm, s.taskStatusField) ?? openStatus).toLowerCase();
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
					projectFile,
					areaFile,
					tags: parseTagsFromFm(fm),
					createdAtMs: createdAtMsForFile(file, fm),
					source: "taskNote",
					trackedMinutes: readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField),
				});
			}
		}

		if (useInline) {
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (!fileMatchesFolderScope(file.path, inlineRoots)) continue;
				const cache = this.app.metadataCache.getFileCache(file);
				const listItems = cache?.listItems;
				if (!listItems?.length) continue;

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
					if (inlineRegex && !inlineRegex.test(titleEmoji)) continue;
					let proj = firstLinkedProjectFileInLine(
						this.app,
						rawLine,
						file.path,
						projectPaths,
					);
					if (!proj && projectPaths.has(file.path)) {
						proj = file;
					}
					if (!proj) continue;
					const isChecked = item.task === "x" || item.task === "X";
					const startKey = s.taskStartTimeField?.trim() || "startTime";
					const endKey = s.taskEndTimeField?.trim() || "endTime";
					const durKey = s.taskDurationField?.trim() || "duration";
					const startTimeRaw = fmString(fm, startKey)?.trim();
					const endTimeRaw = fmString(fm, endKey)?.trim();
					const durN = fmNumber(fm, durKey);
					tasks.push({
						file,
						title: titleEmoji,
						status: isChecked ? doneStatus : openStatus,
						dueDate: dueEm,
						scheduledDate: schedEm,
						completedDate: undefined,
						startTime: startTimeRaw || undefined,
						endTime: endTimeRaw || undefined,
						durationMinutes:
							durN != null && Number.isFinite(durN) && durN > 0 ? Math.round(durN) : undefined,
						projectFile: proj,
						areaFile,
						tags: [],
						createdAtMs: file.stat.ctime,
						source: "inline",
						line: lineNo,
						trackedMinutes: readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField),
					});
				}
			}
		}

		this.snapshot = {
			areas,
			projects,
			tasks,
			meetings,
			rebuiltAt: Date.now(),
		};
		bumpIndexRevision();
	}

	resolveProjectByPath(path: string): IndexedProject | undefined {
		return this.snapshot.projects.find((p) => p.file.path === path);
	}

	async getProjectRollup(
		projectPath: string,
		s: FulcrumSettings,
	): Promise<ProjectRollup | null> {
		const project = this.resolveProjectByPath(projectPath);
		if (!project) return null;

		const done = new Set(parseList(s.taskDoneStatuses));
		const projectTasks = this.snapshot.tasks.filter(
			(t) => t.projectFile?.path === projectPath,
		);
		const meetings = this.snapshot.meetings.filter(
			(m) => m.projectFile?.path === projectPath,
		);

		const year = String(new Date().getFullYear());
		const typeField = s.typeField;
		const prefixes = parseFolderPrefixList(s.atomicNoteFolderPrefixes);
		const linkField = s.projectLinkField;
		const taskNoteRoots = parseFolderPathList(s.taskNotesFolderPaths);
		const entryKey = s.atomicNoteEntryField;
		const atomicRows: AtomicNoteRow[] = [];

		for (const f of this.app.vault.getMarkdownFiles()) {
			if (f.path === projectPath) continue;
			if (!fileLinksToProject(this.app, f, projectPath, linkField)) continue;
			if (
				taskNoteRoots.length > 0 &&
				fileMatchesFolderScope(f.path, taskNoteRoots)
			) {
				continue;
			}
			if (prefixes.length > 0 && !isUnderAtomicPrefixes(f.path, prefixes, year)) {
				continue;
			}
			if (prefixes.length === 0) continue;

			const cache = this.app.metadataCache.getFileCache(f);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			const dateRaw = fmString(fm, "date") ?? fmString(fm, "startTime");
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
			const endTimeRaw = fmString(fm, "endTime")?.trim();
			atomicRows.push({
				file: f,
				status: fmString(fm, s.taskStatusField) ?? fmString(fm, "status"),
				dateSort,
				dateDisplay: formatShortMonthDay(dateSort) || dateSort,
				trackedMinutes: readTrackedMinutesFromFm(fm, s.taskTrackedMinutesField),
				entryTitle,
				noteType,
				bodyPreview,
				tags: parseTagsFromFm(fm),
				priority: fmString(fm, s.taskPriorityField)?.toLowerCase(),
				modifiedMs: f.stat.mtime,
				endTime: endTimeRaw || undefined,
			});
		}

		atomicRows.sort((a, b) => {
			const c = b.dateSort.localeCompare(a.dateSort);
			if (c !== 0) return c;
			return b.file.basename.localeCompare(a.file.basename);
		});

		let doneTasks = 0;
		let overdueTasks = 0;
		for (const t of projectTasks) {
			const isDone = done.has(t.status);
			if (isDone) doneTasks++;
			if (isOverdue(t.dueDate, isDone)) overdueTasks++;
		}
		const totalTasks = projectTasks.length;
		const openTasks = totalTasks - doneTasks;
		const completionRatio =
			totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

		const openTaskList = projectTasks.filter((t) => !done.has(t.status));
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
		for (const t of projectTasks) {
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

		const aggregatedTrackedMinutes =
			projectSelfMinutes + taskTracked + atomicSum + meetingOnlyMinutes;

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

		return {
			project,
			tasks: projectTasks,
			meetings,
			atomicNotes: atomicRows,
			totalTasks,
			doneTasks,
			openTasks,
			overdueTasks,
			completionRatio,
			nextTasks,
			aggregatedTrackedMinutes,
			pageMeta,
			bannerImageSrc,
			accentColorCss,
			hasBannerImage: bannerImageSrc != null,
			hasProjectColor,
			relatedPeople,
		};
	}

	/** Active projects: not in done status set. */
	getActiveProjects(s: FulcrumSettings): IndexedProject[] {
		const done = new Set(parseList(s.projectDoneStatuses));
		return this.snapshot.projects.filter((p) => !done.has(p.status));
	}

	projectsForArea(areaFile: TFile): IndexedProject[] {
		return this.snapshot.projects.filter((p) =>
			p.areaFiles.some((a) => a.path === areaFile.path),
		);
	}
}

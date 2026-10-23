import {Notice, Platform, TFile} from "obsidian";
import type FulcrumPlugin from "../main";
import {createTaskNoteFile} from "../fulcrum/createTaskNote";
import {updateTaskNoteField} from "../fulcrum/kanban/taskFieldUpdate";
import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {setInlineTaskChecked} from "../fulcrum/utils/inlineTasks";
import {reminderSyncHash} from "./hash";
import {
	isLegacyNumericReminderId,
	readInlineReminderId,
	readProjectListIdFresh,
	readStoredReminderHash,
	readTaskReminderId,
	reminderFingerprint,
	vaultTaskFingerprint,
	vaultTaskReminderHash,
	withInlineReminderId,
	writeTaskReminderSyncMeta,
} from "./mapping";
import {HttpRemindersBridge, type RemindersBridge} from "./remindersBridge";
import type {FulcrumReminder} from "./types";

export interface RemindersSyncSummary {
	connectedProjects: number;
	eligible: number;
	pushed: number;
	pulled: number;
	createdVault: number;
	taskNotesOnLinked: number;
	skippedRecurring: number;
	/** Vault tasks whose linked reminder no longer exists; left alone, never re-created. */
	orphaned: number;
}

/** Creating more than this many notes + reminders in one pass means something is looping. */
const MAX_CREATES_PER_PASS = 25;

class SyncCreateLimitError extends Error {}

export class RemindersSyncService {
	private client: RemindersBridge | null = null;
	private timer: number | null = null;
	private revisionTimer: number | null = null;
	private inflight: Promise<RemindersSyncSummary> | null = null;
	private lastNoticeAt = 0;
	private lastRevision = 0;
	/** Vault project path → Reminders list id. Survives metadata-cache lag after Link. */
	private readonly linkedByPath = new Map<string, string>();
	/**
	 * `path:line` → reminder id written by this session. Read before frontmatter, which lags
	 * behind writes (metadata cache + index); trusting the lagging copy made sync re-create
	 * reminders and notes in a loop.
	 */
	private readonly remIdByTaskKey = new Map<string, string>();
	private createsThisPass = 0;

	constructor(private readonly plugin: FulcrumPlugin) {}

	rememberLinkedList(projectPath: string, listId: string): void {
		const path = projectPath.trim();
		const id = listId.trim();
		if (path && id) this.linkedByPath.set(path, id);
	}

	forgetLinkedList(projectPath: string): void {
		this.linkedByPath.delete(projectPath);
	}

	isProjectLinked(projectPath: string): boolean {
		return this.linkedByPath.has(projectPath);
	}

	static canRun(settings: {conduitEnabled: boolean}): boolean {
		return settings.conduitEnabled && Platform.isMacOS;
	}

	async start(): Promise<void> {
		this.stop();
		if (!RemindersSyncService.canRun(this.plugin.settings)) return;
		this.client = HttpRemindersBridge.fromSettings(this.plugin.settings);
		const seconds = Math.max(0, Math.floor(this.plugin.settings.remindersPollSeconds));
		if (seconds > 0) {
			this.timer = window.setInterval(() => {
				void this.tick();
			}, seconds * 1000);
		}
		this.revisionTimer = window.setInterval(() => {
			void this.tickIfRevisionChanged();
		}, 5000);
		void this.tick();
	}

	stop(): void {
		if (this.timer != null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		if (this.revisionTimer != null) {
			window.clearInterval(this.revisionTimer);
			this.revisionTimer = null;
		}
		this.client = null;
		this.inflight = null;
	}

	invalidate(): void {
		this.client = HttpRemindersBridge.fromSettings(this.plugin.settings);
	}

	async runDoctor(): Promise<void> {
		if (!Platform.isMacOS) {
			new Notice("Reminders sync requires macOS.");
			return;
		}
		try {
			const client = HttpRemindersBridge.fromSettings(this.plugin.settings);
			const health = await client.health();
			if (!health.ok) {
				new Notice(`Reminders bridge failed — ${health.detail ?? "check permissions"}.`);
				return;
			}
			const lists = await client.lists();
			new Notice(`Reminders bridge: OK (${lists.length} list${lists.length === 1 ? "" : "s"}).`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Reminders bridge not available: ${msg}`);
		}
	}

	async tick(opts?: {
		force?: boolean;
		notify?: boolean;
		projectPath?: string;
		listId?: string;
	}): Promise<RemindersSyncSummary | null> {
		if (!RemindersSyncService.canRun(this.plugin.settings)) return null;
		if (opts?.projectPath && opts?.listId) {
			this.rememberLinkedList(opts.projectPath, opts.listId);
		}
		if (this.inflight) {
			if (!opts?.force) {
				try {
					return await this.inflight;
				} catch {
					return null;
				}
			}
			try {
				await this.inflight;
			} catch {
				/* run a fresh pass */
			}
		}
		const run = this.syncOnce();
		this.inflight = run;
		try {
			const summary = await run;
			if (opts?.notify) {
				new Notice(
					`Reminders sync: ${summary.connectedProjects} lists, ${summary.eligible} eligible, ${summary.pushed} pushed, ${summary.pulled} pulled, ${summary.createdVault} created.`,
				);
			}
			return summary;
		} catch (e) {
			if (e instanceof SyncCreateLimitError) {
				this.stop();
				this.plugin.settings.conduitEnabled = false;
				await this.plugin.saveSettings();
				new Notice(e.message, 0);
				console.error("Reminders sync", e);
				return null;
			}
			const now = Date.now();
			if (now - this.lastNoticeAt > 120_000) {
				this.lastNoticeAt = now;
				const msg = e instanceof Error ? e.message : String(e);
				new Notice(msg.length < 140 ? msg : "Reminders sync failed. Is Fulcrum Bridge running?");
			}
			console.warn("Reminders sync", e);
			return null;
		} finally {
			if (this.inflight === run) this.inflight = null;
		}
	}

	private async tickIfRevisionChanged(): Promise<void> {
		if (!this.client) return;
		try {
			const rev = await this.client.revision();
			if (rev !== this.lastRevision) {
				this.lastRevision = rev;
				void this.tick();
			}
		} catch {
			/* ignore revision probe failures; the poll timer still runs */
		}
	}

	private async syncOnce(): Promise<RemindersSyncSummary> {
		const settings = this.plugin.settings;
		const client = this.client ?? HttpRemindersBridge.fromSettings(settings);
		this.client = client;
		const snap = this.plugin.vaultIndex.getSnapshot();
		this.createsThisPass = 0;

		const connected = new Map<string, IndexedProject>();
		const connectedByPath = new Map<string, {project: IndexedProject; listId: string}>();
		for (const project of snap.projects) {
			const overlay = this.linkedByPath.get(project.file.path);
			const id = overlay ?? (await readProjectListIdFresh(this.plugin.app, project, settings));
			if (!id) continue;
			this.linkedByPath.set(project.file.path, id);
			connected.set(id, project);
			connectedByPath.set(project.file.path, {project, listId: id});
		}

		const remTasks: FulcrumReminder[] = [];
		const linkedIds = [...connected.keys()];
		if (linkedIds.length > 0) {
			try {
				remTasks.push(...(await client.fetchReminders({listIds: linkedIds})));
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.warn("Reminders sync: batched list fetch failed", msg);
				for (const listId of linkedIds) {
					try {
						remTasks.push(...(await client.fetchReminders({listIds: [listId]})));
					} catch (err) {
						console.warn("Reminders sync", err instanceof Error ? err.message : String(err));
					}
				}
			}
		}
		if (settings.remindersSyncInbox) {
			try {
				remTasks.push(...(await client.fetchReminders({inbox: true})));
			} catch (e) {
				console.warn("Reminders sync: inbox fetch failed", e);
			}
		}
		try {
			this.lastRevision = await client.revision();
		} catch {
			/* keep previous */
		}
		const remById = new Map(remTasks.map((t) => [t.id, t]));

		const summary: RemindersSyncSummary = {
			connectedProjects: connected.size,
			eligible: 0,
			pushed: 0,
			pulled: 0,
			createdVault: 0,
			taskNotesOnLinked: 0,
			skippedRecurring: 0,
			orphaned: 0,
		};
		if (snap.rebuiltAt === 0) return summary;

		const vaultTasks = snap.tasks.filter((t) => t.source === "taskNote" || t.source === "inline");
		const doneSet = parseDoneStatusSet(settings.taskDoneStatuses);
		for (const task of vaultTasks) {
			if (task.source !== "taskNote" || !task.projectFile) continue;
			if (!connectedByPath.has(task.projectFile.path)) continue;
			if (isDoneStatus(task.status, doneSet)) continue;
			summary.taskNotesOnLinked += 1;
		}
		const vaultRemIds = new Set<string>(this.remIdByTaskKey.values());
		for (const task of vaultTasks) {
			const id = await this.readVaultReminderId(task);
			if (id) vaultRemIds.add(id);
		}

		let mutated = false;

		const seen = new Set<string>();
		const consider = async (task: IndexedTask, listId: string | null) => {
			const key = taskKey(task);
			if (seen.has(key)) return;
			seen.add(key);
			if (task.recurrence?.trim()) {
				summary.skippedRecurring += 1;
				return;
			}
			const remId = await this.readVaultReminderId(task);
			if (!listId && !remId) return;
			const fp = vaultTaskFingerprint(this.plugin.app, task, settings, listId);
			if (!remId && fp.completed) return;
			summary.eligible += 1;
			const result = await this.reconcileVaultTask(client, task, listId, remById);
			if (result === "pushed") {
				summary.pushed += 1;
				mutated = true;
			} else if (result === "pulled") {
				summary.pulled += 1;
				mutated = true;
			} else if (result === "orphaned") {
				summary.orphaned += 1;
			}
		};

		for (const {project, listId} of connectedByPath.values()) {
			const projectTasks = vaultTasks.filter((t) => t.projectFile?.path === project.file.path);
			for (const task of projectTasks) {
				await consider(task, listId);
			}
		}
		for (const task of vaultTasks) {
			const remId = await this.readVaultReminderId(task);
			if (!remId) continue;
			const linked = task.projectFile ? connectedByPath.get(task.projectFile.path) : undefined;
			await consider(task, linked?.listId ?? null);
		}

		console.info("Reminders sync", {
			connectedProjects: [...connectedByPath.keys()],
			taskNotesOnLinked: summary.taskNotesOnLinked,
			eligible: summary.eligible,
			pushed: summary.pushed,
			skippedRecurring: summary.skippedRecurring,
			orphaned: summary.orphaned,
		});

		const inboxListId = settings.remindersSyncInbox
			? (await client.lists()).find((l) => l.isDefault)?.id ?? null
			: null;

		for (const rem of remTasks) {
			if (rem.completed) continue;
			if (rem.recurring) {
				summary.skippedRecurring += 1;
				continue;
			}
			if (vaultRemIds.has(rem.id)) continue;
			const project = rem.listId ? connected.get(rem.listId) : null;
			const inboxOk = settings.remindersSyncInbox && !!inboxListId && rem.listId === inboxListId && !project;
			if (!project && !inboxOk) continue;
			this.claimCreate();
			const created = await this.createVaultFromReminder(rem, project ?? null);
			if (created) vaultRemIds.add(rem.id);
			summary.createdVault += 1;
			mutated = true;
		}

		if (mutated) {
			await this.plugin.vaultIndex.rebuild();
		}
		return summary;
	}

	/** Throws once a pass exceeds its create budget; `tick` turns sync off. */
	private claimCreate(): void {
		this.createsThisPass += 1;
		if (this.createsThisPass > MAX_CREATES_PER_PASS) {
			throw new SyncCreateLimitError(
				`Reminders sync turned off: one pass tried to create more than ${MAX_CREATES_PER_PASS} notes/reminders. Check for duplicates before turning it back on.`,
			);
		}
	}

	private async readVaultReminderId(task: IndexedTask): Promise<string | null> {
		const known = this.remIdByTaskKey.get(taskKey(task));
		if (known) return known;
		if (task.source === "taskNote") {
			return readTaskReminderId(this.plugin.app, task, this.plugin.settings);
		}
		if (task.line == null) return null;
		const lines = (await this.plugin.app.vault.cachedRead(task.file)).split("\n");
		const id = readInlineReminderId(lines[task.line] ?? "");
		if (!id || isLegacyNumericReminderId(id)) return null;
		return id;
	}

	private async reconcileVaultTask(
		client: RemindersBridge,
		task: IndexedTask,
		listId: string | null,
		remById: Map<string, FulcrumReminder>,
	): Promise<"pushed" | "pulled" | "orphaned" | "none"> {
		const settings = this.plugin.settings;
		const remId = await this.readVaultReminderId(task);
		const vaultFp = vaultTaskFingerprint(this.plugin.app, task, settings, listId);
		const vaultHash = reminderSyncHash(vaultFp);
		const stored =
			task.source === "taskNote" ? readStoredReminderHash(this.plugin.app, task.file, settings) : null;

		if (!remId) {
			this.claimCreate();
			const id = await client.create({
				title: vaultFp.title,
				due: vaultFp.due,
				listId: listId ?? undefined,
			});
			await this.rememberVaultReminderId(task, id, vaultHash);
			return "pushed";
		}

		let rem = remById.get(remId) ?? null;
		if (!rem) {
			try {
				rem = await client.get(remId);
			} catch {
				rem = null;
			}
		}
		if (rem && listId && rem.listId !== listId) {
			await this.pushVault(client, remId, vaultFp);
			rem = {...rem, listId, title: vaultFp.title, dueDate: vaultFp.due, completed: vaultFp.completed};
			remById.set(remId, rem);
			if (task.source === "taskNote") {
				await writeTaskReminderSyncMeta(this.plugin.app, task.file, settings, {
					id: remId,
					hash: vaultHash,
				});
			}
			return "pushed";
		}
		if (!rem) {
			// Deleted in Reminders (or not visible to the bridge). Re-creating it here fed the
			// duplicate loop, so leave the note alone.
			console.warn("Reminders sync: linked reminder not found", task.file.path, remId);
			return "orphaned";
		}

		const remFp = reminderFingerprint(rem);
		const remHash = reminderSyncHash(remFp);
		if (stored && vaultHash === stored && remHash === stored) return "none";
		if (task.source === "inline") {
			if (vaultHash === remHash) return "none";
			const vaultMtime = task.file.stat.mtime;
			const remMtime = rem.lastModified ? Date.parse(rem.lastModified) : 0;
			if (vaultMtime >= remMtime) {
				await this.pushVault(client, remId, vaultFp);
				return "pushed";
			}
			await this.pullInline(task, rem);
			return "pulled";
		}
		if (vaultHash !== stored && remHash === stored) {
			await this.pushVault(client, remId, vaultFp);
			await writeTaskReminderSyncMeta(this.plugin.app, task.file, settings, {
				id: remId,
				hash: vaultHash,
			});
			return "pushed";
		}
		if (vaultHash === stored && remHash !== stored) {
			await this.pullReminder(task, rem, listId);
			return "pulled";
		}

		const vaultMtime = task.file.stat.mtime;
		const remMtime = rem.lastModified ? Date.parse(rem.lastModified) : 0;
		if (vaultMtime >= remMtime) {
			await this.pushVault(client, remId, vaultFp);
			await writeTaskReminderSyncMeta(this.plugin.app, task.file, settings, {
				id: remId,
				hash: vaultHash,
			});
			return "pushed";
		}
		await this.pullReminder(task, rem, listId);
		return "pulled";
	}

	private async rememberVaultReminderId(task: IndexedTask, id: string, hash: string): Promise<void> {
		this.remIdByTaskKey.set(taskKey(task), id);
		if (task.source === "taskNote") {
			await writeTaskReminderSyncMeta(this.plugin.app, task.file, this.plugin.settings, {id, hash});
			return;
		}
		await this.patchInlineLine(task, (line) => withInlineReminderId(line, id));
	}

	private async patchInlineLine(
		task: IndexedTask,
		transform: (line: string) => string | null,
	): Promise<void> {
		if (task.line == null) return;
		const raw = await this.plugin.app.vault.read(task.file);
		const lines = raw.split("\n");
		const cur = lines[task.line];
		if (cur === undefined) return;
		const next = transform(cur);
		if (next == null || next === cur) return;
		lines[task.line] = next;
		await this.plugin.app.vault.modify(task.file, lines.join("\n"));
	}

	private async pushVault(
		client: RemindersBridge,
		id: string,
		fp: ReturnType<typeof vaultTaskFingerprint>,
	): Promise<void> {
		await client.update(id, {
			title: fp.title,
			due: fp.due,
			completed: fp.completed,
			listId: fp.listId ?? undefined,
		});
	}

	private async pullInline(task: IndexedTask, rem: FulcrumReminder): Promise<void> {
		await this.patchInlineLine(task, (line) => {
			const next = setInlineTaskChecked(line, rem.completed);
			return next ? withInlineReminderId(next, rem.id) : withInlineReminderId(line, rem.id);
		});
	}

	private async pullReminder(
		task: IndexedTask,
		rem: FulcrumReminder,
		fallbackListId: string | null,
	): Promise<void> {
		const settings = this.plugin.settings;
		const done = parseDoneStatusSet(settings.taskDoneStatuses);
		const currentlyDone = isDoneStatus(task.status, done);
		const patch: Record<string, unknown> = {
			[settings.taskTitleField]: rem.title,
			[settings.taskDueDateField]: rem.dueDate ?? null,
		};
		if (rem.completed && !currentlyDone) {
			patch[settings.taskStatusField] = settings.taskNoteYamlStatusDone;
			patch[settings.taskCompletedDateField] = new Date().toISOString().slice(0, 10);
		} else if (!rem.completed && currentlyDone) {
			patch[settings.taskStatusField] = settings.taskNoteYamlStatusOpen;
			patch[settings.taskCompletedDateField] = null;
		}
		await updateTaskNoteField(this.plugin.app, task, settings, patch);
		const listId = rem.listId ?? fallbackListId;
		const hash = vaultTaskReminderHash(
			this.plugin.app,
			{
				...task,
				title: rem.title,
				dueDate: rem.dueDate ?? undefined,
				status: rem.completed
					? settings.taskNoteYamlStatusDone
					: settings.taskNoteYamlStatusOpen,
			},
			settings,
			listId,
		);
		await writeTaskReminderSyncMeta(this.plugin.app, task.file, settings, {id: rem.id, hash});
	}

	private async createVaultFromReminder(
		rem: FulcrumReminder,
		project: IndexedProject | null,
	): Promise<TFile | null> {
		const settings = this.plugin.settings;
		let projectLinks: string[] | undefined;
		if (project) {
			const lt =
				this.plugin.app.metadataCache.fileToLinktext(project.file, project.file.path, false) ??
				project.file.basename.replace(/\.md$/i, "");
			projectLinks = [`[[${lt}]]`];
		}
		const file = await createTaskNoteFile(this.plugin.app, settings, {
			title: rem.title,
			status: settings.taskNoteYamlStatusOpen,
			dueDate: rem.dueDate ?? null,
			projectLinks,
			bodyContent: rem.notes.trim() || undefined,
		});
		if (!file) return null;
		this.remIdByTaskKey.set(`${file.path}:`, rem.id);
		const hash = reminderSyncHash(reminderFingerprint(rem));
		await writeTaskReminderSyncMeta(this.plugin.app, file, settings, {id: rem.id, hash});
		return file;
	}
}

function taskKey(task: IndexedTask): string {
	return `${task.file.path}:${task.line ?? ""}`;
}

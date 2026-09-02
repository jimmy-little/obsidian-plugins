import {Notice, Platform, TFile} from "obsidian";
import type FulcrumPlugin from "../main";
import {createTaskNoteFile} from "../fulcrum/createTaskNote";
import {updateTaskNoteField} from "../fulcrum/kanban/taskFieldUpdate";
import {isDoneStatus, parseDoneStatusSet} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {setInlineTaskChecked} from "../fulcrum/utils/inlineTasks";
import {OmniFocusClient} from "./client";
import {syncHash} from "./hash";
import {
	ofTaskFingerprint,
	readInlineOmniId,
	readProjectOmniIdFresh,
	readStoredHash,
	readTaskOmniId,
	vaultTaskFingerprint,
	vaultTaskHash,
	withInlineOmniId,
	writeProjectOmniId,
	writeTaskSyncMeta,
} from "./mapping";
import type {OmniFocusTask} from "./types";

export interface OmniFocusSyncSummary {
	connectedProjects: number;
	eligible: number;
	pushed: number;
	pulled: number;
	createdVault: number;
	taskNotesOnLinked: number;
	skippedRecurring: number;
}

export class OmniFocusSyncService {
	private client: OmniFocusClient | null = null;
	private timer: number | null = null;
	private inflight: Promise<OmniFocusSyncSummary> | null = null;
	private lastNoticeAt = 0;
	/** Vault project path → OmniFocus project id. Survives metadata-cache lag after Link. */
	private readonly linkedByPath = new Map<string, string>();

	constructor(private readonly plugin: FulcrumPlugin) {}

	rememberLinkedProject(projectPath: string, omniId: string): void {
		const path = projectPath.trim();
		const id = omniId.trim();
		if (path && id) this.linkedByPath.set(path, id);
	}

	forgetLinkedProject(projectPath: string): void {
		this.linkedByPath.delete(projectPath);
	}

	isProjectLinked(projectPath: string): boolean {
		return this.linkedByPath.has(projectPath);
	}

	static canRun(settings: {omnifocusEnabled: boolean}): boolean {
		return settings.omnifocusEnabled && Platform.isMacOS;
	}

	async start(): Promise<void> {
		this.stop();
		if (!OmniFocusSyncService.canRun(this.plugin.settings)) return;
		this.client = OmniFocusClient.fromSettings(this.plugin.settings);
		const seconds = Math.max(0, Math.floor(this.plugin.settings.omnifocusPollSeconds));
		if (seconds > 0) {
			this.timer = window.setInterval(() => {
				void this.tick();
			}, seconds * 1000);
		}
		void this.tick();
	}

	stop(): void {
		if (this.timer != null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		this.client = null;
		this.inflight = null;
	}

	invalidate(): void {
		this.client = OmniFocusClient.fromSettings(this.plugin.settings);
	}

	async runDoctor(): Promise<void> {
		if (!Platform.isMacOS) {
			new Notice("OmniFocus sync requires macOS.");
			return;
		}
		try {
			const client = OmniFocusClient.fromSettings(this.plugin.settings);
			const health = await client.health();
			if (!health.installed) {
				new Notice("OmniFocus is not installed.");
				return;
			}
			if (!health.running) {
				new Notice("Open OmniFocus, then try again.");
				return;
			}
			const projects = await client.projects();
			new Notice(`OmniFocus bridge: OK (${projects.length} project${projects.length === 1 ? "" : "s"}).`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`OmniFocus bridge not available: ${msg}`);
		}
	}

	async tick(opts?: {
		force?: boolean;
		notify?: boolean;
		projectPath?: string;
		projectOmniId?: string;
	}): Promise<OmniFocusSyncSummary | null> {
		if (!OmniFocusSyncService.canRun(this.plugin.settings)) return null;
		if (opts?.projectPath && opts?.projectOmniId) {
			this.rememberLinkedProject(opts.projectPath, opts.projectOmniId);
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
			if (opts?.notify) this.noticeSummary(summary);
			return summary;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (opts?.notify) new Notice(`OmniFocus sync: ${msg.slice(0, 160)}`);
			else this.noticeThrottled(msg);
			return null;
		} finally {
			if (this.inflight === run) this.inflight = null;
		}
	}

	private noticeSummary(summary: OmniFocusSyncSummary): void {
		if (summary.connectedProjects === 0) {
			new Notice("OmniFocus sync: no linked projects. Use Link OmniFocus project on a project first.");
			return;
		}
		if (summary.eligible === 0 && summary.pushed === 0 && summary.pulled === 0 && summary.createdVault === 0) {
			const rec =
				summary.skippedRecurring > 0 ? ` (${summary.skippedRecurring} recurring skipped)` : "";
			new Notice(
				`OmniFocus sync: ${summary.connectedProjects} linked project(s), ${summary.taskNotesOnLinked} task note(s) on them, nothing to send${rec}.`,
			);
			return;
		}
		new Notice(
			`OmniFocus sync: pushed ${summary.pushed}, pulled ${summary.pulled}, new vault notes ${summary.createdVault} (${summary.eligible} eligible, ${summary.taskNotesOnLinked} task notes).`,
		);
	}

	private noticeThrottled(message: string): void {
		const now = Date.now();
		if (now - this.lastNoticeAt < 120_000) {
			console.warn("OmniFocus sync", message);
			return;
		}
		this.lastNoticeAt = now;
		new Notice(`OmniFocus sync: ${message.slice(0, 160)}`);
	}

	private async syncOnce(): Promise<OmniFocusSyncSummary> {
		const client = this.client ?? OmniFocusClient.fromSettings(this.plugin.settings);
		this.client = client;
		const health = await client.health();
		if (!health.installed) {
			throw new Error("OmniFocus is not installed.");
		}
		if (!health.running) {
			throw new Error("Open OmniFocus, then sync again.");
		}

		const settings = this.plugin.settings;
		const snap = this.plugin.vaultIndex.getSnapshot();
		const connected = new Map<string, IndexedProject>();
		const connectedByPath = new Map<string, {project: IndexedProject; omniId: string}>();
		for (const project of snap.projects) {
			const overlay = this.linkedByPath.get(project.file.path);
			const id = overlay ?? (await readProjectOmniIdFresh(this.plugin.app, project, settings));
			if (!id) continue;
			this.linkedByPath.set(project.file.path, id);
			connected.set(id, project);
			connectedByPath.set(project.file.path, {project, omniId: id});
		}

		const ofTasks: OmniFocusTask[] = [];
		const linkedIds = [...connected.keys()];
		if (linkedIds.length > 0) {
			try {
				ofTasks.push(...(await client.tasks({projectIds: linkedIds})));
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.warn("OmniFocus sync: batched project task fetch failed", msg);
				// Fall back per-project so one bad id does not wipe the whole sync.
				for (const omniId of linkedIds) {
					try {
						ofTasks.push(...(await client.tasks({projectId: omniId})));
					} catch (err) {
						console.warn("OmniFocus sync", err instanceof Error ? err.message : String(err));
					}
				}
			}
		}
		if (settings.omnifocusSyncInbox) {
			try {
				ofTasks.push(...(await client.tasks({inbox: true, completed: "false"})));
			} catch (e) {
				console.warn("OmniFocus sync: inbox fetch failed", e);
			}
		}
		const ofById = new Map(ofTasks.map((t) => [t.id, t]));

		const summary: OmniFocusSyncSummary = {
			connectedProjects: connected.size,
			eligible: 0,
			pushed: 0,
			pulled: 0,
			createdVault: 0,
			taskNotesOnLinked: 0,
			skippedRecurring: 0,
		};

		const vaultTasks = snap.tasks.filter((t) => t.source === "taskNote" || t.source === "inline");
		const doneSet = parseDoneStatusSet(settings.taskDoneStatuses);
		for (const task of vaultTasks) {
			if (task.source !== "taskNote" || !task.projectFile) continue;
			if (!connectedByPath.has(task.projectFile.path)) continue;
			if (isDoneStatus(task.status, doneSet)) continue;
			summary.taskNotesOnLinked += 1;
		}
		const vaultByOfId = new Map<string, IndexedTask>();
		for (const task of vaultTasks) {
			const id = await this.readVaultOmniId(task);
			if (id) vaultByOfId.set(id, task);
		}

		let mutated = false;

		const seen = new Set<string>();
		const consider = async (task: IndexedTask, projectOmniId: string | null) => {
			const key = `${task.file.path}:${task.line ?? ""}`;
			if (seen.has(key)) return;
			seen.add(key);
			if (task.recurrence?.trim()) {
				summary.skippedRecurring += 1;
				return;
			}
			const ofId = await this.readVaultOmniId(task);
			if (!projectOmniId && !ofId) return;
			const fp = vaultTaskFingerprint(this.plugin.app, task, settings, projectOmniId);
			if (!ofId && fp.completed) return;
			summary.eligible += 1;
			const result = await this.reconcileVaultTask(client, task, projectOmniId, ofById);
			if (result === "pushed") {
				summary.pushed += 1;
				mutated = true;
			} else if (result === "pulled") {
				summary.pulled += 1;
				mutated = true;
			}
		};

		for (const {project, omniId} of connectedByPath.values()) {
			const projectTasks = vaultTasks.filter((t) => t.projectFile?.path === project.file.path);
			for (const task of projectTasks) {
				await consider(task, omniId);
			}
		}
		for (const task of vaultTasks) {
			const ofId = await this.readVaultOmniId(task);
			if (!ofId) continue;
			const linked = task.projectFile ? connectedByPath.get(task.projectFile.path) : undefined;
			await consider(task, linked?.omniId ?? null);
		}

		console.info("OmniFocus sync", {
			connectedProjects: [...connectedByPath.keys()],
			taskNotesOnLinked: summary.taskNotesOnLinked,
			eligible: summary.eligible,
			pushed: summary.pushed,
			skippedRecurring: summary.skippedRecurring,
		});

		for (const ofTask of ofTasks) {
			if (ofTask.dropped || ofTask.completed) continue;
			if (vaultByOfId.has(ofTask.id)) continue;
			const project = ofTask.projectId ? connected.get(ofTask.projectId) : null;
			const inboxOk = settings.omnifocusSyncInbox && ofTask.inInbox && !ofTask.projectId;
			if (!project && !inboxOk) continue;
			await this.createVaultFromOf(ofTask, project ?? null);
			summary.createdVault += 1;
			mutated = true;
		}

		if (mutated) {
			try {
				await client.synchronize();
			} catch (e) {
				console.warn("OmniFocus document.synchronize failed", e);
			}
			await this.plugin.vaultIndex.rebuild();
		}
		return summary;
	}

	private async readVaultOmniId(task: IndexedTask): Promise<string | null> {
		if (task.source === "taskNote") {
			return readTaskOmniId(this.plugin.app, task, this.plugin.settings);
		}
		if (task.line == null) return null;
		const lines = (await this.plugin.app.vault.cachedRead(task.file)).split("\n");
		return readInlineOmniId(lines[task.line] ?? "");
	}

	private async reconcileVaultTask(
		client: OmniFocusClient,
		task: IndexedTask,
		projectOmniId: string | null,
		ofById: Map<string, OmniFocusTask>,
	): Promise<"pushed" | "pulled" | "none"> {
		const settings = this.plugin.settings;
		const ofId = await this.readVaultOmniId(task);
		const vaultFp = vaultTaskFingerprint(this.plugin.app, task, settings, projectOmniId);
		const vaultHash = syncHash(vaultFp);
		const stored =
			task.source === "taskNote" ? readStoredHash(this.plugin.app, task.file, settings) : null;

		if (!ofId) {
			const id = await client.createTask({
				name: vaultFp.title,
				due: vaultFp.due,
				defer: vaultFp.defer,
				projectId: projectOmniId,
			});
			await this.rememberVaultOmniId(task, id, vaultHash);
			return "pushed";
		}

		const ofTask = ofById.get(ofId);
		if (!ofTask) {
			if (task.source === "taskNote") {
				await writeTaskSyncMeta(this.plugin.app, task.file, settings, {id: ofId, hash: vaultHash});
			}
			return "none";
		}

		const ofFp = ofTaskFingerprint(ofTask);
		const ofHash = syncHash(ofFp);
		if (stored && vaultHash === stored && ofHash === stored) return "none";
		if (task.source === "inline") {
			if (vaultHash === ofHash) return "none";
			const vaultMtime = task.file.stat.mtime;
			const ofMtime = ofTask.modified ? Date.parse(ofTask.modified) : 0;
			if (vaultMtime >= ofMtime) {
				await this.pushVault(client, ofId, vaultFp);
				return "pushed";
			}
			await this.pullInline(task, ofTask);
			return "pulled";
		}
		if (vaultHash !== stored && ofHash === stored) {
			await this.pushVault(client, ofId, vaultFp);
			await writeTaskSyncMeta(this.plugin.app, task.file, settings, {id: ofId, hash: vaultHash});
			return "pushed";
		}
		if (vaultHash === stored && ofHash !== stored) {
			await this.pullOf(task, ofTask, projectOmniId);
			return "pulled";
		}

		const vaultMtime = task.file.stat.mtime;
		const ofMtime = ofTask.modified ? Date.parse(ofTask.modified) : 0;
		if (vaultMtime >= ofMtime) {
			await this.pushVault(client, ofId, vaultFp);
			await writeTaskSyncMeta(this.plugin.app, task.file, settings, {id: ofId, hash: vaultHash});
			return "pushed";
		}
		await this.pullOf(task, ofTask, projectOmniId);
		return "pulled";
	}

	private async rememberVaultOmniId(task: IndexedTask, id: string, hash: string): Promise<void> {
		if (task.source === "taskNote") {
			await writeTaskSyncMeta(this.plugin.app, task.file, this.plugin.settings, {id, hash});
			return;
		}
		await this.patchInlineLine(task, (line) => withInlineOmniId(line, id));
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
		client: OmniFocusClient,
		id: string,
		fp: ReturnType<typeof vaultTaskFingerprint>,
	): Promise<void> {
		await client.updateTask(id, {
			name: fp.title,
			due: fp.due,
			defer: fp.defer,
			completed: fp.completed,
			projectId: fp.projectId,
		});
	}

	private async pullInline(task: IndexedTask, ofTask: OmniFocusTask): Promise<void> {
		await this.patchInlineLine(task, (line) => {
			const next = setInlineTaskChecked(line, ofTask.completed);
			return next ? withInlineOmniId(next, ofTask.id) : withInlineOmniId(line, ofTask.id);
		});
	}

	private async pullOf(
		task: IndexedTask,
		ofTask: OmniFocusTask,
		fallbackProjectId: string | null,
	): Promise<void> {
		const settings = this.plugin.settings;
		const done = parseDoneStatusSet(settings.taskDoneStatuses);
		const currentlyDone = isDoneStatus(task.status, done);
		const patch: Record<string, unknown> = {
			[settings.taskTitleField]: ofTask.name,
			[settings.taskDueDateField]: ofTask.due ?? null,
			[settings.taskScheduledDateField]: ofTask.defer ?? null,
		};
		if (ofTask.completed && !currentlyDone) {
			patch[settings.taskStatusField] = settings.taskNoteYamlStatusDone;
			patch[settings.taskCompletedDateField] = new Date().toISOString().slice(0, 10);
		} else if (!ofTask.completed && currentlyDone) {
			patch[settings.taskStatusField] = settings.taskNoteYamlStatusOpen;
			patch[settings.taskCompletedDateField] = null;
		}
		await updateTaskNoteField(this.plugin.app, task, settings, patch);
		const projectOmniId = ofTask.projectId ?? fallbackProjectId;
		const hash = vaultTaskHash(
			this.plugin.app,
			{
				...task,
				title: ofTask.name,
				dueDate: ofTask.due ?? undefined,
				scheduledDate: ofTask.defer ?? undefined,
				status: ofTask.completed
					? settings.taskNoteYamlStatusDone
					: settings.taskNoteYamlStatusOpen,
			},
			settings,
			projectOmniId,
		);
		await writeTaskSyncMeta(this.plugin.app, task.file, settings, {id: ofTask.id, hash});
	}

	private async createVaultFromOf(
		ofTask: OmniFocusTask,
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
			title: ofTask.name,
			status: settings.taskNoteYamlStatusOpen,
			dueDate: ofTask.due ?? null,
			scheduledDate: ofTask.defer ?? null,
			projectLinks,
		});
		if (!file) return null;
		const hash = syncHash(ofTaskFingerprint(ofTask));
		await writeTaskSyncMeta(this.plugin.app, file, settings, {id: ofTask.id, hash});
		return file;
	}
}

export async function clearProjectOmniFocusLink(
	plugin: FulcrumPlugin,
	projectPath: string,
): Promise<void> {
	const project = plugin.vaultIndex.resolveProjectByPath(projectPath);
	if (!project) throw new Error("Project not found.");
	plugin.omnifocus?.forgetLinkedProject(projectPath);
	await writeProjectOmniId(plugin.app, project, plugin.settings, null);
	await plugin.vaultIndex.rebuild();
	new Notice(`Cleared OmniFocus project for "${project.name}".`);
}

import type {App} from "obsidian";
import type FulcrumPlugin from "../main";
import type {ConduitSyncForce, ConduitSyncResult} from "./types";
import {loadConduitSyncState, saveConduitSyncState} from "./syncState";
import {RemctlClient} from "./remctlClient";
import {vaultFingerprint, remindersFingerprint} from "./fingerprints";
import {
	archiveProjectListIfEmpty,
	ensureInboxList,
	ensureProjectLists,
	indexLists,
} from "./projectListSync";
import {conduitSyncTasks} from "./conduitTasks";
import {importUnlinkedProjectReminders} from "./importProjectListReminders";
import {pullTasksFromReminders, pushTasksToReminders} from "./taskSync";
import {filterProjectsForConduitSync, resolveProjectReminderConnection} from "./mappingRegistry";
import {readProjectListId} from "./mapping";
import {isProjectDone} from "../fulcrum/settingsDefaults";
import {
	forceToActiveAction,
	phaseToActiveAction,
	reportConduitProgress,
} from "./syncProgress";

export class SyncCoordinator {
	private running = false;
	private lastVaultActivity = 0;
	private readonly startedAt = Date.now();
	private retryTimer: number | undefined;
	private intervalTimer: number | undefined;
	private deferReason: string | null = null;

	constructor(private readonly plugin: FulcrumPlugin) {}

	markVaultActivity(): void {
		this.lastVaultActivity = Date.now();
	}

	getDeferReason(): string | null {
		return this.deferReason;
	}

	startInterval(): void {
		this.stopInterval();
		const sec = this.plugin.settings.conduitSyncIntervalSeconds;
		if (sec <= 0) return;
		const periodMs = sec * 1000;
		this.intervalTimer = window.setInterval(() => {
			void this.requestSync("interval", {force: "both"});
		}, periodMs);
	}

	stopInterval(): void {
		if (this.intervalTimer != null) {
			window.clearInterval(this.intervalTimer);
			this.intervalTimer = undefined;
		}
		if (this.retryTimer != null) {
			window.clearTimeout(this.retryTimer);
			this.retryTimer = undefined;
		}
	}

	async requestSync(
		reason: string,
		opts?: {force?: ConduitSyncForce; skipQuiet?: boolean; projectPath?: string},
	): Promise<ConduitSyncResult> {
		if (this.running) {
			return {ok: false, deferred: true, deferReason: "sync already running"};
		}

		const force = opts?.force ?? "both";
		const skipQuiet = opts?.skipQuiet === true || force === "pull";
		const activeAction = forceToActiveAction(force);

		if (!skipQuiet && force !== "push") {
			const quiet = this.plugin.settings.conduitVaultQuietSeconds;
			const elapsed = Date.now() - this.lastVaultActivity;
			if (quiet > 0 && elapsed < quiet * 1000) {
				const remain = Math.ceil((quiet * 1000 - elapsed) / 1000);
				this.deferReason = `vault settling (${remain}s)`;
				this.scheduleRetry(remain * 1000 + 500);
				return {ok: false, deferred: true, deferReason: this.deferReason};
			}
		}

		this.running = true;
		this.deferReason = null;

		try {
			reportConduitProgress(
				{
					active: true,
					phase: "waiting",
					label: "Preparing…",
					force,
					activeAction,
				},
				{force: true},
			);

			const remctl = new RemctlClient(this.plugin.settings.conduitRemctlPath);
			const snap = this.plugin.vaultIndex.getSnapshot();
			const projects = snap.projects;
			const projectPath = opts?.projectPath?.trim() || undefined;
			let lists = indexLists(await remctl.lists());
			let activeProjects = filterProjectsForConduitSync(
				this.plugin.app,
				this.plugin.settings,
				projects.filter((p) => !isProjectDone(p, this.plugin.settings)),
				lists,
			);
			if (projectPath) {
				activeProjects = activeProjects.filter((p) => p.file.path === projectPath);
				if (activeProjects.length === 0) {
					return {
						ok: false,
						message: projectPath
							? "Conduit: this project is not connected or sync is disabled."
							: "Conduit: no projects selected for sync.",
					};
				}
			}
			let tasks = conduitSyncTasks(snap.tasks, this.plugin.settings);
			if (projectPath) {
				tasks = tasks.filter((t) => t.projectFile?.path === projectPath);
			}

			const vaultFp = vaultFingerprint(projects, tasks, this.plugin.settings);
			const state = await loadConduitSyncState(() => this.plugin.loadData());

			if (!skipQuiet && force === "both") {
				reportConduitProgress({
					phase: "waiting",
					label: "Waiting for vault to settle…",
					activeAction,
					force,
				});
				const stable = await this.waitVaultFingerprintStable(vaultFp, projects, tasks);
				if (!stable) {
					this.deferReason = "vault still changing";
					this.scheduleRetry(3000);
					return {ok: false, deferred: true, deferReason: this.deferReason};
				}
			}

			reportConduitProgress({
				phase: "lists",
				label: projectPath ? "Syncing project list…" : "Syncing project lists…",
				activeAction,
				force,
			});
			lists = await ensureProjectLists(
				this.plugin.app,
				remctl,
				activeProjects,
				this.plugin.settings,
				lists,
			);
			lists = await ensureInboxList(remctl, this.plugin.settings, lists);

			const allRows: import("./types").RemctlReminderRow[] = [];
			const seenLists = new Set<string>();
			const listEntries =
				projectPath && activeProjects.length === 1
					? (() => {
							const p = activeProjects[0]!;
							const fromPass = lists.projectPathToListId.get(p.file.path);
							if (fromPass && lists.byId.has(fromPass)) return [lists.byId.get(fromPass)!];
							const id = readProjectListId(this.plugin.app, p, this.plugin.settings);
							if (id && lists.byId.has(id)) return [lists.byId.get(id)!];
							const conn = resolveProjectReminderConnection(
								this.plugin.app,
								p,
								this.plugin.settings,
								lists,
							);
							return conn && lists.byId.has(conn.listId) ? [lists.byId.get(conn.listId)!] : [];
						})()
					: activeProjects.flatMap((p) => {
							const conn = resolveProjectReminderConnection(
								this.plugin.app,
								p,
								this.plugin.settings,
								lists,
							);
							if (!conn || !lists.byId.has(conn.listId)) return [];
							return [lists.byId.get(conn.listId)!];
						});
			let listIndex = 0;
			for (const list of listEntries) {
				if (seenLists.has(list.id)) continue;
				seenLists.add(list.id);
				listIndex++;
				reportConduitProgress({
					phase: "fetching",
					label: "Reading Reminders lists…",
					current: listIndex,
					total: listEntries.length,
					activeAction,
					force,
				});
				try {
					const rows = await remctl.showList({listId: list.id});
					allRows.push(...rows);
				} catch (e) {
					console.warn("Conduit show list failed", list.name, e);
				}
			}

			const inbox = this.plugin.settings.conduitInboxListName.trim();
			if (inbox && !projectPath) {
				try {
					const inboxRows = await remctl.showList({listName: inbox});
					allRows.push(...inboxRows);
				} catch {
					// inbox may not exist yet
				}
			}

			const remFp = remindersFingerprint(allRows);
			let imported = 0;
			let pulled = 0;
			let pushed = 0;
			let pushFailed = 0;

			if (force === "pull" || force === "both") {
				if (projectPath && activeProjects.length === 1) {
					const project = activeProjects[0]!;
					const conn = resolveProjectReminderConnection(
						this.plugin.app,
						project,
						this.plugin.settings,
						lists,
					);
					if (conn) {
						const allTasksForLinkScan = conduitSyncTasks(
							this.plugin.vaultIndex.getSnapshot().tasks,
							this.plugin.settings,
						);
						imported = await importUnlinkedProjectReminders(
							this.plugin.app,
							remctl,
							this.plugin.settings,
							project,
							conn.listId,
							allTasksForLinkScan,
							allRows,
							state,
							(cur, tot) => {
								reportConduitProgress({
									phase: "importing",
									label: "Importing from Reminders…",
									current: cur,
									total: tot,
									activeAction: phaseToActiveAction("importing", activeAction),
									force,
								});
							},
						);
						if (imported > 0) {
							await this.plugin.vaultIndex.rebuild();
							const snapAfterImport = this.plugin.vaultIndex.getSnapshot();
							tasks = conduitSyncTasks(snapAfterImport.tasks, this.plugin.settings).filter(
								(t) => t.projectFile?.path === projectPath,
							);
						}
					}
				}

				pulled = await pullTasksFromReminders(
					this.plugin.app,
					remctl,
					tasks,
					projects,
					this.plugin.settings,
					lists,
					allRows,
					state,
					force === "pull",
					(cur, tot) => {
						reportConduitProgress({
							phase: "pulling",
							label: "Pulling from Reminders…",
							current: cur,
							total: tot,
							activeAction: phaseToActiveAction("pulling", activeAction),
							force,
						});
					},
				);
			}

			if (force === "push" || force === "both") {
				await this.plugin.vaultIndex.rebuild();
				const snap2 = this.plugin.vaultIndex.getSnapshot();
				let tasks2 = conduitSyncTasks(snap2.tasks, this.plugin.settings);
				if (projectPath) {
					tasks2 = tasks2.filter((t) => t.projectFile?.path === projectPath);
				}
				const pushResult = await pushTasksToReminders(
					this.plugin.app,
					remctl,
					tasks2,
					projectPath
						? snap2.projects.filter((p) => p.file.path === projectPath)
						: snap2.projects,
					this.plugin.settings,
					lists,
					state,
					force === "push",
					(cur, tot) => {
						reportConduitProgress({
							phase: "pushing",
							label: "Pushing to Reminders…",
							current: cur,
							total: tot,
							activeAction: phaseToActiveAction("pushing", activeAction),
							force,
						});
					},
				);
				pushed = pushResult.pushed;
				pushFailed = pushResult.failed;
				if (pushFailed > 0) {
					console.warn(`Conduit: ${pushFailed} task(s) failed to push`);
				}
			}

			reportConduitProgress({
				phase: "saving",
				label: "Saving sync state…",
				activeAction,
				force,
			});
			state.lastCompletedAt = new Date().toISOString();
			state.lastVaultFingerprint = vaultFp;
			state.lastRemindersFingerprint = remFp;
			await saveConduitSyncState(
				this.plugin.app,
				() => this.plugin.loadData(),
				(d) => this.plugin.saveData(d),
				state,
			);

			await this.plugin.vaultIndex.rebuild();

			const failNote = pushFailed > 0 ? `, ${pushFailed} failed` : "";
			const importNote = imported > 0 ? `, imported ${imported}` : "";
			const scopeNote = projectPath ? " (project)" : "";
			return {
				ok: true,
				message: `Conduit sync${scopeNote} (${reason}): ${tasks.length} task(s), pulled ${pulled}, pushed ${pushed}${importNote}${failNote}.`,
				pulled,
				pushed,
				imported,
			};
		} catch (e) {
			console.error("Conduit sync failed", e);
			const msg = e instanceof Error ? e.message : String(e);
			return {ok: false, message: msg};
		} finally {
			this.running = false;
		}
	}

	private async waitVaultFingerprintStable(
		initialFp: string,
		projects: import("../fulcrum/types").IndexedProject[],
		tasks: import("../fulcrum/types").IndexedTask[],
	): Promise<boolean> {
		await sleep(2000);
		const fp2 = vaultFingerprint(projects, tasks, this.plugin.settings);
		if (fp2 !== initialFp) return false;
		await this.plugin.vaultIndex.rebuild();
		const snap = this.plugin.vaultIndex.getSnapshot();
		const fp3 = vaultFingerprint(snap.projects, snap.tasks, this.plugin.settings);
		return fp3 === initialFp;
	}

	private scheduleRetry(ms: number): void {
		// Avoid remctl storms while Fulcrum is still indexing the vault on startup.
		if (Date.now() - this.startedAt < 90_000) return;
		if (this.retryTimer != null) window.clearTimeout(this.retryTimer);
		this.retryTimer = window.setTimeout(() => {
			void this.plugin.conduit?.runSync("retry", {force: "both", notify: false});
		}, ms);
	}

	async archiveCompletedProject(projectPath: string): Promise<void> {
		const remctl = new RemctlClient(this.plugin.settings.conduitRemctlPath);
		const snap = this.plugin.vaultIndex.getSnapshot();
		await archiveProjectListIfEmpty(
			this.plugin.app,
			remctl,
			projectPath,
			snap.projects,
			this.plugin.settings,
		);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

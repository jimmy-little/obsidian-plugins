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
import {pullTasksFromReminders, pushTasksToReminders} from "./taskSync";
import {parseList} from "../fulcrum/settingsDefaults";

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
		opts?: {force?: ConduitSyncForce; skipQuiet?: boolean},
	): Promise<ConduitSyncResult> {
		if (this.running) {
			return {ok: false, deferred: true, deferReason: "sync already running"};
		}

		const force = opts?.force ?? "both";
		const skipQuiet = opts?.skipQuiet === true || force === "pull";

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
			const remctl = new RemctlClient(this.plugin.settings.conduitRemctlPath);
			const snap = this.plugin.vaultIndex.getSnapshot();
			const projects = snap.projects;
			const doneSet = new Set(parseList(this.plugin.settings.projectDoneStatuses));
			const tasks = conduitSyncTasks(snap.tasks, this.plugin.settings);

			const vaultFp = vaultFingerprint(projects, tasks, this.plugin.settings);
			const state = await loadConduitSyncState(() => this.plugin.loadData());

			if (!skipQuiet && force === "both") {
				const stable = await this.waitVaultFingerprintStable(vaultFp, projects, tasks);
				if (!stable) {
					this.deferReason = "vault still changing";
					this.scheduleRetry(3000);
					return {ok: false, deferred: true, deferReason: this.deferReason};
				}
			}

			let lists = indexLists(await remctl.lists());
			lists = await ensureProjectLists(
				this.plugin.app,
				remctl,
				projects.filter((p) => !doneSet.has(p.status.toLowerCase())),
				this.plugin.settings,
				lists,
			);
			lists = await ensureInboxList(remctl, this.plugin.settings, lists);

			const allRows: import("./types").RemctlReminderRow[] = [];
			const seenLists = new Set<string>();
			for (const [, list] of lists.byId) {
				if (seenLists.has(list.id)) continue;
				seenLists.add(list.id);
				try {
					const rows = await remctl.showList({listId: list.id});
					allRows.push(...rows);
				} catch (e) {
					console.warn("Conduit show list failed", list.name, e);
				}
			}

			const inbox = this.plugin.settings.conduitInboxListName.trim();
			if (inbox) {
				try {
					const inboxRows = await remctl.showList({listName: inbox});
					allRows.push(...inboxRows);
				} catch {
					// inbox may not exist yet
				}
			}

			const remFp = remindersFingerprint(allRows);
			let pulled = 0;
			let pushed = 0;
			let pushFailed = 0;

			if (force === "pull" || force === "both") {
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
				);
			}

			if (force === "push" || force === "both") {
				await this.plugin.vaultIndex.rebuild();
				const snap2 = this.plugin.vaultIndex.getSnapshot();
				const tasks2 = conduitSyncTasks(snap2.tasks, this.plugin.settings);
				const pushResult = await pushTasksToReminders(
					this.plugin.app,
					remctl,
					tasks2,
					snap2.projects,
					this.plugin.settings,
					lists,
					state,
					force === "push",
				);
				pushed = pushResult.pushed;
				pushFailed = pushResult.failed;
				if (pushFailed > 0) {
					console.warn(`Conduit: ${pushFailed} task(s) failed to push`);
				}
			}

			state.lastCompletedAt = new Date().toISOString();
			state.lastVaultFingerprint = vaultFp;
			state.lastRemindersFingerprint = remFp;
			await saveConduitSyncState(
				() => this.plugin.loadData(),
				(d) => this.plugin.saveData(d),
				state,
			);

			await this.plugin.vaultIndex.rebuild();

			const failNote = pushFailed > 0 ? `, ${pushFailed} failed` : "";
			return {
				ok: true,
				message: `Conduit sync (${reason}): ${tasks.length} task(s), pulled ${pulled}, pushed ${pushed}${failNote}.`,
				pulled,
				pushed,
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
			void this.requestSync("retry", {force: "both"});
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

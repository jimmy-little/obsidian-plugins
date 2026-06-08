import {Notice, Platform, TFile} from "obsidian";
import type FulcrumPlugin from "../main";
import type {ConduitSyncForce, ConduitSyncResult} from "./types";
import {SyncCoordinator} from "./syncCoordinator";
import {RemctlClient} from "./remctlClient";
import {findRemctlBinary} from "./remctlPath";
import {ConduitSyncIndicator} from "./syncIndicator";

export class ConduitService {
	readonly coordinator: SyncCoordinator;
	private vaultHooked = false;
	private indicator: ConduitSyncIndicator | null = null;
	private intervalTimer: number | undefined;

	constructor(private readonly plugin: FulcrumPlugin) {
		this.coordinator = new SyncCoordinator(plugin);
		this.indicator = new ConduitSyncIndicator(plugin);
	}

	static canRun(settings: {conduitEnabled: boolean}): boolean {
		return settings.conduitEnabled && Platform.isMacOS;
	}

	async start(): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) return;
		this.ensureRemctlPathConfigured();
		this.hookVaultEvents();
		this.coordinator.stopInterval();
		this.startInterval();
	}

	/** Obsidian GUI apps often lack ~/.local/bin on PATH — persist a discovered full path once. */
	private ensureRemctlPathConfigured(): void {
		const current = this.plugin.settings.conduitRemctlPath.trim();
		if (current && current !== "remctl") return;
		const found = findRemctlBinary();
		if (!found) return;
		this.plugin.settings.conduitRemctlPath = found;
		void this.plugin.saveSettings();
	}

	stop(): void {
		this.stopInterval();
		this.coordinator.stopInterval();
		this.indicator?.dispose();
		this.indicator = null;
	}

	private startInterval(): void {
		this.stopInterval();
		const sec = this.plugin.settings.conduitSyncIntervalSeconds;
		if (sec <= 0) return;
		const periodMs = sec * 1000;
		this.intervalTimer = window.setInterval(() => {
			void this.executeSync("interval", {force: "both", notify: false});
		}, periodMs);
	}

	private stopInterval(): void {
		if (this.intervalTimer != null) {
			window.clearInterval(this.intervalTimer);
			this.intervalTimer = undefined;
		}
	}

	restartInterval(): void {
		this.coordinator.stopInterval();
		this.startInterval();
	}

	private hookVaultEvents(): void {
		if (this.vaultHooked) return;
		this.vaultHooked = true;
		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.coordinator.markVaultActivity();
				}
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on("create", () => this.coordinator.markVaultActivity()),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", () => this.coordinator.markVaultActivity()),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", () => this.coordinator.markVaultActivity()),
		);
	}

	async runDoctor(): Promise<void> {
		if (!Platform.isMacOS) {
			new Notice("Conduit requires macOS.");
			return;
		}
		try {
			const client = new RemctlClient(this.plugin.settings.conduitRemctlPath);
			const {ok} = await client.doctorForAgent();
			new Notice(
				ok
					? "remctl doctor: OK for this Obsidian process."
					: "remctl doctor failed — grant Reminders and Full Disk Access from Obsidian.",
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`remctl not available: ${msg}`);
		}
	}

	/** Runs a full sync with status bar / toolbar progress (used by retry timer too). */
	async runSync(
		reason: string,
		opts?: {force?: ConduitSyncForce; skipQuiet?: boolean; notify?: boolean},
	): Promise<ConduitSyncResult> {
		return this.executeSync(reason, opts);
	}

	private async executeSync(
		reason: string,
		opts?: {force?: ConduitSyncForce; skipQuiet?: boolean; notify?: boolean},
	): Promise<ConduitSyncResult> {
		const force = opts?.force ?? "both";
		let result: ConduitSyncResult = {ok: false, message: "Sync did not run"};
		try {
			result = await this.coordinator.requestSync(reason, {
				force,
				skipQuiet: opts?.skipQuiet,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			result = {ok: false, message: msg};
		} finally {
			const skipFinish =
				result.deferred && result.deferReason === "sync already running";
			if (!skipFinish) {
				this.indicator?.finish(result);
			}
		}

		const notify = opts?.notify !== false;
		if (notify) {
			if (result.deferred) {
				new Notice(`Conduit: sync deferred — ${result.deferReason ?? "waiting"}.`);
			} else if (result.ok) {
				new Notice(result.message ?? "Conduit sync complete.");
			} else {
				new Notice(result.message ?? "Conduit sync failed.");
			}
		}
		return result;
	}

	async syncNow(opts?: {force?: ConduitSyncForce; skipQuiet?: boolean}): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) {
			new Notice("Enable Conduit in Fulcrum settings (macOS only).");
			return;
		}
		await this.executeSync("manual", opts);
	}

	async onProjectCompleted(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) return;
		await this.coordinator.archiveCompletedProject(projectPath);
	}
}

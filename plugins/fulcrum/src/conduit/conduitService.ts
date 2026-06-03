import {Notice, Platform, TFile} from "obsidian";
import type FulcrumPlugin from "../main";
import type {ConduitSyncForce} from "./types";
import {SyncCoordinator} from "./syncCoordinator";
import {RemctlClient} from "./remctlClient";
import {findRemctlBinary} from "./remctlPath";

export class ConduitService {
	readonly coordinator: SyncCoordinator;
	private vaultHooked = false;

	constructor(private readonly plugin: FulcrumPlugin) {
		this.coordinator = new SyncCoordinator(plugin);
	}

	static canRun(settings: {conduitEnabled: boolean}): boolean {
		return settings.conduitEnabled && Platform.isMacOS;
	}

	async start(): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) return;
		this.ensureRemctlPathConfigured();
		this.hookVaultEvents();
		this.coordinator.startInterval();
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
		this.coordinator.stopInterval();
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

	async syncNow(opts?: {force?: ConduitSyncForce; skipQuiet?: boolean}): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) {
			new Notice("Enable Conduit in Fulcrum settings (macOS only).");
			return;
		}
		const result = await this.coordinator.requestSync("manual", {
			force: opts?.force ?? "both",
			skipQuiet: opts?.skipQuiet,
		});
		if (result.deferred) {
			new Notice(`Conduit: sync deferred — ${result.deferReason ?? "waiting"}.`);
			return;
		}
		if (result.ok) {
			new Notice(result.message ?? "Conduit sync complete.");
		} else {
			new Notice(result.message ?? "Conduit sync failed.");
		}
	}

	async onProjectCompleted(projectPath: string): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) return;
		await this.coordinator.archiveCompletedProject(projectPath);
	}
}

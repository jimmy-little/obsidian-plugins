import {Notice, Platform} from "obsidian";
import type FulcrumPlugin from "../main";
import type {RemctlListRow} from "./types";
import {findRemctlBinary} from "./remctlPath";
import {createRemindersBridge, type RemindersBridge} from "./remindersBridge";
import {readProjectListId} from "./mapping";
import {findProjectByPath} from "./mappingRegistry";

export class ConduitService {
	private cachedLists: RemctlListRow[] = [];
	private bridge: RemindersBridge | null = null;

	constructor(private readonly plugin: FulcrumPlugin) {}

	static canRun(settings: {conduitEnabled: boolean}): boolean {
		return settings.conduitEnabled && Platform.isMacOS;
	}

	async start(): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) return;
		this.ensureRemctlPathConfigured();
		void this.refreshRemindersListCache().catch(() => undefined);
	}

	async getBridge(): Promise<RemindersBridge> {
		const url = this.plugin.settings.remindersBridgeUrl.trim();
		if (this.bridge) {
			// Retry HTTP when a bridge URL is set but we previously fell back to remctl.
			if (!url || this.bridge.calendars) return this.bridge;
		}
		this.bridge = await createRemindersBridge(this.plugin.settings);
		return this.bridge;
	}

	invalidateBridge(): void {
		this.bridge = null;
	}

	async refreshRemindersListCache(): Promise<RemctlListRow[]> {
		const bridge = await this.getBridge();
		this.cachedLists = await bridge.lists();
		return this.cachedLists;
	}

	getCachedRemindersLists(): RemctlListRow[] {
		return this.cachedLists;
	}

	isProjectConnected(projectPath: string): boolean {
		const project = findProjectByPath(this.plugin.vaultIndex.getSnapshot().projects, projectPath);
		if (!project) return false;
		return !!readProjectListId(this.plugin.app, project, this.plugin.settings);
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
		this.invalidateBridge();
	}

	async runDoctor(): Promise<void> {
		if (!Platform.isMacOS) {
			new Notice("Reminders bridge requires macOS.");
			return;
		}
		try {
			this.invalidateBridge();
			const bridge = await this.getBridge();
			const health = await bridge.health();
			new Notice(
				health.ok
					? `Reminders bridge: OK (${health.detail ?? "connected"}).`
					: `Reminders bridge failed — ${health.detail ?? "check permissions"}.`,
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Reminders bridge not available: ${msg}`);
		}
	}

	async testBridgeConnection(): Promise<boolean> {
		try {
			this.invalidateBridge();
			const bridge = await this.getBridge();
			const health = await bridge.health();
			return health.ok;
		} catch {
			return false;
		}
	}
}

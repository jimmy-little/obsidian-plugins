import {Notice, Platform} from "obsidian";
import type FulcrumPlugin from "../main";
import type {ReminderListRow} from "./types";
import {createRemindersBridge, type RemindersBridge} from "./remindersBridge";
import {readProjectListId} from "./mapping";
import {findProjectByPath} from "./mappingRegistry";

export class ConduitService {
	private cachedLists: ReminderListRow[] = [];
	private bridge: RemindersBridge | null = null;

	constructor(private readonly plugin: FulcrumPlugin) {}

	static canRun(settings: {conduitEnabled: boolean}): boolean {
		return settings.conduitEnabled && Platform.isMacOS;
	}

	async start(): Promise<void> {
		if (!ConduitService.canRun(this.plugin.settings)) return;
		void this.refreshRemindersListCache().catch(() => undefined);
	}

	async getBridge(): Promise<RemindersBridge> {
		if (this.bridge) return this.bridge;
		this.bridge = await createRemindersBridge(this.plugin.settings);
		return this.bridge;
	}

	invalidateBridge(): void {
		this.bridge = null;
	}

	async refreshRemindersListCache(): Promise<ReminderListRow[]> {
		const bridge = await this.getBridge();
		this.cachedLists = await bridge.lists();
		return this.cachedLists;
	}

	getCachedRemindersLists(): ReminderListRow[] {
		return this.cachedLists;
	}

	isProjectConnected(projectPath: string): boolean {
		if (this.plugin.remindersSync?.isProjectLinked(projectPath)) return true;
		const project = findProjectByPath(this.plugin.vaultIndex.getSnapshot().projects, projectPath);
		if (!project) return false;
		return !!readProjectListId(this.plugin.app, project, this.plugin.settings);
	}

	stop(): void {
		this.invalidateBridge();
	}

	async runDoctor(): Promise<void> {
		if (!Platform.isMacOS) {
			new Notice("Reminders sync requires macOS.");
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

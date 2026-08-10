/**
 * TABLED: Native companion + WidgetKit bridge. Fulcrum now uses Obsidian pop-out
 * (`Open Floating Timers View` / FloatingTimersView) instead. Code kept for a future revisit.
 */
import {normalizePath, Notice, TFile, type EventRef} from "obsidian";
import type FulcrumPlugin from "../main";
import {
	DEFAULT_WIDGET_BRIDGE_PATH,
	WIDGET_BRIDGE_VERSION,
	emptyBridgeFile,
	type WidgetBridgeFile,
} from "./widgetBridgeTypes";
import {quickStartBridgeId, quickStartBridgeLabel} from "./widgetBridgeIds";
import {sameEntryTimestamp} from "../fulcrum/utils/timerEntries";

const PUBLISH_DEBOUNCE_MS = 600;
const RECONCILE_DEBOUNCE_MS = 400;
const INITIAL_SYNC_DELAY_MS = 1500;
/** Companion writes via Finder/API; Obsidian often misses vault modify events. */
const BRIDGE_POLL_MS = 2000;

export class WidgetBridge {
	private readonly plugin: FulcrumPlugin;
	private publishHandle: number | null = null;
	private reconcileHandle: number | null = null;
	private initialSyncHandle: number | null = null;
	private isWritingBridge = false;
	private loaded = false;
	private vaultEvents: EventRef[] = [];
	private lastBridgeMtime = 0;
	private reconcileInFlight = false;
	/** Serializes bridge writes so concurrent publish/reconcile cannot double-create. */
	private writeChain: Promise<void> = Promise.resolve();

	constructor(plugin: FulcrumPlugin) {
		this.plugin = plugin;
	}

	onload(): void {
		if (!this.plugin.settings.widgetBridgeEnabled || this.loaded) return;
		this.loaded = true;

		const bridgePath = this.getBridgePath();
		this.registerVaultWatch(bridgePath);

		this.initialSyncHandle = window.setTimeout(() => {
			this.initialSyncHandle = null;
			void this.reconcile().then(() => this.publish());
		}, INITIAL_SYNC_DELAY_MS);

		const pollId = window.setInterval(() => {
			void this.reconcileIfBridgeChanged();
		}, BRIDGE_POLL_MS);
		this.plugin.register(() => window.clearInterval(pollId));

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("window-open", () => {
				void this.reconcileIfBridgeChanged();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				void this.reconcileIfBridgeChanged();
			}),
		);
	}

	onunload(): void {
		if (!this.loaded) return;
		this.loaded = false;
		if (this.publishHandle != null) {
			window.clearTimeout(this.publishHandle);
			this.publishHandle = null;
		}
		if (this.reconcileHandle != null) {
			window.clearTimeout(this.reconcileHandle);
			this.reconcileHandle = null;
		}
		if (this.initialSyncHandle != null) {
			window.clearTimeout(this.initialSyncHandle);
			this.initialSyncHandle = null;
		}
		for (const ref of this.vaultEvents) {
			this.plugin.app.vault.offref(ref);
		}
		this.vaultEvents = [];
	}

	schedulePublish(): void {
		if (!this.plugin.settings.widgetBridgeEnabled) return;
		if (this.publishHandle != null) {
			window.clearTimeout(this.publishHandle);
		}
		this.publishHandle = window.setTimeout(() => {
			this.publishHandle = null;
			void this.publish().catch((err) => {
				console.error("Fulcrum widget bridge: publish failed", err);
			});
		}, PUBLISH_DEBOUNCE_MS);
	}

	scheduleReconcile(): void {
		if (!this.plugin.settings.widgetBridgeEnabled) return;
		if (this.isWritingBridge) return;
		if (this.reconcileHandle != null) {
			window.clearTimeout(this.reconcileHandle);
		}
		this.reconcileHandle = window.setTimeout(() => {
			this.reconcileHandle = null;
			void this.reconcile();
		}, RECONCILE_DEBOUNCE_MS);
	}

	async rebuild(): Promise<void> {
		await this.ensureDeviceId();
		await this.publish();
		new Notice("Widget bridge cache rebuilt.");
	}

	getBridgePath(): string {
		const configured = this.plugin.settings.widgetBridgePath.trim();
		return normalizePath(configured || DEFAULT_WIDGET_BRIDGE_PATH);
	}

	private registerVaultWatch(bridgePath: string): void {
		const onBridgeTouch = (path: string): void => {
			if (normalizePath(path) !== bridgePath) return;
			this.scheduleReconcile();
		};

		this.vaultEvents.push(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof TFile) onBridgeTouch(file.path);
			}),
		);
		this.vaultEvents.push(
			this.plugin.app.vault.on("create", (file) => {
				if (file instanceof TFile) onBridgeTouch(file.path);
			}),
		);
	}

	async readBridge(): Promise<WidgetBridgeFile> {
		const deviceId = await this.ensureDeviceId();
		const path = this.getBridgePath();
		let raw: string | null = null;
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			try {
				raw = await this.plugin.app.vault.read(file);
			} catch {
				raw = null;
			}
		}
		if (raw == null && (await this.plugin.app.vault.adapter.exists(path))) {
			try {
				raw = await this.plugin.app.vault.adapter.read(path);
			} catch {
				raw = null;
			}
		}
		if (raw == null) {
			return emptyBridgeFile(deviceId);
		}
		try {
			const parsed = JSON.parse(raw) as Partial<WidgetBridgeFile>;
			if (!parsed || typeof parsed !== "object") {
				return emptyBridgeFile(deviceId);
			}
			const base = emptyBridgeFile(deviceId);
			return {
				...base,
				...parsed,
				version: typeof parsed.version === "number" ? parsed.version : WIDGET_BRIDGE_VERSION,
				deviceId: typeof parsed.deviceId === "string" && parsed.deviceId ? parsed.deviceId : deviceId,
				activeTimers: Array.isArray(parsed.activeTimers) ? parsed.activeTimers : [],
				quickStartItems: Array.isArray(parsed.quickStartItems) ? parsed.quickStartItems : [],
				pendingCommands: Array.isArray(parsed.pendingCommands) ? parsed.pendingCommands : [],
				timerSettings: {...base.timerSettings, ...(parsed.timerSettings ?? {})},
			};
		} catch (err) {
			console.error("Fulcrum widget bridge: failed to parse bridge file", err);
			return emptyBridgeFile(deviceId);
		}
	}

	async writeBridge(data: WidgetBridgeFile): Promise<void> {
		const payload: WidgetBridgeFile = {
			...data,
			updatedAt: new Date().toISOString(),
		};
		const text = JSON.stringify(payload, null, 2) + "\n";
		const run = this.writeChain.then(() => this.writeBridgeText(text));
		this.writeChain = run.catch(() => undefined);
		await run;
	}

	private async writeBridgeText(text: string): Promise<void> {
		const path = this.getBridgePath();
		this.isWritingBridge = true;
		try {
			await this.ensureBridgeParentFolder(path);
			const file = this.plugin.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.plugin.app.vault.modify(file, text);
				return;
			}
			if (await this.plugin.app.vault.adapter.exists(path)) {
				await this.plugin.app.vault.adapter.write(path, text);
				return;
			}
			try {
				await this.plugin.app.vault.create(path, text);
			} catch (err) {
				if (!this.isFileAlreadyExistsError(err)) throw err;
				const retryFile = this.plugin.app.vault.getAbstractFileByPath(path);
				if (retryFile instanceof TFile) {
					await this.plugin.app.vault.modify(retryFile, text);
				} else {
					await this.plugin.app.vault.adapter.write(path, text);
				}
			}
		} finally {
			window.setTimeout(() => {
				this.isWritingBridge = false;
				void this.plugin.app.vault.adapter.stat(this.getBridgePath()).then((stat) => {
					if (stat?.mtime) this.lastBridgeMtime = stat.mtime;
				});
			}, 0);
		}
	}

	private async ensureBridgeParentFolder(path: string): Promise<void> {
		const parts = path.split("/");
		if (parts.length <= 1) return;
		const folder = parts.slice(0, -1).join("/");
		const existing = this.plugin.app.vault.getAbstractFileByPath(folder);
		if (existing) return;
		if (await this.plugin.app.vault.adapter.exists(folder)) return;
		await this.plugin.app.vault.createFolder(folder).catch(() => undefined);
	}

	private isFileAlreadyExistsError(err: unknown): boolean {
		const msg = err instanceof Error ? err.message : String(err);
		return /already exists/i.test(msg);
	}

	async publish(): Promise<void> {
		if (!this.plugin.settings.widgetBridgeEnabled) return;

		const deviceId = await this.ensureDeviceId();
		const bridge = await this.readBridge();
		const timer = this.plugin.settings.timer;

		const activeRaw = await this.plugin.timer.getActiveTimers();
		const activeTimers = activeRaw.map(({filePath, entry}) => ({
			notePath: filePath,
			label: entry.label,
			startMs: entry.startTime ?? 0,
			project: this.projectFromMetadataCache(filePath),
			entryId: entry.id,
		}));

		const quickStartPublic = await this.plugin.timer.getQuickStartItemsPublic();
		const quickStartItems = quickStartPublic.map((item) => ({
			id: quickStartBridgeId(item),
			label: quickStartBridgeLabel(item),
			kind: item.kind,
			templatePath: item.templatePath,
			templateName: item.templateName,
			project: item.project,
			projectSourcePath: item.projectSourcePath,
			area: item.area,
			timerDescription: item.timerDescription,
		}));

		const next: WidgetBridgeFile = {
			...bridge,
			version: WIDGET_BRIDGE_VERSION,
			deviceId,
			activeTimers,
			quickStartItems,
			timerSettings: {
				entriesKey: timer.entriesKey,
				legacyEntriesKeys: [...timer.legacyEntriesKeys],
				startTimeKey: timer.startTimeKey,
				endTimeKey: timer.endTimeKey,
				totalTimeKey: timer.totalTimeKey,
				projectKey: timer.projectKey,
				dateFormat: timer.dateFormat,
				showSeconds: timer.showSeconds,
				timerButtonTemplatesFolder: timer.timerButtonTemplatesFolder,
				excludedFolders: [...timer.excludedFolders],
			},
			pendingCommands: bridge.pendingCommands,
		};

		await this.writeBridge(next);
	}

	/** Sync read from metadata cache (no vault I/O); used during publish only. */
	private projectFromMetadataCache(notePath: string): string | null {
		const file = this.plugin.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) return null;
		const key = this.plugin.settings.timer.projectKey;
		const raw = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[key];
		if (typeof raw === "string" && raw.trim()) return raw.trim();
		return null;
	}

	async reconcileIfBridgeChanged(): Promise<void> {
		if (!this.plugin.settings.widgetBridgeEnabled) return;
		if (this.isWritingBridge) return;
		const path = this.getBridgePath();
		try {
			const stat = await this.plugin.app.vault.adapter.stat(path);
			if (!stat?.mtime) return;
			if (stat.mtime === this.lastBridgeMtime) return;
			this.lastBridgeMtime = stat.mtime;
			await this.reconcile();
		} catch {
			/* bridge file may not exist yet */
		}
	}

	async reconcile(): Promise<void> {
		if (!this.plugin.settings.widgetBridgeEnabled) return;
		if (this.isWritingBridge) return;
		if (this.reconcileInFlight) return;

		this.reconcileInFlight = true;
		try {
			const deviceId = await this.ensureDeviceId();
			const bridge = await this.readBridge();
			const pending = bridge.pendingCommands.filter((cmd) => !cmd.processedAt);
			if (!pending.length) {
				return;
			}

			const quickStartPublic = await this.plugin.timer.getQuickStartItemsPublic();
			const quickStartById = new Map(
				quickStartPublic.map((item) => [quickStartBridgeId(item), item]),
			);

			const toRun = this.collapsePendingCommands(pending);
			let applied = 0;
			for (const cmd of toRun) {
				try {
					await this.applyCommand(cmd, quickStartById);
					cmd.processedAt = new Date().toISOString();
					cmd.processedBy = deviceId;
					applied++;
				} catch (err) {
					console.error("Fulcrum widget bridge: command failed", cmd.id, err);
				}
			}
			const toRunIds = new Set(toRun.map((c) => c.id));
			for (const cmd of pending) {
				if (cmd.processedAt) continue;
				if (!toRunIds.has(cmd.id)) {
					cmd.processedAt = new Date().toISOString();
					cmd.processedBy = deviceId;
				}
			}

			if (applied > 0) {
				bridge.lastReconciledAt = new Date().toISOString();
				await this.writeBridge(bridge);
				await this.publish();
				new Notice(
					applied === 1
						? "Fulcrum: applied 1 widget command"
						: `Fulcrum: applied ${applied} widget commands`,
				);
			} else if (pending.length > 0) {
				await this.writeBridge(bridge);
			}
		} finally {
			this.reconcileInFlight = false;
		}
	}

	/** Skip duplicate unprocessed starts for the same quick-start button. */
	private collapsePendingCommands(
		pending: WidgetBridgeFile["pendingCommands"],
	): WidgetBridgeFile["pendingCommands"] {
		const seenStartQuickStart = new Set<string>();
		const out: WidgetBridgeFile["pendingCommands"] = [];
		for (let i = pending.length - 1; i >= 0; i--) {
			const cmd = pending[i]!;
			if (cmd.op === "start" && cmd.quickStartId) {
				if (seenStartQuickStart.has(cmd.quickStartId)) continue;
				seenStartQuickStart.add(cmd.quickStartId);
			}
			out.unshift(cmd);
		}
		return out;
	}

	private async applyCommand(
		cmd: WidgetBridgeFile["pendingCommands"][number],
		quickStartById: Map<string, import("./types").QuickStartItemPublic>,
	): Promise<void> {
		switch (cmd.op) {
			case "start": {
				if (cmd.quickStartId) {
					const item = quickStartById.get(cmd.quickStartId);
					if (!item) {
						throw new Error(`Unknown quickStartId: ${cmd.quickStartId}`);
					}
					await this.plugin.timer.executeQuickStartPublic(item);
					return;
				}
				if (cmd.notePath) {
					const notePath = this.assertNoteInVault(cmd.notePath);
					await this.plugin.timer.runStartTimerInNoteFromApi(notePath);
					return;
				}
				throw new Error("start command requires quickStartId or notePath");
			}
			case "stop": {
				if (cmd.notePath) {
					const notePath = this.assertNoteInVault(cmd.notePath);
					if (cmd.startMs != null) {
						const active = await this.plugin.timer.getActiveTimers();
						const match = active.find(
							(t) =>
								t.filePath === notePath &&
								sameEntryTimestamp(t.entry.startTime, cmd.startMs),
						);
						if (!match) return;
					}
					// Stop explicitly — never toggle, so a late/replayed stop command
					// cannot start a fresh timer on an already-stopped note.
					await this.plugin.timer.stopAllActiveEntriesInFile(notePath);
					this.plugin.timer.refreshActivityPanel();
					return;
				}
				throw new Error("stop command requires notePath");
			}
			case "stop_all": {
				const paths = (await this.plugin.timer.getActiveTimers()).map((t) => t.filePath);
				for (const filePath of paths) {
					await this.plugin.timer.stopAllActiveEntriesInFile(filePath);
				}
				this.plugin.timer.refreshActivityPanel();
				return;
			}
			default:
				throw new Error(`Unknown widget bridge op: ${cmd.op satisfies never}`);
		}
	}

	assertNoteInVault(notePath: string): string {
		const normalized = normalizePath(notePath.trim());
		if (!normalized || normalized.includes("..")) {
			throw new Error("Invalid note path");
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile) || file.extension !== "md") {
			throw new Error(`Note not found: ${normalized}`);
		}
		return normalized;
	}

	async ensureDeviceId(): Promise<string> {
		let id = this.plugin.settings.widgetBridgeDeviceId.trim();
		if (id) return id;
		id =
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `fulcrum-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		this.plugin.settings.widgetBridgeDeviceId = id;
		await this.plugin.saveSettings();
		return id;
	}
}

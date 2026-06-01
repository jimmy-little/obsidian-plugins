import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { DEFAULT_SETTINGS, QuillSettingTab, type QuillSettings } from "./settings";
import { migrateEntryTypesOpenIn } from "./settingsMigration";
import { QuillView } from "./views/QuillView";
import { QuillDayView } from "./views/QuillDayView";
import { VIEW_TYPE_QUILL, VIEW_TYPE_QUILL_DAY } from "./views/constants";
import { parseFolderList } from "./journal";

const PLUGIN_ICON = "feather";
const REFRESH_DEBOUNCE_MS = 250;

export default class QuillPlugin extends Plugin {
	settings: QuillSettings = { ...DEFAULT_SETTINGS };
	private refreshTimeout: ReturnType<typeof setTimeout> | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_QUILL, (leaf) => new QuillView(leaf, this));
		this.registerView(VIEW_TYPE_QUILL_DAY, (leaf) => new QuillDayView(leaf, this));

		this.addRibbonIcon(PLUGIN_ICON, "Open Quill journal", () => void this.activateView());

		this.addCommand({
			id: "open-quill",
			name: "Open Quill journal",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new QuillSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file.extension !== "md") return;
				const folders = parseFolderList(
					this.settings.journalFolders ?? this.settings.journalFolder ?? "",
				);
				const logFolders = parseFolderList(this.settings.logFolders ?? "");
				const inJournalFolders =
					folders.length === 0 ||
					folders.some((f) => file.path === f || file.path.startsWith(f + "/"));
				const inLogFolders =
					logFolders.length > 0 &&
					logFolders.some((f) => file.path === f || file.path.startsWith(f + "/"));
				const inScope = inJournalFolders || inLogFolders;
				if (!inScope) return;
				if (this.refreshTimeout != null) clearTimeout(this.refreshTimeout);
				this.refreshTimeout = setTimeout(() => {
					this.refreshTimeout = null;
					const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_QUILL)[0];
					const view = leaf?.view;
					if (view && view instanceof QuillView) void view.refresh();
					for (const dayLeaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUILL_DAY)) {
						const dayView = dayLeaf?.view;
						if (dayView && dayView instanceof QuillDayView) void dayView.refresh();
					}
				}, REFRESH_DEBOUNCE_MS);
			}),
		);
	}

	onunload(): void {
		if (this.refreshTimeout != null) clearTimeout(this.refreshTimeout);
	}

	async activateView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE_QUILL, "main");
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Partial<QuillSettings> | null;
		if (raw) {
			if (raw.journalFolder != null && raw.journalFolders == null) {
				raw.journalFolders = raw.journalFolder;
			}
			if (raw.journalConfigs == null) raw.journalConfigs = {};
			if (raw.entryTypes == null || !Array.isArray(raw.entryTypes) || raw.entryTypes.length === 0) {
				raw.entryTypes = [
					{ name: "Workout", mode: (raw as any).entryTypeWorkout?.mode ?? "", value: (raw as any).entryTypeWorkout?.value ?? "", icon: "dumbbell" },
					{ name: "Location", mode: (raw as any).entryTypeLocation?.mode ?? "", value: (raw as any).entryTypeLocation?.value ?? "", icon: "map-pin" },
					{ name: "Trip", mode: (raw as any).entryTypeTrip?.mode ?? "", value: (raw as any).entryTypeTrip?.value ?? "", icon: "car" },
				];
			}
			if (raw.lapseEntriesProperty == null) raw.lapseEntriesProperty = "lapseEntries";
			if (raw.defaultJournalEntryLocation == null)
				raw.defaultJournalEntryLocation = DEFAULT_SETTINGS.defaultJournalEntryLocation;
			if (raw.attachmentMode == null) raw.attachmentMode = DEFAULT_SETTINGS.attachmentMode;
			if (raw.assetsFolderPath == null) raw.assetsFolderPath = DEFAULT_SETTINGS.assetsFolderPath;
			if (raw.useLeafletMaps == null) raw.useLeafletMaps = false;
			if (raw.leafletLatProperty == null) raw.leafletLatProperty = "lat";
			if (raw.leafletLongProperty == null) raw.leafletLongProperty = "long";
			if (raw.entryPreviewMaxLines == null) raw.entryPreviewMaxLines = DEFAULT_SETTINGS.entryPreviewMaxLines;
			if (raw.logFolders == null) raw.logFolders = DEFAULT_SETTINGS.logFolders;
			if (raw.projectLinkProperty == null) raw.projectLinkProperty = DEFAULT_SETTINGS.projectLinkProperty;
			if (raw.entryTypes?.length) {
				raw.entryTypes = migrateEntryTypesOpenIn(raw.entryTypes);
			}
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
		if (this.settings.entryTypes?.length) {
			this.settings.entryTypes = migrateEntryTypesOpenIn(this.settings.entryTypes);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

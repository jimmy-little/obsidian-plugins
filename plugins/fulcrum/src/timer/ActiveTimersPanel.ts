import {setIcon, TFile} from "obsidian";
import type {TimeEntry} from "./types";
import type {TimerModule} from "./TimerModule";

type ActiveTimerRow = {filePath: string; entry: TimeEntry};

export type ActiveTimersRenderOptions = {
	showHeader?: boolean;
	/** `grid` tiles cards (dashboard); default is a vertical stack. */
	listLayout?: "stack" | "grid";
	/** When set, only timers linked to this project note are shown. */
	filterProjectPath?: string;
};

/** Minimal active-timer readout for the docked Active Timers leaf. */
export class ActiveTimersPanel {
	private readonly plugin: TimerModule;
	private container: HTMLElement | null = null;
	private readonly timeDisplays = new Map<string, HTMLElement>();
	private refreshInterval: number | null = null;
	private tickCount = 0;
	private rendering = false;
	private lastRenderOptions: ActiveTimersRenderOptions = {};
	private renderInFlight: Promise<void> | null = null;

	constructor(plugin: TimerModule) {
		this.plugin = plugin;
	}

	get app() {
		return this.plugin.app;
	}

	unmount(): void {
		if (this.refreshInterval !== null) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
		this.timeDisplays.clear();
		this.container?.empty();
		this.container = null;
		this.tickCount = 0;
		this.renderInFlight = null;
	}

	async refresh(): Promise<void> {
		if (this.container) await this.render(this.container, this.lastRenderOptions);
	}

	async render(
		container: HTMLElement,
		options: ActiveTimersRenderOptions = {},
	): Promise<void> {
		if (this.renderInFlight) {
			await this.renderInFlight;
		}
		this.renderInFlight = this.renderInner(container, options);
		try {
			await this.renderInFlight;
		} finally {
			this.renderInFlight = null;
		}
	}

	private async renderInner(
		container: HTMLElement,
		options: ActiveTimersRenderOptions = {},
	): Promise<void> {
		this.rendering = true;
		try {
			await this.renderInnerBody(container, options);
		} finally {
			this.rendering = false;
		}
	}

	private async renderInnerBody(
		container: HTMLElement,
		options: ActiveTimersRenderOptions = {},
	): Promise<void> {
		this.lastRenderOptions = {...options};
		const showHeader = options.showHeader ?? true;
		const listLayout = options.listLayout ?? "stack";
		this.container = container;
		this.timeDisplays.clear();
		container.empty();
		container.addClass("fulcrum-active-timers");

		if (showHeader) {
			const header = container.createDiv({cls: "fulcrum-active-timers__header"});
			const refreshBtn = header.createEl("button", {
				cls: "fulcrum-active-timers__refresh clickable-icon",
				attr: {"aria-label": "Refresh"},
			});
			setIcon(refreshBtn, "refresh-cw");
			refreshBtn.onclick = async () => {
				this.plugin.timeData.clear();
				if (this.container) await this.render(this.container, this.lastRenderOptions);
			};
		}

		const activeTimers = options.filterProjectPath
			? await this.plugin.getActiveTimersForProject(options.filterProjectPath)
			: await this.plugin.getActiveTimers();
		if (activeTimers.length === 0) {
			container.createEl("p", {
				text: "No active timers",
				cls: "fulcrum-active-timers__empty",
			});
		} else {
			const list = container.createDiv({
				cls:
					listLayout === "grid"
						? "fulcrum-active-timers__list fulcrum-active-timers__list--grid"
						: "fulcrum-active-timers__list",
			});
			for (const row of activeTimers) {
				const accentCss = await this.resolveAccentForFile(row.filePath);
				await this.renderRow(list, row, accentCss);
			}
		}

		if (this.refreshInterval !== null) {
			clearInterval(this.refreshInterval);
		}
		this.refreshInterval = window.setInterval(() => {
			void this.tick();
		}, 1000);
	}

	private collectActiveTimersFromMemory(): ActiveTimerRow[] {
		return this.plugin.listActiveTimersInMemory();
	}

	private async renderRow(
		list: HTMLElement,
		{filePath, entry}: ActiveTimerRow,
		accentCss: string = "var(--interactive-accent)",
	): Promise<void> {
		const card = list.createDiv({cls: "fulcrum-active-timers__row"});
		this.plugin.applyProjectAccent(card, accentCss);

		const timerCol = card.createDiv({cls: "fulcrum-active-timers__timer-col"});
		const timerBox = timerCol.createDiv({cls: "fulcrum-timer-timer-container"});
		const elapsed = this.plugin.getActiveEntryElapsedMs(entry);
		const timeEl = timerBox.createDiv({
			text: this.plugin.formatTimeAsHHMMSS(elapsed),
			cls: "fulcrum-timer-timer-display",
		});
		this.timeDisplays.set(entry.id, timeEl);

		const adjustMinutes = this.plugin.settings.timeAdjustMinutes;
		const adjustRow = timerCol.createDiv({cls: "fulcrum-timer-adjust-buttons"});
		for (const offset of [-adjustMinutes, adjustMinutes]) {
			const btn = adjustRow.createEl("button", {
				cls: "fulcrum-timer-btn-adjust",
				text: offset > 0 ? `+${offset}` : `${offset}`,
			});
			btn.onclick = (ev) => {
				ev.stopPropagation();
				void this.adjustStartTime(filePath, entry, offset);
			};
		}

		const info = card.createDiv({cls: "fulcrum-active-timers__info"});
		const projectLink = await this.plugin.resolveProjectLink(filePath);
		const entryLabel = entry.label?.trim();
		const noteName = this.noteLabel(filePath);

		const hideProjectLink = Boolean(this.lastRenderOptions.filterProjectPath);
		if (projectLink && !hideProjectLink) {
			const projectEl = info.createEl("a", {
				text: projectLink.displayName,
				cls: "fulcrum-active-timers__project",
				href: projectLink.projectPath,
			});
			projectEl.onclick = (ev) => {
				ev.preventDefault();
				void this.openProject(projectLink.projectPath);
			};
		}

		if (entryLabel) {
			info.createDiv({
				text: entryLabel,
				cls: "fulcrum-active-timers__entry-label",
			});
		}

		const noteLink = info.createEl("a", {
			text: noteName,
			cls: "fulcrum-active-timers__note",
			href: filePath,
		});
		noteLink.onclick = (ev) => {
			ev.preventDefault();
			void this.openNote(filePath);
		};

		const stopBtn = card.createEl("button", {
			cls: "fulcrum-active-timers__stop",
			attr: {"aria-label": "Stop timer"},
		});
		setIcon(stopBtn, "square");
		stopBtn.onclick = (ev) => {
			ev.stopPropagation();
			void this.stopTimer(filePath, entry.id);
		};
	}

	private async resolveAccentForFile(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return "var(--interactive-accent)";

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const projectRaw = fm?.[this.plugin.settings.projectKey];
		if (typeof projectRaw === "string" && projectRaw.trim()) {
			const color = await this.plugin.getProjectColor(projectRaw);
			if (color) return color;
		}

		return "var(--interactive-accent)";
	}

	private async adjustStartTime(filePath: string, entry: TimeEntry, offsetMinutes: number): Promise<void> {
		if (!entry.startTime) return;

		const offsetMs = offsetMinutes * 60 * 1000;
		const newStartTime = entry.startTime - offsetMs;

		if (newStartTime > Date.now()) return;

		entry.startTime = newStartTime;

		await this.plugin.updateFrontmatter(filePath);

		const timeEl = this.timeDisplays.get(entry.id);
		if (timeEl) {
			const elapsed = this.plugin.getActiveEntryElapsedMs(entry);
			timeEl.setText(this.plugin.formatTimeAsHHMMSS(elapsed));
		}

		this.plugin.refreshActivityPanel();
	}

	private noteLabel(filePath: string): string {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		let name =
			file instanceof TFile
				? file.basename
				: (filePath.split("/").pop()?.replace(/\.md$/i, "") ?? filePath);
		return this.plugin.removeTimestampFromFileName(name);
	}

	private async openNote(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private async openProject(projectPath: string): Promise<void> {
		await this.plugin.host.openProjectSummary(projectPath);
	}

	private async stopTimer(filePath: string, _entryId: string): Promise<void> {
		await this.plugin.stopAllActiveEntriesInFile(filePath);
		if (this.container) await this.render(this.container, this.lastRenderOptions);
		this.plugin.refreshActivityPanel();
	}

	private async tick(): Promise<void> {
		if (!this.container || this.rendering) return;

		this.tickCount++;
		const shouldRescan = this.tickCount % 30 === 0;
		const activeTimers = shouldRescan
			? await this.plugin.getActiveTimers()
			: this.collectActiveTimersFromMemory();

		const activeById = new Map(activeTimers.map((row) => [row.entry.id, row]));
		let prunedStale = false;
		for (const id of [...this.timeDisplays.keys()]) {
			if (!activeById.has(id)) {
				this.timeDisplays.delete(id);
				prunedStale = true;
			}
		}

		const needsFullRefresh =
			prunedStale ||
			activeTimers.length !== this.timeDisplays.size ||
			activeTimers.some(({entry}) => !this.timeDisplays.has(entry.id));

		if (needsFullRefresh) {
			await this.render(this.container, this.lastRenderOptions);
			return;
		}

		for (const [entryId, timeEl] of this.timeDisplays) {
			const row = activeById.get(entryId);
			if (!row?.entry.startTime) continue;
			const elapsed = this.plugin.getActiveEntryElapsedMs(row.entry);
			timeEl.setText(this.plugin.formatTimeAsHHMMSS(elapsed));
		}
	}
}

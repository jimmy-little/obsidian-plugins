import {setIcon, TFile} from "obsidian";
import type {TimeEntry} from "./types";
import type {TimerModule} from "./TimerModule";

type ActiveTimerRow = {filePath: string; entry: TimeEntry};

/** Minimal active-timer readout for the docked Active Timers leaf. */
export class ActiveTimersPanel {
	private readonly plugin: TimerModule;
	private container: HTMLElement | null = null;
	private readonly timeDisplays = new Map<string, HTMLElement>();
	private refreshInterval: number | null = null;
	private tickCount = 0;

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
		this.container = null;
		this.tickCount = 0;
	}

	async refresh(): Promise<void> {
		if (this.container) await this.render(this.container);
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.addClass("fulcrum-active-timers");

		const header = container.createDiv({cls: "fulcrum-active-timers__header"});
		const refreshBtn = header.createEl("button", {
			cls: "fulcrum-active-timers__refresh clickable-icon",
			attr: {"aria-label": "Refresh"},
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.onclick = async () => {
			this.plugin.timeData.clear();
			if (this.container) await this.render(this.container);
		};

		const activeTimers = await this.plugin.getActiveTimers();
		if (activeTimers.length === 0) {
			container.createEl("p", {
				text: "No active timers",
				cls: "fulcrum-active-timers__empty",
			});
		} else {
			const list = container.createDiv({cls: "fulcrum-active-timers__list"});
			for (const row of activeTimers) {
				this.renderRow(list, row);
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

	private renderRow(list: HTMLElement, {filePath, entry}: ActiveTimerRow): void {
		const card = list.createDiv({cls: "fulcrum-active-timers__row"});

		const info = card.createDiv({cls: "fulcrum-active-timers__info"});

		const noteName = this.noteLabel(filePath);
		const noteLink = info.createEl("a", {
			text: noteName,
			cls: "fulcrum-active-timers__note internal-link",
			href: filePath,
		});
		noteLink.onclick = (ev) => {
			ev.preventDefault();
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				void this.app.workspace.openLinkText(filePath, "", false);
			}
		};

		const entryLabel = entry.label?.trim();
		if (entryLabel) {
			info.createDiv({text: entryLabel, cls: "fulcrum-active-timers__entry-label"});
		}

		const elapsed = this.plugin.getActiveEntryElapsedMs(entry);
		const timeEl = info.createDiv({
			text: this.plugin.formatTimeAsHHMMSS(elapsed),
			cls: "fulcrum-active-timers__time",
		});
		this.timeDisplays.set(entry.id, timeEl);

		const stopBtn = card.createEl("button", {
			cls: "fulcrum-active-timers__stop clickable-icon",
			attr: {"aria-label": "Stop timer"},
		});
		setIcon(stopBtn, "square");
		stopBtn.onclick = (ev) => {
			ev.stopPropagation();
			void this.stopTimer(filePath, entry.id);
		};
	}

	private noteLabel(filePath: string): string {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		let name =
			file instanceof TFile
				? file.basename
				: (filePath.split("/").pop()?.replace(/\.md$/i, "") ?? filePath);
		return this.plugin.removeTimestampFromFileName(name);
	}

	private async stopTimer(filePath: string, _entryId: string): Promise<void> {
		await this.plugin.stopAllActiveEntriesInFile(filePath);
		if (this.container) await this.render(this.container);
		this.plugin.refreshActivityPanel();
	}

	private async tick(): Promise<void> {
		if (!this.container) return;

		this.tickCount++;
		// Full vault scan is expensive; rescan occasionally, not every few seconds.
		const shouldRescan =
			this.timeDisplays.size === 0 || this.tickCount % 30 === 0;
		const activeTimers = shouldRescan
			? await this.plugin.getActiveTimers()
			: this.collectActiveTimersFromMemory();

		const displayedIds = new Set(this.timeDisplays.keys());
		const activeIds = new Set(activeTimers.map(({entry}) => entry.id));
		const needsFullRefresh =
			activeTimers.length !== displayedIds.size ||
			![...displayedIds].every((id) => activeIds.has(id));

		if (needsFullRefresh) {
			await this.render(this.container);
			return;
		}

		for (const [entryId, timeEl] of this.timeDisplays) {
			let found: TimeEntry | null = null;
			for (const [, pageData] of this.plugin.timeData) {
				for (const entry of pageData.entries) {
					if (entry.id === entryId && entry.startTime && !entry.endTime) {
						found = entry;
						break;
					}
				}
				if (found) break;
			}
			if (!found?.startTime) {
				await this.render(this.container);
				return;
			}
			const elapsed = this.plugin.getActiveEntryElapsedMs(found);
			timeEl.setText(this.plugin.formatTimeAsHHMMSS(elapsed));
		}
	}
}

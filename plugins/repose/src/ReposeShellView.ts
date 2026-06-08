import { ItemView, Platform, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { SvelteComponent } from "svelte";
import type ReposePlugin from "./main";
import { resolveMediaTypeForFile } from "./media/mediaDetect";
import { clearReposeCompanionMarkdownPane, navigateEpisodeInCompanionPane, syncReposeCompanionPaneForSelection } from "./reposeCompanionMarkdown";
import { leafIsInSideDock } from "./workspaceLeaf";
import ReposeHome from "./svelte/ReposeHome.svelte";

export const VIEW_TYPE_REPOSE = "repose-main-view";

export type ReposeViewState = {
	selectedPath?: string;
	/** Main pane shows the Repose landing dashboard. */
	landing?: boolean;
	/** Main pane shows the consumption calendar (sidebar stays visible). */
	calendar?: boolean;
	/** YYYY-MM-DD focal day when {@link calendar} is true. */
	calendarFocalDateIso?: string;
	/** Episode split leaf: only the detail pane (no sidebar / split chrome). */
	detailOnly?: boolean;
};

export class ReposeShellView extends ItemView {
	private component: SvelteComponent | null = null;
	private selectedPath: string | null = null;
	private showLanding = false;
	private showCalendar = false;
	private calendarFocalDateIso: string | undefined;
	private detailOnly = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReposePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_REPOSE;
	}

	getDisplayText(): string {
		return "Repose";
	}

	getIcon(): string {
		return "clapperboard";
	}

	getState(): ReposeViewState {
		const s: ReposeViewState = {};
		if (this.selectedPath) s.selectedPath = this.selectedPath;
		if (this.showLanding) s.landing = true;
		if (this.showCalendar) s.calendar = true;
		if (this.calendarFocalDateIso) s.calendarFocalDateIso = this.calendarFocalDateIso;
		if (this.detailOnly) s.detailOnly = true;
		return s;
	}

	async setState(state: ReposeViewState, _result: ViewStateResult): Promise<void> {
		const s = state ?? {};
		this.detailOnly = s.detailOnly === true;
		const path = s.selectedPath;
		const hasPath = typeof path === "string" && path.length > 0;
		const focal = s.calendarFocalDateIso?.trim();

		if (s.calendar === true) {
			this.showCalendar = true;
			this.showLanding = false;
			this.selectedPath = null;
			this.calendarFocalDateIso = focal || undefined;
		} else if (hasPath) {
			this.selectedPath = path;
			this.showLanding = false;
			this.showCalendar = false;
			this.calendarFocalDateIso = undefined;
		} else if (s.landing === true) {
			this.showLanding = true;
			this.selectedPath = null;
			this.showCalendar = false;
			this.calendarFocalDateIso = undefined;
		} else {
			this.selectedPath = null;
			this.showLanding = false;
			this.showCalendar = false;
			this.calendarFocalDateIso = undefined;
		}
		// Avoid tearing down Svelte on every selection — preserves sidebar scroll, search, filters.
		if (this.component) {
			this.component.$set({
				selectedPath: this.selectedPath,
				landing: this.showLanding,
				showCalendar: this.showCalendar,
				calendarFocalDateIso: this.calendarFocalDateIso,
				detailOnly: this.detailOnly,
			});
		} else {
			await this.render();
		}
		if (!Platform.isMobile && !this.showCalendar) {
			await this.syncCompanionMarkdownPaneForPath(this.selectedPath);
		}
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("repose-shell-mount");
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.component?.$set({
					fullView: this.isFullView(),
					detailOnly: this.detailOnly,
				});
			}),
		);
		if (Platform.isMobile) {
			await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
		}
		await this.render();
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}

	private isFullView(): boolean {
		if (Platform.isMobile) return true;
		return !leafIsInSideDock(this.app, this.leaf);
	}

	private async render(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();

		this.component = new ReposeHome({
			target: this.contentEl,
			intro: false,
			props: {
				plugin: this.plugin,
				fullView: this.isFullView(),
				detailOnly: this.detailOnly,
				selectedPath: this.selectedPath,
				landing: this.showLanding,
				showCalendar: this.showCalendar,
				calendarFocalDateIso: this.calendarFocalDateIso,
				hostLeaf: this.leaf,
				onSelectPath: (path: string) => void this.onSelected(path),
				onGoHome: () => void this.goHome(),
				onShowCalendar: (focalDateIso?: string) => void this.showCalendarPane(focalDateIso),
				onBackToList: () => void this.backToList(),
			},
		});
	}

	private async syncCompanionMarkdownPaneForPath(path: string | null): Promise<void> {
		const f = path ? this.app.vault.getAbstractFileByPath(path) : null;
		await syncReposeCompanionPaneForSelection(this.plugin, this.leaf, f instanceof TFile ? f : null);
	}

	/** Update sidebar/detail selection without opening or splitting companion markdown panes. */
	updateSelection(path: string): void {
		this.showLanding = false;
		this.showCalendar = false;
		this.calendarFocalDateIso = undefined;
		this.selectedPath = path;
		this.component?.$set({
			selectedPath: path,
			landing: false,
			showCalendar: false,
			calendarFocalDateIso: undefined,
			detailOnly: this.detailOnly,
		});
	}

	private backToList(): void {
		this.showLanding = false;
		this.showCalendar = false;
		this.calendarFocalDateIso = undefined;
		this.selectedPath = null;
		this.component?.$set({
			selectedPath: null,
			landing: false,
			showCalendar: false,
			calendarFocalDateIso: undefined,
			detailOnly: this.detailOnly,
		});
	}

	private async goHome(): Promise<void> {
		clearReposeCompanionMarkdownPane(this.plugin);
		this.showLanding = true;
		this.showCalendar = false;
		this.calendarFocalDateIso = undefined;
		this.selectedPath = null;
		this.component?.$set({
			selectedPath: null,
			landing: true,
			showCalendar: false,
			calendarFocalDateIso: undefined,
			detailOnly: this.detailOnly,
		});

		if (leafIsInSideDock(this.app, this.leaf)) {
			const mainLeaf = this.app.workspace.getLeaf("tab");
			await mainLeaf.setViewState({
				type: VIEW_TYPE_REPOSE,
				active: true,
				state: { landing: true },
			});
			await this.app.workspace.revealLeaf(mainLeaf);
			return;
		}

		await this.leaf.setViewState({
			type: VIEW_TYPE_REPOSE,
			active: true,
			state: { landing: true },
		});
	}

	private async showCalendarPane(focalDateIso?: string): Promise<void> {
		clearReposeCompanionMarkdownPane(this.plugin);
		this.showLanding = false;
		this.showCalendar = true;
		this.selectedPath = null;
		this.calendarFocalDateIso = focalDateIso?.trim() || undefined;

		if (leafIsInSideDock(this.app, this.leaf) && !Platform.isMobile) {
			let mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPOSE).find(
				(l) => !leafIsInSideDock(this.app, l),
			);
			if (!mainLeaf) mainLeaf = this.app.workspace.getLeaf(false);
			await mainLeaf.setViewState({
				type: VIEW_TYPE_REPOSE,
				active: true,
				state: {
					calendar: true,
					calendarFocalDateIso: this.calendarFocalDateIso,
				},
			});
			await this.app.workspace.revealLeaf(mainLeaf);
			return;
		}

		this.component?.$set({
			selectedPath: null,
			landing: false,
			showCalendar: true,
			calendarFocalDateIso: this.calendarFocalDateIso,
			detailOnly: this.detailOnly,
		});

		await this.leaf.setViewState({
			type: VIEW_TYPE_REPOSE,
			active: true,
			state: {
				calendar: true,
				calendarFocalDateIso: this.calendarFocalDateIso,
			},
		});
	}

	private async onSelected(path: string): Promise<void> {
		this.showLanding = false;
		this.showCalendar = false;
		this.calendarFocalDateIso = undefined;

		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const mt = resolveMediaTypeForFile(this.app, file, this.plugin.settings);
			if (mt === "episode") {
				const navigated = await navigateEpisodeInCompanionPane(this.plugin, file);
				if (navigated) {
					this.updateSelection(path);
					return;
				}
			}
			if (mt === "book" && !Platform.isMobile) {
				this.updateSelection(path);
				await syncReposeCompanionPaneForSelection(this.plugin, this.leaf, file);
				return;
			}
		}

		/* Non-book: keep Repose focused in the main workspace when the list lives in a dock. */
		if (leafIsInSideDock(this.app, this.leaf) && !Platform.isMobile) {
			let mainLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPOSE).find(
				(l) => !leafIsInSideDock(this.app, l),
			);
			if (!mainLeaf) mainLeaf = this.app.workspace.getLeaf("tab");
			await mainLeaf.setViewState({
				type: VIEW_TYPE_REPOSE,
				active: true,
				state: { selectedPath: path },
			});
			await this.app.workspace.revealLeaf(mainLeaf);
			this.updateSelection(path);
			return;
		}

		this.updateSelection(path);
		if (Platform.isMobile) {
			return;
		}
		await this.leaf.setViewState({
			type: VIEW_TYPE_REPOSE,
			active: true,
			state: { selectedPath: path },
		});
	}
}

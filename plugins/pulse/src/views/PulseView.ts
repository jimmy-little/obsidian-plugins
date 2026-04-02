import { ItemView, WorkspaceLeaf, setIcon, type ViewStateResult } from "obsidian";
import type PulsePlugin from "../main";
import { PulseSidebar } from "./PulseSidebar";
import { PulseMainContent } from "./PulseMainContent";

export const VIEW_TYPE_PULSE = "pulse-workout-manager";

export type PulseViewMode =
	"today" | "exercise" | "session" | "program" | "history" | "stats" |
	"new-exercise" | "workout-builder" | "program-builder" | "edit-program" |
	"workout-edit";

export interface PulseViewState {
	mode?: PulseViewMode;
	path?: string;
	[key: string]: unknown;
}

export class PulseView extends ItemView {
	plugin: PulsePlugin;
	mode: PulseViewMode = "today";
	activePath: string | null = null;

	private sidebar: PulseSidebar | null = null;
	private main: PulseMainContent | null = null;
	private sidebarEl: HTMLElement | null = null;
	private mainEl: HTMLElement | null = null;
	private leftCollapsed = false;

	constructor(leaf: WorkspaceLeaf, plugin: PulsePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PULSE;
	}

	getDisplayText(): string {
		return "Pulse";
	}

	getIcon(): string {
		return "dumbbell";
	}

	getState(): PulseViewState {
		return { mode: this.mode, path: this.activePath ?? undefined };
	}

	async setState(state: PulseViewState, _result: ViewStateResult): Promise<void> {
		this.mode = state?.mode ?? "today";
		this.activePath = state?.path ?? null;
		await this.render();
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("pulse-view-root");
		await this.render();
	}

	async onClose(): Promise<void> {
		this.main?.destroy();
		this.sidebar = null;
		this.main = null;
	}

	navigate(mode: PulseViewMode, path?: string): void {
		void this.leaf.setViewState({
			type: VIEW_TYPE_PULSE,
			active: true,
			state: { mode, path } as PulseViewState,
		});
	}

	/** Re-render sidebar + main without changing mode/path (e.g. after delete from sidebar). */
	async refresh(): Promise<void> {
		await this.render();
	}

	private async render(): Promise<void> {
		this.main?.destroy();
		this.contentEl.empty();

		const shell = this.contentEl.createDiv({
			cls: `pulse-pm ${this.leftCollapsed ? "pulse-pm-left-collapsed" : ""}`,
		});

		// ── Left sidebar ──
		const leftSidebar = shell.createDiv({ cls: "pulse-pm__sidebar pulse-pm__sidebar--left" });
		this.sidebarEl = leftSidebar;

		const glyphBar = leftSidebar.createDiv({ cls: "pulse-pm__glyph-bar" });
		this.renderGlyphBar(glyphBar);

		const scrollArea = leftSidebar.createDiv({ cls: "pulse-pm__left-scroll" });
		this.sidebar = new PulseSidebar(this.plugin, this);
		await this.sidebar.render(scrollArea);

		// ── Splitter ──
		const splitter = shell.createEl("button", { cls: "pulse-pm__split" });
		splitter.disabled = this.leftCollapsed;
		this.initSplitterDrag(splitter, shell);

		// ── Main content ──
		const mainArea = shell.createDiv({ cls: "pulse-pm__main" });
		this.mainEl = mainArea;
		this.main = new PulseMainContent(this.plugin, this);
		await this.main.render(mainArea);
	}

	private renderGlyphBar(bar: HTMLElement): void {
		const items: { icon: string; label: string; mode: PulseViewMode }[] = [
			{ icon: "dumbbell", label: "Today", mode: "today" },
			{ icon: "history", label: "History", mode: "history" },
			{ icon: "bar-chart-2", label: "Stats", mode: "stats" },
		];

		const collapseBtn = bar.createDiv({ cls: "pulse-pm__glyph-btn clickable-icon" });
		setIcon(collapseBtn, "panel-left-close");
		collapseBtn.setAttribute("aria-label", "Toggle sidebar");
		collapseBtn.addEventListener("click", () => {
			this.leftCollapsed = !this.leftCollapsed;
			const shell = this.contentEl.querySelector(".pulse-pm");
			if (shell) {
				shell.toggleClass("pulse-pm-left-collapsed", this.leftCollapsed);
			}
			const split = this.contentEl.querySelector(".pulse-pm__split") as HTMLButtonElement | null;
			if (split) split.disabled = this.leftCollapsed;
		});

		const spacer = bar.createDiv({ cls: "pulse-pm__glyph-spacer" });

		for (const item of items) {
			const btn = bar.createDiv({
				cls: `pulse-pm__glyph-btn clickable-icon ${this.mode === item.mode ? "pulse-pm__glyph-btn--active" : ""}`,
			});
			setIcon(btn, item.icon);
			btn.setAttribute("aria-label", item.label);
			btn.addEventListener("click", () => this.navigate(item.mode));
		}
	}

	private initSplitterDrag(splitter: HTMLElement, shell: HTMLElement): void {
		let startX = 0;
		let startW = 0;

		const onPointerMove = (e: PointerEvent) => {
			const delta = e.clientX - startX;
			const newW = Math.max(180, Math.min(startW + delta, 500));
			shell.style.setProperty("--pulse-pm-left-w", `${newW}px`);
		};

		const onPointerUp = () => {
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
		};

		splitter.addEventListener("pointerdown", (e) => {
			if (this.leftCollapsed) return;
			e.preventDefault();
			startX = e.clientX;
			startW = this.sidebarEl?.offsetWidth ?? 220;
			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
		});
	}
}

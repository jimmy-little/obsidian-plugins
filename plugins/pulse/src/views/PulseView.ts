import { ItemView, Platform, WorkspaceLeaf, setIcon, type ViewStateResult } from "obsidian";
import type PulsePlugin from "../main";
import { PulseSidebar } from "./PulseSidebar";
import { PulseMainContent } from "./PulseMainContent";

export const VIEW_TYPE_PULSE = "pulse-workout-manager";

export type PulseViewMode =
	"today" | "exercise" | "session" | "program" | "history" | "stats" | "body" | "nutrition" |
	"new-exercise" | "workout-builder" | "program-builder" | "edit-program" |
	"workout-edit";

/** Modes that share the workouts/exercises sidebar (vs nutrition-only list). */
export function sidebarShowsWorkoutList(mode: PulseViewMode): boolean {
	return mode !== "nutrition";
}

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
	private shellEl: HTMLElement | null = null;
	private sidebarScrollEl: HTMLElement | null = null;
	private mainEl: HTMLElement | null = null;
	private glyphBarEl: HTMLElement | null = null;
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
		const newMode = state?.mode === "history" ? "today" : (state?.mode ?? "today");
		const newPath = state?.path ?? null;

		if (this.shellEl && newMode === this.mode && newPath === this.activePath) {
			return;
		}

		const prevMode = this.mode;
		this.mode = newMode;
		this.activePath = newPath;

		if (!this.shellEl) {
			await this.renderShell();
			return;
		}

		await this.renderMain();
		if (prevMode !== newMode) {
			if (sidebarShowsWorkoutList(prevMode) && sidebarShowsWorkoutList(newMode)) {
				this.updateSidebarActiveState();
			} else {
				await this.renderSidebar();
			}
			this.updateGlyphBarActiveState();
		} else {
			this.updateSidebarActiveState();
		}
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("pulse-view-root");
		await this.renderShell();
	}

	async onClose(): Promise<void> {
		this.main?.destroy();
		this.sidebar = null;
		this.main = null;
		this.shellEl = null;
		this.sidebarScrollEl = null;
		this.mainEl = null;
		this.glyphBarEl = null;
	}

	/**
	 * @param collapseSidebarOnNarrow — after picking from the sidebar list on a phone/narrow pane, collapse the rail so the main pane is visible.
	 */
	navigate(mode: PulseViewMode, path?: string, collapseSidebarOnNarrow = false): void {
		if (
			collapseSidebarOnNarrow &&
			typeof window !== "undefined" &&
			(Platform.isMobile || window.matchMedia("(max-width: 768px)").matches)
		) {
			this.leftCollapsed = true;
			this.shellEl?.toggleClass("pulse-pm-left-collapsed", true);
			const split = this.contentEl.querySelector(".pulse-pm__split") as HTMLButtonElement | null;
			if (split) split.disabled = true;
		}

		const prevMode = this.mode;
		this.mode = mode;
		this.activePath = path ?? null;

		if (!this.shellEl) {
			void this.leaf.setViewState({
				type: VIEW_TYPE_PULSE,
				active: true,
				state: { mode, path } as PulseViewState,
			});
			return;
		}

		void (async () => {
			await this.renderMain();
			if (prevMode !== mode) {
				if (sidebarShowsWorkoutList(prevMode) && sidebarShowsWorkoutList(mode)) {
					this.updateSidebarActiveState();
				} else {
					await this.renderSidebar();
				}
				this.updateGlyphBarActiveState();
			} else {
				this.updateSidebarActiveState();
			}
			void this.leaf.setViewState({
				type: VIEW_TYPE_PULSE,
				active: true,
				state: { mode, path } as PulseViewState,
			});
		})();
	}

	/** Re-render main pane only (e.g. after quick note on workout page). */
	async refreshMain(): Promise<void> {
		await this.renderMain();
	}

	/** Re-render sidebar list (e.g. after delete/rename/import). */
	async refreshSidebar(): Promise<void> {
		await this.renderSidebar();
		this.updateSidebarActiveState();
	}

	/** Re-render sidebar + main without rebuilding the shell. */
	async refresh(): Promise<void> {
		await this.renderSidebar();
		await this.renderMain();
		this.updateSidebarActiveState();
	}

	private async renderShell(): Promise<void> {
		this.main?.destroy();
		this.contentEl.empty();

		const shell = this.contentEl.createDiv({
			cls: `pulse-pm ${this.leftCollapsed ? "pulse-pm-left-collapsed" : ""}`,
		});
		this.shellEl = shell;

		const leftSidebar = shell.createDiv({ cls: "pulse-pm__sidebar pulse-pm__sidebar--left" });

		this.glyphBarEl = leftSidebar.createDiv({ cls: "pulse-pm__glyph-bar" });
		this.renderGlyphBar(this.glyphBarEl);

		this.sidebarScrollEl = leftSidebar.createDiv({ cls: "pulse-pm__left-scroll" });
		this.sidebar = new PulseSidebar(this.plugin, this);

		const splitter = shell.createEl("button", { cls: "pulse-pm__split" });
		splitter.disabled = this.leftCollapsed;
		this.initSplitterDrag(splitter, shell);

		this.mainEl = shell.createDiv({ cls: "pulse-pm__main" });
		this.main = new PulseMainContent(this.plugin, this);

		await this.renderSidebar();
		await this.renderMain();
	}

	private async renderSidebar(): Promise<void> {
		if (!this.sidebarScrollEl || !this.sidebar) return;
		await this.sidebar.render(this.sidebarScrollEl, this.mode);
	}

	private async renderMain(): Promise<void> {
		if (!this.mainEl || !this.main) return;
		this.main.destroy();
		this.mainEl.empty();
		this.main = new PulseMainContent(this.plugin, this);
		await this.main.render(this.mainEl);
	}

	private updateSidebarActiveState(): void {
		if (!this.sidebarScrollEl) return;
		for (const row of this.sidebarScrollEl.querySelectorAll(".pulse-sidebar__row[data-workout-path]")) {
			const path = row.getAttribute("data-workout-path");
			row.toggleClass(
				"pulse-sidebar__row--active",
				(this.mode === "session" || this.mode === "workout-edit") &&
					!!this.activePath &&
					path === this.activePath,
			);
		}
	}

	private updateGlyphBarActiveState(): void {
		if (!this.glyphBarEl) return;
		const modes: PulseViewMode[] = ["today", "stats", "body", "nutrition"];
		const buttons = this.glyphBarEl.querySelectorAll(".pulse-pm__glyph-btn");
		// First button is collapse; next is spacer; then mode buttons
		for (let i = 0; i < modes.length; i++) {
			const btn = buttons[i + 2];
			if (!btn) continue;
			btn.toggleClass("pulse-pm__glyph-btn--active", this.mode === modes[i]);
		}
	}

	private renderGlyphBar(bar: HTMLElement): void {
		const items: { icon: string; label: string; mode: PulseViewMode }[] = [
			{ icon: "house", label: "Home", mode: "today" },
			{ icon: "bar-chart-2", label: "Stats", mode: "stats" },
			{ icon: "scale", label: "Body", mode: "body" },
			{ icon: "apple", label: "Nutrition", mode: "nutrition" },
		];

		const collapseBtn = bar.createDiv({ cls: "pulse-pm__glyph-btn clickable-icon" });
		const syncCollapseIcon = (): void => {
			setIcon(collapseBtn, this.leftCollapsed ? "panel-left" : "panel-left-close");
			collapseBtn.setAttribute(
				"aria-label",
				this.leftCollapsed ? "Expand workout sidebar" : "Collapse workout sidebar",
			);
		};
		syncCollapseIcon();
		collapseBtn.addEventListener("click", () => {
			this.leftCollapsed = !this.leftCollapsed;
			this.shellEl?.toggleClass("pulse-pm-left-collapsed", this.leftCollapsed);
			const split = this.contentEl.querySelector(".pulse-pm__split") as HTMLButtonElement | null;
			if (split) split.disabled = this.leftCollapsed;
			syncCollapseIcon();
		});

		bar.createDiv({ cls: "pulse-pm__glyph-spacer" });

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
			startW = this.sidebarScrollEl?.offsetWidth ?? 220;
			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
		});
	}
}

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ChiselPlugin from "../main";
import { DebtSidebar } from "./DebtSidebar";
import { PayoffMainContent } from "./PayoffMainContent";
import { DashboardMainContent } from "./DashboardMainContent";
import { DebtModal } from "../modals/DebtModal";

export const VIEW_TYPE_CHISEL_MAIN = "chisel-main-view";

const PM_LEFT_WIDTH_LS = "chisel-pm-left-col-px";
const PM_LEFT_MIN = 200;
const PM_MAIN_MIN = 280;
const PM_SPLIT_PX = 5;

export class ChiselMainView extends ItemView {
	private leftCollapsed = false;
	private leftWidthPx: number | null = ChiselMainView.readStoredLeftWidth();
	private pmEl: HTMLElement | null = null;
	private mainContent: PayoffMainContent | DashboardMainContent | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ChiselPlugin,
	) {
		super(leaf);
	}

	private static readStoredLeftWidth(): number | null {
		if (typeof localStorage === "undefined") return null;
		try {
			const s = localStorage.getItem(PM_LEFT_WIDTH_LS);
			if (!s) return null;
			const n = Number.parseInt(s, 10);
			if (!Number.isFinite(n) || n < PM_LEFT_MIN) return null;
			return n;
		} catch {
			return null;
		}
	}

	getViewType(): string {
		return VIEW_TYPE_CHISEL_MAIN;
	}

	getDisplayText(): string {
		return "Chisel";
	}

	getIcon(): string {
		return "landmark";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("chisel-view-root");
		this.render();
	}

	async onClose(): Promise<void> {
		this.mainContent?.destroy();
		this.mainContent = null;
	}

	private maxLeftColWidth(): number {
		if (!this.pmEl) return 720;
		const pmW = this.pmEl.getBoundingClientRect().width;
		return Math.max(PM_LEFT_MIN, pmW - PM_SPLIT_PX - PM_MAIN_MIN);
	}

	private clampLeftWidth(w: number): number {
		return Math.min(Math.max(Math.round(w), PM_LEFT_MIN), this.maxLeftColWidth());
	}

	private persistLeftWidth(w: number): void {
		try {
			localStorage.setItem(PM_LEFT_WIDTH_LS, String(w));
		} catch {
			/* private mode / quota */
		}
	}

	private onSplitPointerDown(ev: PointerEvent): void {
		if (this.leftCollapsed) return;
		const handle = ev.currentTarget as HTMLElement;
		ev.preventDefault();
		handle.setPointerCapture(ev.pointerId);
		const aside = this.pmEl?.querySelector(".chisel-pm__sidebar--left");
		const startW =
			aside instanceof HTMLElement ? aside.getBoundingClientRect().width : PM_LEFT_MIN;
		const startX = ev.clientX;

		const move = (e: PointerEvent): void => {
			this.leftWidthPx = this.clampLeftWidth(startW + (e.clientX - startX));
			if (this.pmEl && this.leftWidthPx != null) {
				this.pmEl.style.setProperty("--chisel-pm-left-w", `${this.leftWidthPx}px`);
			}
		};

		const up = (e: PointerEvent): void => {
			handle.releasePointerCapture(e.pointerId);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			if (this.leftWidthPx != null) this.persistLeftWidth(this.leftWidthPx);
		};

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	}

	private onSplitKeydown(ev: KeyboardEvent): void {
		if (this.leftCollapsed) return;
		if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
		ev.preventDefault();
		const aside = this.pmEl?.querySelector(".chisel-pm__sidebar--left");
		const cur =
			this.leftWidthPx ??
			(aside instanceof HTMLElement ? aside.getBoundingClientRect().width : 352);
		const step = ev.shiftKey ? 24 : 8;
		const delta = ev.key === "ArrowRight" ? step : -step;
		const next = this.clampLeftWidth(cur + delta);
		this.leftWidthPx = next;
		if (this.pmEl) this.pmEl.style.setProperty("--chisel-pm-left-w", `${next}px`);
		this.persistLeftWidth(next);
	}

	/** @internal */
	render(): void {
		this.mainContent?.destroy();
		this.mainContent = null;
		this.contentEl.empty();

		const shell = this.contentEl.createDiv({
			cls: `chisel-pm ${this.leftCollapsed ? "chisel-pm-left-collapsed" : ""}`,
		});
		this.pmEl = shell;
		if (!this.leftCollapsed && this.leftWidthPx != null) {
			shell.style.setProperty("--chisel-pm-left-w", `${this.leftWidthPx}px`);
		}

		const leftSidebar = shell.createDiv({ cls: "chisel-pm__sidebar chisel-pm__sidebar--left" });
		const leftStack = leftSidebar.createDiv({ cls: "chisel-pm__left-stack" });

		const glyphBar = leftStack.createDiv({
			cls: "chisel-pm__glyph-bar",
			attr: { role: "toolbar", "aria-label": "Debts sidebar" },
		});

		const collapseBtn = glyphBar.createEl("button", {
			cls: "chisel-pm__glyph-btn clickable-icon",
			type: "button",
			attr: {
				"aria-label": this.leftCollapsed ? "Expand debt list" : "Collapse debt list",
				title: this.leftCollapsed ? "Expand" : "Collapse",
			},
			text: this.leftCollapsed ? "›" : "‹",
		});
		collapseBtn.addEventListener("click", () => {
			this.leftCollapsed = !this.leftCollapsed;
			this.render();
		});

		glyphBar.createDiv({ cls: "chisel-pm__glyph-spacer", attr: { "aria-hidden": "true" } });

		const dashBtn = glyphBar.createEl("button", {
			cls: `chisel-pm__glyph-btn clickable-icon ${
				this.plugin.chiselViewState.mainMode === "dashboard" ? "chisel-pm__glyph-btn--active" : ""
			}`,
			type: "button",
			attr: { "aria-label": "Dashboard", title: "Dashboard" },
		});
		setIcon(dashBtn, "layout-dashboard");
		dashBtn.addEventListener("click", () => {
			this.plugin.chiselViewState.mainMode = "dashboard";
			this.plugin.chiselViewState.selectedDebtId = null;
			this.render();
		});

		const addBtn = glyphBar.createEl("button", {
			cls: "chisel-pm__glyph-btn clickable-icon",
			type: "button",
			attr: { "aria-label": "Add debt", title: "Add debt" },
		});
		setIcon(addBtn, "plus");
		addBtn.addEventListener("click", () => {
			new DebtModal(this.app, this.plugin, "add", null, () => this.render()).open();
		});

		const scrollArea = leftStack.createDiv({ cls: "chisel-pm__left-scroll" });
		const sidebar = new DebtSidebar(this.plugin, this);
		sidebar.render(scrollArea);

		const splitter = shell.createEl("button", {
			cls: "chisel-pm__split",
			type: "button",
			attr: { "aria-label": "Resize debt list. Drag or use arrow keys." },
		});
		splitter.disabled = this.leftCollapsed;
		splitter.addEventListener("pointerdown", (e) => this.onSplitPointerDown(e));
		splitter.addEventListener("keydown", (e) => this.onSplitKeydown(e));

		const mainArea = shell.createDiv({ cls: "chisel-pm__main" });
		const mainScroll = mainArea.createDiv({ cls: "chisel-main-scroll" });

		if (this.plugin.chiselViewState.mainMode === "dashboard") {
			this.mainContent = new DashboardMainContent(this.plugin, this);
		} else {
			this.mainContent = new PayoffMainContent(this.plugin, this);
		}
		this.mainContent.render(mainScroll);
	}
}

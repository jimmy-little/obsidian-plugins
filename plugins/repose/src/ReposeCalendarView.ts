import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { SvelteComponent } from "svelte";
import type ReposePlugin from "./main";
import ReposeCalendarMain from "./svelte/ReposeCalendarMain.svelte";

export const VIEW_TYPE_REPOSE_CALENDAR = "repose-calendar-view";

export type ReposeCalendarViewState = {
	/** YYYY-MM-DD */
	focalDateIso?: string;
};

function isValidLocalDateIso(iso: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
	const t = Date.parse(`${iso}T12:00:00`);
	return Number.isFinite(t);
}

function todayLocalISODate(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export class ReposeCalendarView extends ItemView {
	private component: SvelteComponent | null = null;
	focalDateIso: string;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReposePlugin,
	) {
		super(leaf);
		this.focalDateIso = todayLocalISODate();
	}

	getViewType(): string {
		return VIEW_TYPE_REPOSE_CALENDAR;
	}

	getDisplayText(): string {
		return "Repose calendar";
	}

	getIcon(): string {
		return "calendar";
	}

	getState(): ReposeCalendarViewState {
		return { focalDateIso: this.focalDateIso };
	}

	async setState(state: ReposeCalendarViewState, _result: ViewStateResult): Promise<void> {
		const iso = state?.focalDateIso?.trim();
		if (iso && isValidLocalDateIso(iso)) {
			this.focalDateIso = iso;
			this.component?.$set({ focalDateIso: this.focalDateIso });
		}
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.component = new ReposeCalendarMain({
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				hoverParentLeaf: this.leaf,
				focalDateIso: this.focalDateIso,
				onFocalIsoChange: (iso: string) => {
					if (!isValidLocalDateIso(iso)) return;
					this.focalDateIso = iso;
					void this.component?.$set({ focalDateIso: iso });
				},
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}

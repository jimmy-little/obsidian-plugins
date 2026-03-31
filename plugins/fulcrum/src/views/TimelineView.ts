import {ItemView, WorkspaceLeaf, type ViewStateResult} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_TIMELINE} from "../fulcrum/constants";
import {todayLocalISODate} from "../fulcrum/utils/dates";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import TimelineMain from "../svelte/TimelineMain.svelte";

export type TimelineViewState = {
	/** YYYY-MM-DD */
	focalDateIso?: string;
};

function isValidLocalDateIso(iso: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
	const t = Date.parse(iso + "T12:00:00");
	return Number.isFinite(t);
}

export class TimelineView extends ItemView {
	private readonly host: FulcrumHost;
	private component: SvelteComponent | null = null;
	/** YYYY-MM-DD, local calendar day */
	focalDateIso: string;

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
		this.focalDateIso = todayLocalISODate();
	}

	getViewType(): string {
		return VIEW_TIMELINE;
	}

	getDisplayText(): string {
		return "Timeline";
	}

	getIcon(): string {
		return "clock";
	}

	getState(): TimelineViewState {
		return {focalDateIso: this.focalDateIso};
	}

	async setState(state: TimelineViewState, _result: ViewStateResult): Promise<void> {
		const iso = state?.focalDateIso?.trim();
		if (iso && isValidLocalDateIso(iso)) {
			this.focalDateIso = iso;
			this.component?.$set({focalDateIso: this.focalDateIso});
		}
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.component = new TimelineMain({
			target: this.contentEl,
			props: {
				plugin: this.host,
				hoverParentLeaf: this.leaf,
				focalDateIso: this.focalDateIso,
				onFocalIsoChange: (iso: string) => {
					if (!isValidLocalDateIso(iso)) return;
					this.focalDateIso = iso;
					void this.component?.$set({focalDateIso: iso});
				},
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}

import { Modal, Platform } from "obsidian";
import type PulsePlugin from "../main";
import { WorkoutAppView } from "./WorkoutAppView";

export interface WorkoutModalOptions {
	startImmediately?: boolean;
}

export class WorkoutModal extends Modal {
	private view: WorkoutAppView | null = null;
	private plugin: PulsePlugin;
	private options: WorkoutModalOptions;

	constructor(app: import("obsidian").App, plugin: PulsePlugin, options?: WorkoutModalOptions) {
		super(app);
		this.plugin = plugin;
		this.options = options ?? {};
	}

	onOpen(): void {
		this.modalEl.addClass("pulse-workout-modal");
		if (Platform.isMobile) {
			this.modalEl.addClass("pulse-workout-modal-mobile");
		}
		this.contentEl.empty();
		this.view = new WorkoutAppView(this.contentEl, this.plugin, this.options);
		this.view.render();
	}

	onClose(): void {
		if (this.view) {
			this.view.destroy();
			this.view = null;
		}
	}
}

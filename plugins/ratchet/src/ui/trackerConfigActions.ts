import { ButtonComponent } from "obsidian";

export interface TrackerConfigActionsOptions {
	archived: boolean;
	isEdit: boolean;
	saveLabel?: string;
	onCancel: () => void;
	onSave: () => void | Promise<void>;
	onDelete?: () => void | Promise<void>;
	onArchive?: () => void | Promise<void>;
	onUnarchive?: () => void | Promise<void>;
}

/** Cancel / save group with optional archive + delete for existing trackers. */
export function appendTrackerConfigActions(
	container: HTMLElement,
	options: TrackerConfigActionsOptions,
): void {
	const actions = container.createDiv("ratchet-config-actions");

	if (options.isEdit) {
		if (options.archived) {
			new ButtonComponent(actions).setButtonText("Unarchive").onClick(() => {
				void options.onUnarchive?.();
			});
		} else {
			new ButtonComponent(actions).setButtonText("Archive").onClick(() => {
				void options.onArchive?.();
			});
		}

		new ButtonComponent(actions)
			.setButtonText("Delete")
			.setClass("ratchet-btn-delete")
			.onClick(() => {
				void options.onDelete?.();
			});
	}

	actions.createDiv({ cls: "ratchet-config-actions__spacer" });

	new ButtonComponent(actions).setButtonText("Cancel").onClick(options.onCancel);

	new ButtonComponent(actions)
		.setButtonText(options.saveLabel ?? (options.isEdit ? "Save" : "Create"))
		.setClass("mod-cta")
		.onClick(() => {
			void options.onSave();
		});
}

import { App, ButtonComponent, Modal, Setting } from "obsidian";
import type PulsePlugin from "../main";

export class WorkoutRenameModal extends Modal {
	private value: string;

	constructor(
		app: App,
		private readonly initialName: string,
		private readonly onSubmit: (name: string) => void | Promise<void>,
	) {
		super(app);
		this.value = initialName;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		titleEl.setText("Rename workout");

		new Setting(contentEl)
			.setName("Name")
			.setDesc("Shown in Pulse and stored in the workout note frontmatter.")
			.addText((text) =>
				text
					.setValue(this.value)
					.onChange((v) => {
						this.value = v;
					}),
			);

		const actions = contentEl.createDiv({ cls: "pulse-workout-modal-actions" });
		new ButtonComponent(actions).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(actions)
			.setButtonText("Save")
			.setCta()
			.onClick(() => {
				const trimmed = this.value.trim();
				if (!trimmed) return;
				void Promise.resolve(this.onSubmit(trimmed)).then(() => this.close());
			});
	}
}

export class WorkoutDeleteConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly workoutLabel: string,
		private readonly onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		titleEl.setText("Delete workout");

		contentEl.createEl("p", {
			text: `Move “${this.workoutLabel}” to the vault trash? This cannot be undone from Pulse.`,
		});

		const actions = contentEl.createDiv({ cls: "pulse-workout-modal-actions" });
		new ButtonComponent(actions).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(actions)
			.setButtonText("Delete")
			.setWarning()
			.onClick(() => {
				void Promise.resolve(this.onConfirm()).then(() => this.close());
			});
	}
}

export async function renameWorkoutDisplayName(
	plugin: PulsePlugin,
	path: string,
	newName: string,
	hasProgramDay: boolean,
): Promise<void> {
	const trimmed = newName.trim();
	if (!trimmed) return;
	await plugin.renameWorkout(path, trimmed, hasProgramDay);
}

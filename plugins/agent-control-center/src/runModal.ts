import { Modal, Notice, type App } from "obsidian";
import { missingRequiredInputs, defaultInputValues } from "./packet";
import type { SkillInputSpec, SkillInputValues, SkillMeta } from "./types";

export class RunSkillModal extends Modal {
	private values: SkillInputValues;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private skill: SkillMeta,
		private onRun: (values: SkillInputValues) => void,
	) {
		super(app);
		this.values = defaultInputValues(skill);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("acc-run-modal");
		contentEl.createEl("h2", { text: this.skill.label });
		if (this.skill.description) {
			contentEl.createEl("p", { text: this.skill.description, cls: "acc-desc" });
		}

		for (const spec of this.skill.inputs ?? []) {
			this.renderField(contentEl, spec);
		}

		this.errorEl = contentEl.createEl("p", { cls: "acc-missing" });
		this.errorEl.hide();

		const actions = contentEl.createDiv({ cls: "acc-actions" });
		const cancel = actions.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const run = actions.createEl("button", { text: "Run", cls: "mod-cta" });
		run.addEventListener("click", () => this.submit());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderField(parent: HTMLElement, spec: SkillInputSpec): void {
		const row = parent.createDiv({ cls: "acc-field" });
		row.createEl("label", { text: spec.label, attr: { for: `acc-${spec.key}` } });
		const current = this.values[spec.key];

		if (spec.type === "textarea") {
			const input = row.createEl("textarea", { attr: { id: `acc-${spec.key}` } });
			input.value = String(current ?? "");
			input.addEventListener("input", () => {
				this.values[spec.key] = input.value;
			});
			return;
		}

		if (spec.type === "select") {
			const input = row.createEl("select", { attr: { id: `acc-${spec.key}` } });
			for (const option of spec.options ?? []) {
				input.createEl("option", { text: option, value: option });
			}
			input.value = String(current ?? spec.options?.[0] ?? "");
			this.values[spec.key] = input.value;
			input.addEventListener("change", () => {
				this.values[spec.key] = input.value;
			});
			return;
		}

		if (spec.type === "boolean") {
			const input = row.createEl("input", { attr: { id: `acc-${spec.key}`, type: "checkbox" } });
			input.checked = current === true;
			input.addEventListener("change", () => {
				this.values[spec.key] = input.checked;
			});
			return;
		}

		const input = row.createEl("input", {
			attr: { id: `acc-${spec.key}`, type: spec.type === "date" ? "date" : "text" },
		});
		input.value = String(current ?? "");
		input.addEventListener("input", () => {
			this.values[spec.key] = input.value;
		});
	}

	private submit(): void {
		const missing = missingRequiredInputs(this.skill, this.values);
		if (missing.length) {
			if (this.errorEl) {
				this.errorEl.setText(`Fill in: ${missing.join(", ")}`);
				this.errorEl.show();
			}
			return;
		}
		this.close();
		this.onRun({ ...this.values });
	}
}

export function notifyLaunchError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	new Notice(message);
}

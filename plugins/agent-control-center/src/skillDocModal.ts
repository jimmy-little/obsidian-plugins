import { Component, MarkdownRenderer, Modal, type App } from "obsidian";
import { loadSkill } from "./skills";
import type { SkillMeta } from "./types";

export class SkillDocModal extends Modal {
	private component = new Component();

	constructor(
		app: App,
		private repoPath: string,
		private skill: SkillMeta,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("acc-doc-modal");
		contentEl.createEl("h2", { text: this.skill.label });
		const doc = contentEl.createDiv({ cls: "acc-doc markdown-preview-view" });
		this.component.load();
		try {
			const loaded = loadSkill(this.repoPath, this.skill);
			await MarkdownRenderer.render(this.app, loaded.body, doc, "", this.component);
		} catch (error) {
			doc.createEl("p", {
				text: error instanceof Error ? error.message : String(error),
				cls: "acc-missing",
			});
		}
	}

	onClose(): void {
		this.component.unload();
		this.contentEl.empty();
	}
}

import {
	App,
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	TFile,
} from "obsidian";
import {markProjectCompleteAndMove} from "./projectCompletion";
import {applyProjectStatusChange, getProjectStatusOptions} from "./projectStatusApply";
import {
	appendFulcrumProjectLog,
	formatFulcrumProjectLogLine,
	formatProjectReviewLogMessage,
	markProjectReviewDates,
} from "./projectNote";
import type {FulcrumHost} from "./pluginBridge";
import {parseList, resolveProjectsRoot} from "./settingsDefaults";
import type {IndexedProject} from "./types";

export class ProjectPickerModal extends FuzzySuggestModal<IndexedProject> {
	private readonly projects: IndexedProject[];
	private readonly onPick: (p: IndexedProject) => void;

	constructor(app: App, projects: IndexedProject[], onPick: (p: IndexedProject) => void) {
		super(app);
		this.projects = projects;
		this.onPick = onPick;
	}

	getItems(): IndexedProject[] {
		return this.projects;
	}

	getItemText(item: IndexedProject): string {
		return item.name;
	}

	onChooseItem(item: IndexedProject, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(item);
	}
}

export class NewProjectModal extends Modal {
	private name = "";
	private areaPath: string | null = null;
	private readonly host: FulcrumHost;

	constructor(app: App, host: FulcrumHost) {
		super(app);
		this.host = host;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "New project"});

		new Setting(contentEl)
			.setName("Name")
			.setDesc("Creates a note under your areas & projects folder.")
			.addText((t) =>
				t.onChange((v) => {
					this.name = v;
				}),
			);

		const areas = this.host.vaultIndex.getSnapshot().areas;
		if (areas.length > 0) {
			new Setting(contentEl).setName("Area").addDropdown((d) => {
				d.addOption("", "(none)");
				for (const a of areas) {
					d.addOption(a.file.path, a.name);
				}
				d.onChange((v) => {
					this.areaPath = v || null;
				});
			});
		}

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Create")
				.setCta()
				.onClick(() => {
					void this.create();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async create(): Promise<void> {
		const name = this.name.trim();
		if (!name) {
			new Notice("Enter a project name.");
			return;
		}
		const s = this.host.settings;
		const base = resolveProjectsRoot(s).replace(/\/+$/, "");
		const path = `${base}/${name}.md`;
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice("A note already exists at that path.");
			return;
		}

		let areaLink = "";
		if (this.areaPath) {
			const f = this.app.vault.getAbstractFileByPath(this.areaPath);
			if (f instanceof TFile) {
				const bn = f.basename.replace(/\.md$/i, "");
				areaLink = `[[${bn}]]`;
			}
		}

		const lines: string[] = [
			"---",
			`${s.typeField}: ${s.projectTypeValue}`,
			`name: ${JSON.stringify(name)}`,
		];
		if (areaLink) {
			lines.push(`${s.areaLinkField}: ${JSON.stringify(areaLink)}`);
		}
		lines.push("status: planning", `${s.taskPriorityField}: medium`, "---", "", `# ${name}`, "");

		const body = lines.join("\n");
		try {
			await this.app.vault.create(path, body);
			new Notice(`Created ${path}`);
			await this.host.vaultIndex.rebuild();
			await this.host.openProjectSummary(path);
			this.close();
		} catch (e) {
			console.error(e);
			new Notice("Could not create project note.");
		}
	}
}

export class LinkMeetingModal extends FuzzySuggestModal<IndexedProject> {
	private readonly file: TFile;
	private readonly host: FulcrumHost;

	constructor(app: App, host: FulcrumHost, file: TFile) {
		super(app);
		this.host = host;
		this.file = file;
	}

	getItems(): IndexedProject[] {
		return this.host.vaultIndex.getSnapshot().projects;
	}

	getItemText(item: IndexedProject): string {
		return item.name;
	}

	onChooseItem(item: IndexedProject, _evt: MouseEvent | KeyboardEvent): void {
		void this.applyMeetingLink(item);
	}

	private async applyMeetingLink(item: IndexedProject): Promise<void> {
		const s = this.host.settings;
		const bn = item.file.basename.replace(/\.md$/i, "");
		const value = `[[${bn}]]`;
		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm) => {
				(fm as Record<string, unknown>)[s.projectLinkField] = value;
			});
			new Notice(`Linked meeting to ${item.name}`);
			await this.host.vaultIndex.rebuild();
		} catch (e) {
			console.error(e);
			new Notice("Could not update frontmatter.");
		} finally {
			this.close();
		}
	}
}

/** Modal to capture title before appending a checkbox line to the project note. */
export class NewInlineTaskModal extends Modal {
	private titleValue = "";

	constructor(
		app: App,
		private readonly projectFile: TFile,
		private readonly taskTag: string,
		private readonly onSubmitTitle: (title: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "New task"});
		const tag = this.taskTag.trim() || "task";
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: `Adds an open task to the bottom of this project note with #${tag} and a wikilink to the project.`,
		});

		new Setting(contentEl)
			.setName("Title")
			.addText((t) => {
				t.setPlaceholder("What needs doing?");
				t.onChange((v) => {
					this.titleValue = v;
				});
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Add to project note")
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const t = this.titleValue.trim().replace(/\n/g, " ");
		if (!t) {
			new Notice("Enter a task title.");
			return;
		}
		this.close();
		this.onSubmitTitle(t);
	}
}

export class MarkReviewedModal extends Modal {
	private note = "";

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly projectPath: string,
		private readonly onComplete?: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Mark reviewed"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: "Updates last reviewed to today and sets the next review date using this project’s review frequency (or your default). An optional note is appended to the project log.",
		});

		new Setting(contentEl)
			.setName("Review note")
			.setDesc("Optional. Shown in the project log after the review line.")
			.addTextArea((ta) => {
				ta.setPlaceholder("e.g. priorities confirmed, no blockers");
				ta.inputEl.rows = 3;
				ta.onChange((v) => {
					this.note = v;
				});
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Mark reviewed")
				.setCta()
				.onClick(() => {
					void this.submit();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(this.projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		try {
			await markProjectReviewDates(this.app, f, this.host.settings);
			const logBody = formatFulcrumProjectLogLine(
				formatProjectReviewLogMessage(f.basename, this.note),
			);
			await appendFulcrumProjectLog(
				this.app,
				f,
				this.host.settings.projectLogSectionHeading,
				logBody,
			);
			await this.host.vaultIndex.rebuild();
			new Notice("Review dates updated and log entry added.");
			this.close();
			await this.onComplete?.();
		} catch (e) {
			console.error(e);
			new Notice("Could not mark reviewed or write the log.");
		}
	}
}

export class ChangeProjectStatusModal extends Modal {
	private selectedStatus: string | null = null;
	private setFrontmatter = true;
	private updateFolder: boolean;

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly projectPath: string,
		private readonly currentStatus: string,
		private readonly onComplete?: (newPath?: string) => void | Promise<void>,
	) {
		super(app);
		this.updateFolder =
			host.settings.projectStatusIndication === "subfolder" &&
			resolveProjectsRoot(host.settings).trim().length > 0;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Change project status"});

		const statusOptions = getProjectStatusOptions(this.app, this.host.settings);
		if (statusOptions.length === 0) {
			contentEl.createEl("p", {cls: "fulcrum-muted", text: "No statuses configured in settings."});
			new Setting(contentEl).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
			return;
		}

		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: "Choose a status, then confirm how to apply the change.",
		});

		new Setting(contentEl)
			.setName("Status")
			.addDropdown((d) => {
				d.addOption("", "(select)");
				for (const s of statusOptions) {
					const label = s.replace(/\b\w/g, (c) => c.toUpperCase());
					d.addOption(s, label);
				}
				d.onChange((v) => {
					this.selectedStatus = v || null;
					this.refreshConfirmSection();
				});
			});

		this.confirmSection = contentEl.createDiv({cls: "fulcrum-change-status-confirm"});
		this.refreshConfirmSection();
	}

	private confirmSection!: HTMLDivElement;

	private refreshConfirmSection(): void {
		this.confirmSection.empty();
		if (!this.selectedStatus) return;

		this.confirmSection.createEl("p", {
			text: `Change status to: ${this.selectedStatus.replace(/\b\w/g, (c) => c.toUpperCase())}`,
		});

		new Setting(this.confirmSection)
			.setName("Set frontmatter")
			.setDesc("Update the status field in the note's YAML frontmatter.")
			.addToggle((t) =>
				t.setValue(this.setFrontmatter).onChange((v) => {
					this.setFrontmatter = v;
				}),
			);

		const canUpdateFolder =
			this.host.settings.projectStatusIndication === "subfolder" &&
			resolveProjectsRoot(this.host.settings).trim().length > 0;
		if (canUpdateFolder) {
			new Setting(this.confirmSection)
				.setName("Update folder")
				.setDesc(
					"Move the note into the folder for this status (under your projects folder).",
				)
				.addToggle((t) =>
					t.setValue(this.updateFolder).onChange((v) => {
						this.updateFolder = v;
					}),
				);
		}

		new Setting(this.confirmSection).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(this.confirmSection).addButton((b) =>
			b
				.setButtonText("Confirm")
				.setCta()
				.onClick(() => {
					void this.submit();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (!this.selectedStatus) return;

		try {
			const newPath = await applyProjectStatusChange(
				this.app,
				this.host,
				this.projectPath,
				this.selectedStatus,
				{setFrontmatter: this.setFrontmatter, updateFolder: this.updateFolder},
			);
			this.close();
			await this.onComplete?.(newPath);
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not update project status.");
		}
	}
}

export class MarkProjectCompleteModal extends Modal {
	private note = "";

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly projectPath: string,
		private readonly onComplete?: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Mark project complete?"});
		const dest = this.host.settings.completedProjectsFolder.trim() || "(not set)";
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: `This sets the project’s status to your first “done” status (${this.doneStatusLabel()}) in frontmatter, appends a log line, and moves the note to: ${dest}`,
		});

		new Setting(contentEl)
			.setName("Completion note")
			.setDesc("Optional. Appended to the project log before the file is moved.")
			.addTextArea((ta) => {
				ta.setPlaceholder("e.g. shipped v1, handed off to ops");
				ta.inputEl.rows = 3;
				ta.onChange((v) => {
					this.note = v;
				});
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Yes, complete")
				.setCta()
				.onClick(() => {
					void this.submit();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private doneStatusLabel(): string {
		return parseList(this.host.settings.projectDoneStatuses)[0] ?? "completed";
	}

	private async submit(): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(this.projectPath);
		if (!(f instanceof TFile)) {
			new Notice("Project file not found.");
			return;
		}
		try {
			await this.host.archiveProjectSnapshot(this.projectPath);
			await markProjectCompleteAndMove(this.app, f, this.host.settings, {note: this.note});
			await this.host.vaultIndex.rebuild();
			await this.host.openDashboard();
			new Notice("Project marked complete and moved.");
			this.close();
			await this.onComplete?.();
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not complete project or move the file.");
		}
	}
}

export class QuickProjectNoteModal extends Modal {
	private text = "";

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly projectPath: string,
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Quick note"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: "Adds a timestamped line to this project’s Fulcrum log section (same as the project page quick note).",
		});

		new Setting(contentEl)
			.setName("Note")
			.addTextArea((ta) => {
				ta.setPlaceholder("e.g. called stakeholder — agreed to slip launch a week");
				ta.inputEl.rows = 4;
				ta.onChange((v) => {
					this.text = v;
				});
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Add to log")
				.setCta()
				.onClick(() => {
					void this.submit();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const trimmed = this.text.trim();
		if (!trimmed) {
			new Notice("Enter a note.");
			return;
		}
		const ok = await this.host.appendProjectLogEntry(this.projectPath, trimmed);
		if (ok) this.close();
	}
}

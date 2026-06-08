import {
	App,
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	TFile,
	TFolder,
	getAllTags,
} from "obsidian";
import {markProjectCompleteAndMove} from "./projectCompletion";
import {applyProjectStatusChange, getProjectStatusOptions} from "./projectStatusApply";
import {
	appendFulcrumProjectLog,
	formatFulcrumProjectLogLine,
	formatProjectReviewLogMessage,
	markProjectReviewDates,
} from "./projectNote";
import {appendProjectMilestone} from "./utils/projectMilestones";
import type {FulcrumHost} from "./pluginBridge";
import {parseList, parseTaskStatusChoices, resolveProjectsRoot} from "./settingsDefaults";
import type {IndexedProject, IndexedTask} from "./types";
import {todayLocalISODate} from "./utils/dates";
import {createTaskNoteFile, type CreateTaskNoteOptions} from "./createTaskNote";
import {presetRecurrence} from "./recurrence/recurrenceEngine";
import type {TaskReminderSpec} from "./types";

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

export class AddMilestoneModal extends Modal {
	private dateIso: string;
	private title = "";

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly projectPath: string,
		private readonly onComplete?: () => void | Promise<void>,
	) {
		super(app);
		this.dateIso = todayLocalISODate();
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Add milestone"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: `Appends a line under ${this.host.settings.projectMilestonesSectionHeading.trim() || "## Milestones"} in the project note.`,
		});

		new Setting(contentEl)
			.setName("Date")
			.addText((t) => {
				t.inputEl.type = "date";
				t.setValue(this.dateIso).onChange((v) => {
					this.dateIso = v.trim();
				});
			});

		new Setting(contentEl)
			.setName("Title")
			.setDesc("Shown on the gantt timeline as a diamond marker.")
			.addText((t) => {
				t.setPlaceholder("e.g. UAT begins");
				t.onChange((v) => {
					this.title = v;
				});
				window.setTimeout(() => t.inputEl.focus(), 0);
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Add milestone")
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
			await appendProjectMilestone(
				this.app,
				f,
				this.host.settings.projectMilestonesSectionHeading,
				this.dateIso,
				this.title,
			);
			await this.host.vaultIndex.rebuild();
			new Notice("Milestone added.");
			this.close();
			await this.onComplete?.();
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg.length < 120 ? msg : "Could not add milestone.");
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
					"Move the project note, or the whole same-named project folder and its files, into the folder for this status.",
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
			await this.host.notifyConduitProjectCompleted(this.projectPath);
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

export type TaskScheduleDateTimeResult = {
	dateIso: string;
	time: string | null;
};

/** Pick date and optional time for scheduling a task from the context menu. */
export class TaskScheduleDateTimeModal extends Modal {
	private dateIso: string;
	private timeValue: string;

	constructor(
		app: App,
		private readonly task: IndexedTask,
		private readonly onSubmit: (result: TaskScheduleDateTimeResult) => void | Promise<void>,
	) {
		super(app);
		const seed =
			task.scheduledDate?.trim() ||
			task.dueDate?.trim() ||
			todayLocalISODate();
		const datePart = seed.slice(0, 10);
		this.dateIso = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : todayLocalISODate();
		const timePart = seed.length > 10 ? seed.slice(11, 16) : "";
		this.timeValue = /^\d{2}:\d{2}$/.test(timePart) ? timePart : "";
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Schedule task"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: taskTitleForModal(this.task),
		});

		new Setting(contentEl)
			.setName("Date")
			.addText((t) => {
				t.inputEl.type = "date";
				t.setValue(this.dateIso);
				t.onChange((v) => {
					this.dateIso = v;
				});
			});

		new Setting(contentEl)
			.setName("Time (optional)")
			.setDesc("Leave empty for all-day.")
			.addText((t) => {
				t.inputEl.type = "time";
				t.setValue(this.timeValue);
				t.onChange((v) => {
					this.timeValue = v;
				});
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Set")
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
		const dateIso = this.dateIso.trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
			new Notice("Choose a valid date.");
			return;
		}
		const time = this.timeValue.trim();
		await this.onSubmit({
			dateIso,
			time: /^\d{2}:\d{2}$/.test(time) ? time : null,
		});
		this.close();
	}
}

function taskTitleForModal(task: IndexedTask): string {
	const t = task.title.trim();
	return t.length > 0 ? t : "Untitled task";
}

function splitTaskDateTime(iso: string | undefined): {date: string; time: string} {
	const init = iso?.trim() ?? "";
	const date = init.slice(0, 10);
	const tMatch = init.match(/T(\d{2}:\d{2})/);
	return {
		date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
		time: tMatch?.[1] ?? "",
	};
}

function combineTaskDateTime(date: string, time: string): string | null {
	const d = date.trim();
	if (!d) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
	const t = time.trim();
	return /^\d{2}:\d{2}$/.test(t) ? `${d}T${t}` : d;
}

function addNativeDateSetting(
	containerEl: HTMLElement,
	label: string,
	value: string,
	onChange: (next: string) => void,
	desc?: string,
): void {
	const row = new Setting(containerEl).setName(label);
	if (desc) row.setDesc(desc);
	row.addText((text) => {
		text.inputEl.type = "date";
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) text.setValue(value);
		text.onChange(onChange);
	});
}

function addNativeTimeSetting(
	containerEl: HTMLElement,
	label: string,
	value: string,
	onChange: (next: string) => void,
	desc?: string,
): void {
	const row = new Setting(containerEl).setName(label);
	if (desc) row.setDesc(desc);
	row.addText((text) => {
		text.inputEl.type = "time";
		if (/^\d{2}:\d{2}$/.test(value)) text.setValue(value);
		text.onChange(onChange);
	});
}

export function promptDeleteIndexedTask(app: App, task: IndexedTask): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value: boolean) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const modal = new Modal(app);
		modal.titleEl.setText("Delete task?");
		const content = modal.contentEl;
		content.empty();
		const label = taskTitleForModal(task);
		content.createEl("p", {
			text:
				task.source === "taskNote"
					? `Delete the task note “${label}”? This moves the file to Obsidian trash.`
					: `Remove “${label}” from ${task.file.basename}?`,
		});
		const row = content.createDiv({cls: "fulcrum-modal-button-row"});
		const cancelBtn = row.createEl("button", {text: "Cancel"});
		const deleteBtn = row.createEl("button", {text: "Delete", cls: "mod-warning"});
		cancelBtn.onclick = () => {
			finish(false);
			modal.close();
		};
		deleteBtn.onclick = () => {
			finish(true);
			modal.close();
		};
		modal.onClose = () => finish(false);
		modal.open();
	});
}

export interface CreateTaskNoteModalOptions {
	projectPath?: string;
	parentTask?: IndexedTask;
	onCreated?: (path: string) => void | Promise<void>;
}

/** Fulcrum-native task note creation (TaskNotes-compatible frontmatter). */
export class CreateTaskNoteModal extends Modal {
	private titleValue = "";
	private statusValue = "";
	private priorityValue = "";
	private dueDateValue = "";
	private dueTimeValue = "";
	private schedDateValue = "";
	private schedTimeValue = "";

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly opts: CreateTaskNoteModalOptions = {},
	) {
		super(app);
		const s = host.settings;
		const statuses = parseTaskStatusChoices(s);
		this.statusValue = statuses[0] ?? "todo";
		const priorities = parseList(s.priorities);
		this.priorityValue = priorities[1] ?? priorities[0] ?? "medium";
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.opts.parentTask ? "Create subtask" : "Create task note",
		});

		new Setting(contentEl)
			.setName("Title")
			.addText((t) => {
				t.setPlaceholder("What needs doing?");
				t.onChange((v) => {
					this.titleValue = v;
				});
			});

		new Setting(contentEl)
			.setName("Status")
			.addDropdown((d) => {
				for (const st of parseTaskStatusChoices(this.host.settings)) {
					d.addOption(st, st);
				}
				d.setValue(this.statusValue).onChange((v) => {
					this.statusValue = v;
				});
			});

		new Setting(contentEl)
			.setName("Priority")
			.addDropdown((d) => {
				d.addOption("", "(none)");
				for (const p of parseList(this.host.settings.priorities)) {
					d.addOption(p, p);
				}
				d.setValue(this.priorityValue).onChange((v) => {
					this.priorityValue = v;
				});
			});

		addNativeDateSetting(contentEl, "Due date", this.dueDateValue, (v) => {
			this.dueDateValue = v;
		});
		addNativeTimeSetting(
			contentEl,
			"Due time (optional)",
			this.dueTimeValue,
			(v) => {
				this.dueTimeValue = v;
			},
			"Leave empty for date-only.",
		);

		addNativeDateSetting(contentEl, "Scheduled date", this.schedDateValue, (v) => {
			this.schedDateValue = v;
		});
		addNativeTimeSetting(
			contentEl,
			"Scheduled time (optional)",
			this.schedTimeValue,
			(v) => {
				this.schedTimeValue = v;
			},
			"Leave empty for all-day.",
		);

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Create")
				.setCta()
				.onClick(() => void this.submit()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const title = this.titleValue.trim();
		if (!title) {
			new Notice("Enter a task title.");
			return;
		}
		const s = this.host.settings;
		const createOpts: CreateTaskNoteOptions = {
			title,
			status: this.statusValue,
			priority: this.priorityValue || undefined,
			dueDate: combineTaskDateTime(this.dueDateValue, this.dueTimeValue),
			scheduledDate: combineTaskDateTime(this.schedDateValue, this.schedTimeValue),
			tags: [s.taskTag.trim() || "task"],
		};

		if (this.opts.parentTask) {
			const bn = this.opts.parentTask.file.basename.replace(/\.md$/i, "");
			createOpts.parentTaskLink = `[[${bn}]]`;
		} else if (this.opts.projectPath) {
			const pf = this.app.vault.getAbstractFileByPath(this.opts.projectPath);
			if (pf instanceof TFile) {
				const lt =
					this.app.metadataCache.fileToLinktext(pf, pf.path, false) ??
					pf.basename.replace(/\.md$/i, "");
				createOpts.projectLinks = [`[[${lt}]]`];
			}
		}

		const file = await createTaskNoteFile(this.app, s, createOpts);
		if (!file) return;
		await this.host.refreshIndex();
		new Notice(`Created ${file.path}`);
		await this.opts.onCreated?.(file.path);
		this.close();
	}
}

export class TaskFieldDateModal extends Modal {
	private dateValue = "";
	private timeValue = "";

	constructor(
		app: App,
		private readonly label: string,
		private readonly initial: string | undefined,
		private readonly onSubmit: (iso: string | null) => void | Promise<void>,
	) {
		super(app);
		const parts = splitTaskDateTime(initial);
		this.dateValue = parts.date;
		this.timeValue = parts.time;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: this.label});
		addNativeDateSetting(contentEl, "Date", this.dateValue, (v) => {
			this.dateValue = v;
		});
		addNativeTimeSetting(
			contentEl,
			"Time (optional)",
			this.timeValue,
			(v) => {
				this.timeValue = v;
			},
			"Leave empty for all-day.",
		);
		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Clear").onClick(() => {
				void this.onSubmit(null);
				this.close();
			}),
		);
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => void this.save()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const iso = combineTaskDateTime(this.dateValue, this.timeValue);
		if (this.dateValue.trim() && iso === null) {
			new Notice("Choose a valid date.");
			return;
		}
		await this.onSubmit(iso);
		this.close();
	}
}

export class TaskRecurrenceModal extends Modal {
	private ruleValue = "";
	private anchor: "scheduled" | "done" = "scheduled";

	constructor(
		app: App,
		private readonly task: IndexedTask,
		private readonly onSubmit: (rule: string | null, anchor: "scheduled" | "done") => void | Promise<void>,
	) {
		super(app);
		this.ruleValue = task.recurrence ?? "";
		this.anchor = task.recurrenceAnchor ?? "scheduled";
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Recurrence"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: "RFC 5545 RRULE with DTSTART, or use presets below.",
		});
		new Setting(contentEl)
			.setName("RRULE")
			.addTextArea((t) => {
				t.setValue(this.ruleValue);
				t.onChange((v) => {
					this.ruleValue = v;
				});
			});
		new Setting(contentEl)
			.setName("Repeat from")
			.addDropdown((d) =>
				d
					.addOptions({scheduled: "Scheduled date", done: "Completion date"})
					.setValue(this.anchor)
					.onChange((v) => {
						this.anchor = v as "scheduled" | "done";
					}),
			);
		const presets = contentEl.createDiv({cls: "fulcrum-modal-button-row"});
		for (const [label, key] of [
			["Daily", "daily"],
			["Weekly", "weekly"],
			["Monthly", "monthly"],
		] as const) {
			presets.createEl("button", {text: label}).onclick = () => {
				const start =
					this.task.scheduledDate ?? this.task.dueDate ?? todayLocalISODate();
				this.ruleValue = presetRecurrence(key, start);
			};
		}
		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Clear recurrence").onClick(() => {
				void this.onSubmit(null, this.anchor);
				this.close();
			}),
		);
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					const r = this.ruleValue.trim();
					void this.onSubmit(r.length ? r : null, this.anchor);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class MoveTaskNoteModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly onPick: (folder: string) => void,
	) {
		super(app);
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
	}

	getItemText(item: TFolder): string {
		return item.path || "/";
	}

	onChooseItem(item: TFolder): void {
		this.onPick(item.path);
		this.close();
	}
}

export class MergeTaskNoteTargetModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly excludePath: string,
		private readonly onPick: (path: string) => void,
	) {
		super(app);
	}

	getItems(): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path !== this.excludePath);
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onPick(item.path);
		this.close();
	}
}

export class TaskReminderPresetModal extends Modal {
	constructor(
		app: App,
		private readonly onPick: (reminder: TaskReminderSpec) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Add reminder"});
		const presets: {label: string; spec: TaskReminderSpec}[] = [
			{
				label: "At scheduled time",
				spec: {type: "relative", anchor: "scheduled", offset: 0, unit: "minutes", direction: "before"},
			},
			{
				label: "1 day before due",
				spec: {type: "relative", anchor: "due", offset: 1, unit: "days", direction: "before"},
			},
			{
				label: "1 hour before scheduled",
				spec: {type: "relative", anchor: "scheduled", offset: 1, unit: "hours", direction: "before"},
			},
		];
		for (const p of presets) {
			new Setting(contentEl).setName(p.label).addButton((b) =>
				b.setButtonText("Add").onClick(() => {
					void this.onPick(p.spec);
					this.close();
				}),
			);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class EditTaskTitleModal extends Modal {
	private titleValue: string;

	constructor(
		app: App,
		initialTitle: string,
		private readonly onSubmit: (title: string) => void | Promise<void>,
	) {
		super(app);
		this.titleValue = initialTitle;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Edit task title"});
		new Setting(contentEl)
			.setName("Title")
			.addText((t) => {
				t.setValue(this.titleValue);
				t.onChange((v) => {
					this.titleValue = v;
				});
				window.setTimeout(() => t.inputEl.focus(), 0);
			});
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => void this.save()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const trimmed = this.titleValue.trim();
		if (!trimmed) {
			new Notice("Title is required.");
			return;
		}
		await this.onSubmit(trimmed);
		this.close();
	}
}

export class EditTaskTagsModal extends Modal {
	private tagsValue: string;

	constructor(
		app: App,
		initialTags: string[],
		private readonly onSubmit: (tags: string[]) => void | Promise<void>,
	) {
		super(app);
		this.tagsValue = initialTags.join(", ");
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Edit tags"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: "Comma-separated tags (without #). Use Suggest to pick from vault tags.",
		});
		new Setting(contentEl)
			.setName("Tags")
			.addText((t) => {
				t.setValue(this.tagsValue);
				t.onChange((v) => {
					this.tagsValue = v;
				});
			});
		const suggestBtn = contentEl.createEl("button", {text: "Suggest tag…", cls: "mod-cta"});
		suggestBtn.onclick = () => {
			const items = collectVaultTagNames(this.app);
			new TagSuggestModal(this.app, items, (tag) => {
				const parts = this.tagsValue
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				if (!parts.some((p) => p.toLowerCase() === tag.toLowerCase())) {
					parts.push(tag);
				}
				this.tagsValue = parts.join(", ");
			}).open();
		};
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => void this.save()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const tags = this.tagsValue
			.split(",")
			.map((s) => s.trim().replace(/^#/, ""))
			.filter(Boolean);
		await this.onSubmit(tags);
		this.close();
	}
}

class TagSuggestModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private readonly tags: string[],
		private readonly onPick: (tag: string) => void,
	) {
		super(app);
	}

	getItems(): string[] {
		return this.tags.sort((a, b) => a.localeCompare(b));
	}

	getItemText(item: string): string {
		return `#${item}`;
	}

	onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(item);
		this.close();
	}
}

function collectVaultTagNames(app: App): string[] {
	const tagSet = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		const tags = getAllTags(cache);
		if (!tags) continue;
		for (const t of tags) tagSet.add(t.replace(/^#/, ""));
	}
	return [...tagSet].sort((a, b) => a.localeCompare(b));
}

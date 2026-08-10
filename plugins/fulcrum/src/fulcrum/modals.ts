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
import {ensureFolderPath, markProjectCompleteAndMove} from "./projectCompletion";
import {applyProjectStatusChange, getProjectStatusOptions} from "./projectStatusApply";
import {resolveNewProjectPaths} from "./createProject";
import {
	appendFulcrumProjectLog,
	formatFulcrumProjectLogLine,
	formatProjectReviewLogMessage,
	markProjectReviewDates,
} from "./projectNote";
import {appendProjectMilestone} from "./utils/projectMilestones";
import type {FulcrumHost} from "./pluginBridge";
import {parseList, parseTaskStatusChoices, resolveProjectsRoot} from "./settingsDefaults";
import type {IndexedProject, IndexedTask, RecurrenceAnchorMode, TaskReminderSpec} from "./types";
import {todayLocalISODate} from "./utils/dates";
import {createTaskNoteFile, extractMarkdownBody, saveTaskNoteEdit, type CreateTaskNoteOptions} from "./createTaskNote";
import {computeNextOccurrences} from "./recurrence/recurrenceEngine";
import {
	buildRecurrenceRule,
	defaultRecurrenceUiState,
	describeRecurrenceUiState,
	parseMonthlyDaysInput,
	parseRecurrenceToUiState,
	weekdayLabelsOrdered,
	type MonthlyMode,
	type RecurrenceFreq,
	type RecurrenceUiState,
} from "./recurrence/recurrenceRuleBuilder";
import {
	joinCalendarIds,
	loadBridgeCalendarRows,
	parseCalendarIdList,
	renderCalendarIdPicker,
} from "../conduit/bridgeCalendarSettings";
import type {FulcrumSettings} from "./settingsDefaults";
import {
	scheduleNextWeekIso,
	scheduleThisWeekendIso,
	scheduleTodayIso,
	scheduleTomorrowIso,
} from "./taskSchedulePresets";

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
			.setDesc("Creates a project folder and note under your projects root (inside the status folder).")
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
		const paths = resolveNewProjectPaths(this.app.vault, s, name);
		if (!paths) {
			new Notice("Set a projects folder in Fulcrum settings.");
			return;
		}
		const path = paths.projectFilePath;
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice("A project already exists at that path.");
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
		lines.push(
			`status: ${paths.initialStatus}`,
			`${s.taskPriorityField}: medium`,
			"---",
			"",
			`# ${name}`,
			"",
		);

		const body = lines.join("\n");
		try {
			await ensureFolderPath(this.app.vault, paths.projectFolderPath);
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
			this.host.vaultIndex.cancelScheduledRebuild();
			this.host.vaultIndex.scheduleRebuild();
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

function createModalSection(
	container: HTMLElement,
	title: string,
	desc?: string,
): HTMLElement {
	const section = container.createDiv({cls: "fulcrum-create-task-note-modal__section"});
	section.createEl("div", {cls: "fulcrum-create-task-note-modal__section-title", text: title});
	if (desc) {
		section.createEl("p", {
			cls: "fulcrum-create-task-note-modal__section-desc",
			text: desc,
		});
	}
	return section.createDiv({cls: "fulcrum-create-task-note-modal__section-body"});
}

function addCompactFieldRow(
	body: HTMLElement,
	label: string,
	buildControl: (control: HTMLElement) => void,
	hint?: string,
): void {
	const row = body.createDiv({cls: "fulcrum-create-task-note-modal__field-row"});
	const labelCol = row.createDiv({cls: "fulcrum-create-task-note-modal__field-label"});
	labelCol.createSpan({text: label});
	if (hint) {
		labelCol.createEl("span", {cls: "fulcrum-create-task-note-modal__field-hint", text: hint});
	}
	buildControl(row.createDiv({cls: "fulcrum-create-task-note-modal__field-control"}));
}

function addCompactDateInput(
	control: HTMLElement,
	value: string,
	onChange: (v: string) => void,
): HTMLInputElement {
	const input = control.createEl("input", {
		type: "date",
		cls: "fulcrum-create-task-note-modal__input",
	});
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) input.value = value;
	input.addEventListener("change", () => onChange(input.value));
	return input;
}

function addCompactTimeInput(
	control: HTMLElement,
	value: string,
	onChange: (v: string) => void,
): HTMLInputElement {
	const input = control.createEl("input", {
		type: "time",
		cls: "fulcrum-create-task-note-modal__input",
	});
	if (/^\d{2}:\d{2}$/.test(value)) input.value = value;
	input.addEventListener("change", () => onChange(input.value));
	return input;
}

function addCompactTextInput(
	control: HTMLElement,
	value: string,
	placeholder: string,
	onChange: (v: string) => void,
): HTMLInputElement {
	const input = control.createEl("input", {
		type: "text",
		cls: "fulcrum-create-task-note-modal__input",
		attr: {placeholder},
	});
	input.value = value;
	input.addEventListener("input", () => onChange(input.value));
	return input;
}

function addCompactTextArea(
	control: HTMLElement,
	value: string,
	onChange: (v: string) => void,
): HTMLTextAreaElement {
	const area = control.createEl("textarea", {
		cls: "fulcrum-create-task-note-modal__input fulcrum-create-task-note-modal__input--area",
	});
	area.value = value;
	area.addEventListener("input", () => onChange(area.value));
	return area;
}

function addCompactDropdown(
	control: HTMLElement,
	options: Record<string, string>,
	value: string,
	onChange: (v: string) => void,
): HTMLSelectElement {
	const select = control.createEl("select", {cls: "fulcrum-create-task-note-modal__input"});
	for (const [optVal, label] of Object.entries(options)) {
		select.createEl("option", {value: optVal, text: label});
	}
	select.value = value;
	select.addEventListener("change", () => onChange(select.value));
	return select;
}

function renderDateTimeSection(
	container: HTMLElement,
	host: FulcrumHost,
	title: string,
	dateValue: string,
	timeValue: string,
	timeHint: string,
	onDateChange: (v: string) => void,
	onTimeChange: (v: string) => void,
	onPresetPick: (iso: string, dateInput: HTMLInputElement) => void,
): void {
	const body = createModalSection(container, title);
	const fields = body.createDiv({cls: "fulcrum-create-task-note-modal__datetime-fields"});

	const dateField = fields.createDiv({cls: "fulcrum-create-task-note-modal__datetime-field"});
	dateField.createEl("span", {
		cls: "fulcrum-create-task-note-modal__datetime-label",
		text: "Date",
	});
	const dateInput = addCompactDateInput(dateField, dateValue, onDateChange);

	const timeField = fields.createDiv({cls: "fulcrum-create-task-note-modal__datetime-field"});
	timeField.createEl("span", {
		cls: "fulcrum-create-task-note-modal__datetime-label",
		text: "Time",
	});
	addCompactTimeInput(timeField, timeValue, onTimeChange);
	timeField.createEl("span", {
		cls: "fulcrum-create-task-note-modal__field-hint",
		text: timeHint,
	});

	addDatePresetRow(body, host, (iso) => onPresetPick(iso, dateInput));
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

const CREATE_TASK_REMINDER_PRESETS: {label: string; spec: TaskReminderSpec}[] = [
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

function addDatePresetRow(
	container: HTMLElement,
	host: FulcrumHost,
	onPick: (iso: string) => void,
): void {
	const row = container.createDiv({cls: "fulcrum-create-task-note-modal__date-presets"});
	const presets: {title: string; iso: () => string}[] = [
		{title: "Today", iso: scheduleTodayIso},
		{title: "Tomorrow", iso: scheduleTomorrowIso},
		{title: "This weekend", iso: scheduleThisWeekendIso},
		{
			title: "Next week",
			iso: () => scheduleNextWeekIso(host.settings.calendarFirstDayOfWeek),
		},
	];
	for (const p of presets) {
		const btn = row.createEl("button", {text: p.title, type: "button"});
		btn.classList.add("fulcrum-create-task-note-modal__date-preset");
		btn.onclick = () => onPick(p.iso());
	}
}

function reminderSpecKey(spec: TaskReminderSpec): string {
	if (spec.type === "absolute") return `abs:${spec.date}:${spec.time ?? ""}`;
	return `${spec.type}:${spec.anchor}:${spec.offset}:${spec.unit}:${spec.direction}`;
}

export interface CreateTaskNoteModalOptions {
	projectPath?: string;
	parentTask?: IndexedTask;
	/** When set, modal edits an existing task note instead of creating one. */
	task?: IndexedTask;
	onCreated?: (path: string) => void | Promise<void>;
	/** Pre-fill scheduled date/time when creating from a project calendar cell. */
	calendarDatePreset?: {dateIso: string; hour: number | null};
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
	private notesValue = "";
	private projectPath: string | null = null;
	private recurrenceMode: "none" | RecurrenceFreq = "none";
	private recurrenceUiState: RecurrenceUiState;
	private recurrenceAnchor: RecurrenceAnchorMode = "scheduled";
	private recurrenceCustomRule = "";
	private reminders: TaskReminderSpec[] = [];
	private recurrencePanelEl!: HTMLElement;
	private recurrencePreviewEl!: HTMLElement;

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly opts: CreateTaskNoteModalOptions = {},
	) {
		super(app);
		const s = host.settings;
		const editTask = opts.task;
		if (editTask) {
			this.titleValue = editTask.title?.trim() || editTask.file.basename.replace(/\.md$/i, "");
			this.statusValue =
				editTask.status?.trim() || (parseTaskStatusChoices(s)[0] ?? "todo");
			this.priorityValue = editTask.priority?.trim() ?? "";
			const dueParts = splitTaskDateTime(editTask.dueDate);
			this.dueDateValue = dueParts.date;
			this.dueTimeValue = dueParts.time;
			const schedParts = splitTaskDateTime(editTask.scheduledDate);
			this.schedDateValue = schedParts.date;
			this.schedTimeValue = schedParts.time;
			this.projectPath = editTask.projectFile?.path ?? null;
			this.recurrenceAnchor = editTask.recurrenceAnchor ?? "scheduled";
			this.reminders = editTask.reminders ? [...editTask.reminders] : [];
			const startIso =
				editTask.scheduledDate?.slice(0, 10) ??
				editTask.dueDate?.slice(0, 10) ??
				todayLocalISODate();
			if (editTask.recurrence?.trim()) {
				const parsed = parseRecurrenceToUiState(editTask.recurrence, startIso);
				if (parsed) {
					this.recurrenceUiState = parsed;
					this.recurrenceMode = parsed.freq;
				} else {
					this.recurrenceMode = "custom";
					this.recurrenceCustomRule = editTask.recurrence;
					this.recurrenceUiState = defaultRecurrenceUiState("weekly", startIso);
				}
			} else {
				this.recurrenceUiState = defaultRecurrenceUiState("weekly", startIso);
			}
			return;
		}
		const statuses = parseTaskStatusChoices(s);
		this.statusValue = statuses[0] ?? "todo";
		const priorities = parseList(s.priorities);
		this.priorityValue = priorities[1] ?? priorities[0] ?? "medium";
		this.projectPath =
			opts.projectPath ??
			opts.parentTask?.projectFile?.path ??
			null;
		const preset = opts.calendarDatePreset;
		if (preset) {
			this.schedDateValue = preset.dateIso;
			if (preset.hour != null) {
				this.schedTimeValue = `${String(preset.hour).padStart(2, "0")}:00`;
			}
		}
		this.recurrenceUiState = defaultRecurrenceUiState("weekly");
	}

	private get isEditMode(): boolean {
		return !!this.opts.task;
	}

	onOpen(): void {
		const {contentEl, modalEl} = this;
		modalEl.addClass("fulcrum-create-task-note-modal-shell");
		contentEl.empty();
		contentEl.addClass("fulcrum-create-task-note-modal");

		contentEl.createEl("h2", {
			text: this.isEditMode
				? "Edit task"
				: this.opts.parentTask
					? "Create subtask"
					: "Create task note",
		});

		const columns = contentEl.createDiv({cls: "fulcrum-create-task-note-modal__columns"});
		const metaCol = columns.createDiv({cls: "fulcrum-create-task-note-modal__meta"});
		const notesCol = columns.createDiv({cls: "fulcrum-create-task-note-modal__notes"});

		new Setting(metaCol)
			.setName("Title")
			.addText((t) => {
				t.setPlaceholder("What needs doing?");
				if (this.titleValue) t.setValue(this.titleValue);
				t.onChange((v) => {
					this.titleValue = v;
				});
			});

		new Setting(metaCol)
			.setName("Status")
			.addDropdown((d) => {
				for (const st of parseTaskStatusChoices(this.host.settings)) {
					d.addOption(st, st);
				}
				d.setValue(this.statusValue).onChange((v) => {
					this.statusValue = v;
				});
			});

		new Setting(metaCol)
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

		this.renderProjectSetting(metaCol);

		renderDateTimeSection(
			metaCol,
			this.host,
			"Due date",
			this.dueDateValue,
			this.dueTimeValue,
			"Leave empty for date-only.",
			(v) => {
				this.dueDateValue = v;
			},
			(v) => {
				this.dueTimeValue = v;
			},
			(iso, dateInput) => {
				this.dueDateValue = iso;
				dateInput.value = iso;
			},
		);

		renderDateTimeSection(
			metaCol,
			this.host,
			"Scheduled date",
			this.schedDateValue,
			this.schedTimeValue,
			"Leave empty for all-day.",
			(v) => {
				this.schedDateValue = v;
				this.syncRecurrenceStart();
			},
			(v) => {
				this.schedTimeValue = v;
			},
			(iso, dateInput) => {
				this.schedDateValue = iso;
				dateInput.value = iso;
				this.syncRecurrenceStart();
			},
		);

		this.renderRemindersSetting(metaCol);
		this.renderRecurrenceSetting(metaCol);

		notesCol.createEl("label", {
			cls: "fulcrum-create-task-note-modal__notes-label",
			text: "Notes",
		});
		const notesArea = notesCol.createEl("textarea", {
			cls: "fulcrum-create-task-note-modal__notes-input",
			attr: {placeholder: "Task details, context, links…"},
		});
		notesArea.addEventListener("input", () => {
			this.notesValue = notesArea.value;
		});
		if (this.isEditMode) {
			void this.app.vault.read(this.opts.task!.file).then((raw) => {
				this.notesValue = extractMarkdownBody(raw);
				notesArea.value = this.notesValue;
			});
		}

		const actions = contentEl.createDiv({cls: "fulcrum-modal-actions"});
		actions.createEl("button", {text: "Cancel"}).onclick = () => this.close();
		actions.createEl("button", {text: this.isEditMode ? "Save" : "Create", cls: "mod-cta"}).onclick =
			() => void this.submit();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private recurrenceStartIso(): string {
		const sched = combineTaskDateTime(this.schedDateValue, this.schedTimeValue);
		if (sched) return sched.slice(0, 10);
		const due = combineTaskDateTime(this.dueDateValue, this.dueTimeValue);
		if (due) return due.slice(0, 10);
		return todayLocalISODate();
	}

	private syncRecurrenceStart(): void {
		const start = this.recurrenceStartIso();
		if (this.recurrenceUiState.freq === "weekly" && this.recurrenceUiState.weeklyDays.length === 0) {
			this.recurrenceUiState = defaultRecurrenceUiState("weekly", start);
		}
		this.refreshRecurrencePreview();
	}

	private renderProjectSetting(container: HTMLElement): void {
		const projects = this.host.vaultIndex.getSnapshot().projects;
		if (this.opts.parentTask) {
			new Setting(container)
				.setName("Parent task")
				.setDesc("Subtask will link to this task note.")
				.addText((t) => {
					const label =
						this.opts.parentTask!.title?.trim() ||
						this.opts.parentTask!.file.basename.replace(/\.md$/i, "");
					t.setValue(label).setDisabled(true);
				});
			return;
		}
		if (projects.length === 0) return;

		if (projects.length >= 20) {
			new Setting(container)
				.setName("Project")
				.addButton((b) => {
					const label = () => {
						if (!this.projectPath) return "(none)";
						const p = projects.find((x) => x.file.path === this.projectPath);
						return p?.name ?? this.projectPath;
					};
					b.setButtonText(label()).onClick(() => {
						new ProjectPickerModal(this.app, projects, (p) => {
							this.projectPath = p.file.path;
							b.setButtonText(label());
						}).open();
					});
				});
			return;
		}

		new Setting(container).setName("Project").addDropdown((d) => {
			d.addOption("", "(none)");
			for (const p of projects) {
				d.addOption(p.file.path, p.name);
			}
			if (this.projectPath) d.setValue(this.projectPath);
			d.onChange((v) => {
				this.projectPath = v || null;
			});
		});
	}

	private renderRemindersSetting(container: HTMLElement): void {
		const body = createModalSection(
			container,
			"Alerts",
			"Optional reminders (TaskNotes format).",
		);

		const list = body.createDiv({cls: "fulcrum-create-task-note-modal__reminder-list"});
		const renderList = () => {
			list.empty();
			if (this.reminders.length === 0) {
				list.createEl("p", {
					cls: "fulcrum-muted fulcrum-create-task-note-modal__reminder-empty",
					text: "No alerts set.",
				});
				return;
			}
			for (const spec of this.reminders) {
				const preset = CREATE_TASK_REMINDER_PRESETS.find(
					(p) => reminderSpecKey(p.spec) === reminderSpecKey(spec),
				);
				const row = list.createDiv({cls: "fulcrum-create-task-note-modal__reminder-row"});
				row.createSpan({
					text: preset?.label ?? "Custom reminder",
				});
				const remove = row.createEl("button", {text: "Remove", type: "button"});
				remove.onclick = () => {
					this.reminders = this.reminders.filter((r) => reminderSpecKey(r) !== reminderSpecKey(spec));
					renderList();
				};
			}
		};

		const presetRow = body.createDiv({cls: "fulcrum-create-task-note-modal__reminder-presets"});
		for (const preset of CREATE_TASK_REMINDER_PRESETS) {
			const btn = presetRow.createEl("button", {text: preset.label, type: "button"});
			btn.classList.add("fulcrum-create-task-note-modal__date-preset");
			btn.onclick = () => {
				const key = reminderSpecKey(preset.spec);
				if (this.reminders.some((r) => reminderSpecKey(r) === key)) return;
				this.reminders = [...this.reminders, preset.spec];
				renderList();
			};
		}
		const clearBtn = presetRow.createEl("button", {text: "Clear all", type: "button"});
		clearBtn.classList.add("fulcrum-create-task-note-modal__date-preset");
		clearBtn.onclick = () => {
			this.reminders = [];
			renderList();
		};
		renderList();
	}

	private renderRecurrenceSetting(container: HTMLElement): void {
		const body = createModalSection(container, "Recurrence");

		addCompactFieldRow(body, "Frequency", (control) => {
			addCompactDropdown(
				control,
				{
					none: "(none)",
					daily: "Daily",
					weekly: "Weekly",
					monthly: "Monthly",
					custom: "Custom (RRULE)",
				},
				this.recurrenceMode,
				(v) => {
					this.recurrenceMode = v as typeof this.recurrenceMode;
					if (v !== "none" && v !== "custom") {
						const freq = v as RecurrenceFreq;
						this.recurrenceUiState = {
							...defaultRecurrenceUiState(freq, this.recurrenceStartIso()),
							interval: this.recurrenceUiState.interval,
						};
						this.recurrenceUiState.freq = freq;
					}
					this.renderRecurrencePanel();
					this.refreshRecurrencePreview();
				},
			);
		});

		this.recurrencePanelEl = body.createDiv({cls: "fulcrum-recurrence-panel"});
		this.recurrencePreviewEl = body.createEl("p", {cls: "fulcrum-recurrence-preview"});
		this.renderRecurrencePanel();
		this.refreshRecurrencePreview();
	}

	private renderRecurrencePanel(): void {
		this.recurrencePanelEl.empty();
		if (this.recurrenceMode === "none") {
			this.recurrencePanelEl.toggleClass("fulcrum-hidden", true);
			return;
		}
		this.recurrencePanelEl.toggleClass("fulcrum-hidden", false);

		if (this.recurrenceMode === "custom") {
			addCompactFieldRow(this.recurrencePanelEl, "RRULE", (control) => {
				addCompactTextArea(control, this.recurrenceCustomRule, (v) => {
					this.recurrenceCustomRule = v;
					this.refreshRecurrencePreview();
				});
			});
		} else {
			const unit =
				this.recurrenceUiState.freq === "daily"
					? "day(s)"
					: this.recurrenceUiState.freq === "weekly"
						? "week(s)"
						: "month(s)";
			addCompactFieldRow(
				this.recurrencePanelEl,
				"Every",
				(control) => {
					addCompactTextInput(
						control,
						String(this.recurrenceUiState.interval),
						"1",
						(v) => {
							const n = Number.parseInt(v.trim(), 10);
							this.recurrenceUiState.interval =
								Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1;
							this.refreshRecurrencePreview();
						},
					);
				},
				`Repeat every N ${unit}.`,
			);

			if (this.recurrenceUiState.freq === "weekly") {
				const row = this.recurrencePanelEl.createDiv({cls: "fulcrum-recurrence-day-row"});
				for (const {dow, label} of weekdayLabelsOrdered(this.host.settings.calendarFirstDayOfWeek)) {
					const selected = this.recurrenceUiState.weeklyDays.includes(dow);
					const btn = row.createEl("button", {
						cls: `fulcrum-recurrence-day-toggle${selected ? " is-selected" : ""}`,
						text: label,
						type: "button",
					});
					btn.onclick = () => {
						const set = new Set(this.recurrenceUiState.weeklyDays);
						if (set.has(dow)) set.delete(dow);
						else set.add(dow);
						this.recurrenceUiState.weeklyDays = [...set];
						this.renderRecurrencePanel();
						this.refreshRecurrencePreview();
					};
				}
			}

			if (this.recurrenceUiState.freq === "monthly") {
				const monthlyOptions = Object.fromEntries(
					MONTHLY_MODE_OPTIONS.map((opt) => [opt.value, opt.label]),
				);
				addCompactFieldRow(this.recurrencePanelEl, "Monthly pattern", (control) => {
					addCompactDropdown(
						control,
						monthlyOptions,
						this.recurrenceUiState.monthlyMode,
						(v) => {
							this.recurrenceUiState.monthlyMode = v as MonthlyMode;
							this.renderRecurrencePanel();
							this.refreshRecurrencePreview();
						},
					);
				});

				if (this.recurrenceUiState.monthlyMode === "onDays") {
					addCompactFieldRow(this.recurrencePanelEl, "Day(s) of month", (control) => {
						addCompactTextInput(
							control,
							this.recurrenceUiState.monthlyDays,
							"15",
							(v) => {
								this.recurrenceUiState.monthlyDays = v;
								this.refreshRecurrencePreview();
							},
						);
					});
				}

				if (
					this.recurrenceUiState.monthlyMode === "firstWeekdayNamed" ||
					this.recurrenceUiState.monthlyMode === "lastWeekdayNamed"
				) {
					const row = this.recurrencePanelEl.createDiv({cls: "fulcrum-recurrence-day-row"});
					for (const {dow, label} of weekdayLabelsOrdered(this.host.settings.calendarFirstDayOfWeek)) {
						const selected = this.recurrenceUiState.monthlyWeekday === dow;
						const btn = row.createEl("button", {
							cls: `fulcrum-recurrence-day-toggle${selected ? " is-selected" : ""}`,
							text: label,
							type: "button",
						});
						btn.onclick = () => {
							this.recurrenceUiState.monthlyWeekday = dow;
							this.renderRecurrencePanel();
							this.refreshRecurrencePreview();
						};
					}
				}
			}
		}

		addCompactFieldRow(this.recurrencePanelEl, "Repeat from", (control) => {
			addCompactDropdown(
				control,
				{scheduled: "Scheduled date", done: "Completion date"},
				this.recurrenceAnchor,
				(v) => {
					this.recurrenceAnchor = v as RecurrenceAnchorMode;
				},
			);
		});
	}

	private refreshRecurrencePreview(): void {
		if (!this.recurrencePreviewEl) return;
		if (this.recurrenceMode === "none") {
			this.recurrencePreviewEl.setText("");
			return;
		}
		const rule = this.effectiveRecurrenceRule();
		if (!rule) {
			this.recurrencePreviewEl.setText("No recurrence");
			return;
		}
		const summary =
			this.recurrenceMode === "custom"
				? "Custom recurrence"
				: describeRecurrenceUiState(this.recurrenceUiState);
		const next = computeNextOccurrences(rule, this.recurrenceStartIso(), [], [], 3);
		const nextText = next.length > 0 ? next.join(", ") : "No upcoming dates";
		this.recurrencePreviewEl.setText(`${summary} · Next: ${nextText}`);
	}

	private effectiveRecurrenceRule(): string {
		if (this.recurrenceMode === "none") return "";
		if (this.recurrenceMode === "custom") return this.recurrenceCustomRule.trim();
		return buildRecurrenceRule(this.recurrenceUiState, this.recurrenceStartIso());
	}

	private async submit(): Promise<void> {
		const title = this.titleValue.trim();
		if (!title) {
			new Notice("Enter a task title.");
			return;
		}
		if (
			this.recurrenceMode === "weekly" &&
			this.recurrenceUiState.weeklyDays.length === 0
		) {
			new Notice("Select at least one weekday for weekly recurrence.");
			return;
		}
		if (
			this.recurrenceMode === "monthly" &&
			this.recurrenceUiState.monthlyMode === "onDays" &&
			parseMonthlyDaysInput(this.recurrenceUiState.monthlyDays).length === 0
		) {
			new Notice("Enter at least one day of the month (1–31) for monthly recurrence.");
			return;
		}

		const s = this.host.settings;
		const recurrenceRule = this.effectiveRecurrenceRule();
		const createOpts: CreateTaskNoteOptions = {
			title,
			status: this.statusValue,
			priority: this.priorityValue || undefined,
			dueDate: combineTaskDateTime(this.dueDateValue, this.dueTimeValue),
			scheduledDate: combineTaskDateTime(this.schedDateValue, this.schedTimeValue),
			bodyContent: this.notesValue,
			reminders: this.reminders.length > 0 ? this.reminders : undefined,
			recurrence: recurrenceRule || undefined,
			recurrenceAnchor: recurrenceRule ? this.recurrenceAnchor : undefined,
		};

		if (this.isEditMode && this.opts.task) {
			const ok = await saveTaskNoteEdit(
				this.app,
				s,
				this.opts.task,
				createOpts,
				this.projectPath,
			);
			if (!ok) return;
			await this.host.refreshIndex();
			new Notice("Task saved.");
			this.close();
			return;
		}

		createOpts.tags = [s.taskTag.trim() || "task"];

		if (this.opts.parentTask) {
			const bn = this.opts.parentTask.file.basename.replace(/\.md$/i, "");
			createOpts.parentTaskLink = `[[${bn}]]`;
			if (this.opts.parentTask.projectFile) {
				const pf = this.opts.parentTask.projectFile;
				const lt =
					this.app.metadataCache.fileToLinktext(pf, pf.path, false) ??
					pf.basename.replace(/\.md$/i, "");
				createOpts.projectLinks = [`[[${lt}]]`];
			}
		} else if (this.projectPath) {
			const pf = this.app.vault.getAbstractFileByPath(this.projectPath);
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
		contentEl.addClass("fulcrum-task-field-date-modal");
		this.titleEl.setText(this.label);

		const fields = contentEl.createDiv({cls: "fulcrum-task-field-date-modal__fields"});
		const dateField = fields.createDiv({cls: "fulcrum-task-field-date-modal__field"});
		dateField.createEl("span", {text: "Date", cls: "fulcrum-task-field-date-modal__label"});
		const dateInput = dateField.createEl("input", {type: "date", cls: "fulcrum-task-field-date-modal__input"});
		if (/^\d{4}-\d{2}-\d{2}$/.test(this.dateValue)) dateInput.value = this.dateValue;
		dateInput.addEventListener("change", () => {
			this.dateValue = dateInput.value;
		});

		const timeField = fields.createDiv({cls: "fulcrum-task-field-date-modal__field"});
		timeField.createEl("span", {text: "Time", cls: "fulcrum-task-field-date-modal__label"});
		const timeInput = timeField.createEl("input", {type: "time", cls: "fulcrum-task-field-date-modal__input"});
		if (/^\d{2}:\d{2}$/.test(this.timeValue)) timeInput.value = this.timeValue;
		timeInput.addEventListener("change", () => {
			this.timeValue = timeInput.value;
		});

		contentEl.createEl("p", {
			text: "Leave time empty for all-day.",
			cls: "fulcrum-modal-hint fulcrum-task-field-date-modal__hint",
		});

		const row = contentEl.createDiv({cls: "fulcrum-modal-button-row"});
		const clearBtn = row.createEl("button", {text: "Clear"});
		const saveBtn = row.createEl("button", {text: "Save", cls: "mod-cta"});
		clearBtn.onclick = () => {
			void this.onSubmit(null);
			this.close();
		};
		saveBtn.onclick = () => void this.save();
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

const MONTHLY_MODE_OPTIONS: {value: MonthlyMode; label: string}[] = [
	{value: "onDays", label: "On day(s) of month"},
	{value: "firstDay", label: "First day of month"},
	{value: "lastDay", label: "Last day of month"},
	{value: "firstWeekday", label: "First weekday of month"},
	{value: "lastWeekday", label: "Last weekday of month"},
	{value: "firstWeekdayNamed", label: "First weekday (pick day)"},
	{value: "lastWeekdayNamed", label: "Last weekday (pick day)"},
];

export class TaskRecurrenceModal extends Modal {
	private anchor: "scheduled" | "done" = "scheduled";
	private uiState: RecurrenceUiState;
	private customMode = false;
	private ruleValue = "";
	private panelEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private ruleAreaEl!: HTMLTextAreaElement;
	private monthlyWeekdayRow!: HTMLElement;
	private monthlyDaysRow!: HTMLElement;

	constructor(
		app: App,
		private readonly task: IndexedTask,
		private readonly settings: FulcrumSettings,
		private readonly onSubmit: (rule: string | null, anchor: "scheduled" | "done") => void | Promise<void>,
		private readonly initialFreq?: RecurrenceFreq,
	) {
		super(app);
		this.anchor = task.recurrenceAnchor ?? "scheduled";
		const startIso = task.scheduledDate ?? task.dueDate ?? todayLocalISODate();
		const parsed = task.recurrence?.trim()
			? parseRecurrenceToUiState(task.recurrence, startIso)
			: null;
		if (parsed) {
			this.uiState = parsed;
			this.ruleValue = task.recurrence ?? "";
		} else if (task.recurrence?.trim()) {
			this.customMode = true;
			this.ruleValue = task.recurrence;
			this.uiState = defaultRecurrenceUiState(initialFreq ?? "weekly", startIso);
		} else {
			this.uiState = defaultRecurrenceUiState(initialFreq ?? "weekly", startIso);
			this.ruleValue = buildRecurrenceRule(this.uiState, startIso);
		}
	}

	private startIso(): string {
		return this.task.scheduledDate ?? this.task.dueDate ?? todayLocalISODate();
	}

	private effectiveRule(): string {
		if (this.customMode) return this.ruleValue.trim();
		return buildRecurrenceRule(this.uiState, this.startIso());
	}

	private syncRuleFromUi(): void {
		if (!this.customMode) {
			this.ruleValue = buildRecurrenceRule(this.uiState, this.startIso());
			if (this.ruleAreaEl) this.ruleAreaEl.value = this.ruleValue;
		}
		this.refreshPreview();
	}

	private refreshPreview(): void {
		if (!this.previewEl) return;
		const rule = this.effectiveRule();
		if (!rule) {
			this.previewEl.setText("No recurrence");
			return;
		}
		const summary = this.customMode
			? "Custom recurrence"
			: describeRecurrenceUiState(this.uiState);
		const next = computeNextOccurrences(
			rule,
			this.startIso(),
			this.task.completeInstances ?? [],
			this.task.skippedInstances ?? [],
			3,
		);
		const nextText = next.length > 0 ? next.join(", ") : "No upcoming dates";
		this.previewEl.setText(`${summary} · Next: ${nextText}`);
	}

	private renderFreqPanel(): void {
		this.panelEl.empty();
		if (this.customMode) return;

		if (this.uiState.freq !== "custom") {
			const unit =
				this.uiState.freq === "daily"
					? "day(s)"
					: this.uiState.freq === "weekly"
						? "week(s)"
						: "month(s)";
			new Setting(this.panelEl)
				.setName("Every")
				.setDesc(`Repeat every N ${unit}.`)
				.addText((t) =>
					t
						.setPlaceholder("1")
						.setValue(String(this.uiState.interval))
						.onChange((v) => {
							const n = Number.parseInt(v.trim(), 10);
							this.uiState.interval = Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1;
							this.syncRuleFromUi();
						}),
				);
		}

		if (this.uiState.freq === "weekly") {
			const row = this.panelEl.createDiv({cls: "fulcrum-recurrence-day-row"});
			for (const {dow, label} of weekdayLabelsOrdered(this.settings.calendarFirstDayOfWeek)) {
				const selected = this.uiState.weeklyDays.includes(dow);
				const btn = row.createEl("button", {
					cls: `fulcrum-recurrence-day-toggle${selected ? " is-selected" : ""}`,
					text: label,
					type: "button",
				});
				btn.onclick = () => {
					const set = new Set(this.uiState.weeklyDays);
					if (set.has(dow)) set.delete(dow);
					else set.add(dow);
					this.uiState.weeklyDays = [...set];
					this.syncRuleFromUi();
					this.renderFreqPanel();
				};
			}
		}

		if (this.uiState.freq === "monthly") {
			new Setting(this.panelEl)
				.setName("Monthly pattern")
				.addDropdown((d) => {
					for (const opt of MONTHLY_MODE_OPTIONS) {
						d.addOption(opt.value, opt.label);
					}
					d.setValue(this.uiState.monthlyMode);
					d.onChange((v) => {
						this.uiState.monthlyMode = v as MonthlyMode;
						this.updateMonthlyPanelVisibility();
						this.syncRuleFromUi();
					});
				});

			this.monthlyDaysRow = this.panelEl.createDiv({cls: "fulcrum-recurrence-monthly-days"});
			new Setting(this.monthlyDaysRow)
				.setName("Day(s) of month")
				.setDesc("Calendar day(s) 1–31. Comma-separated for multiple (e.g. 15, 30).")
				.addText((t) =>
					t
						.setPlaceholder("15")
						.setValue(this.uiState.monthlyDays)
						.onChange((v) => {
							this.uiState.monthlyDays = v;
							this.syncRuleFromUi();
						}),
				);

			this.monthlyWeekdayRow = this.panelEl.createDiv({cls: "fulcrum-recurrence-day-row"});
			for (const {dow, label} of weekdayLabelsOrdered(this.settings.calendarFirstDayOfWeek)) {
				const selected = this.uiState.monthlyWeekday === dow;
				const btn = this.monthlyWeekdayRow.createEl("button", {
					cls: `fulcrum-recurrence-day-toggle${selected ? " is-selected" : ""}`,
					text: label,
					type: "button",
				});
				btn.onclick = () => {
					this.uiState.monthlyWeekday = dow;
					this.syncRuleFromUi();
					this.renderFreqPanel();
				};
			}

			this.updateMonthlyPanelVisibility();
		}
	}

	private updateMonthlyPanelVisibility(): void {
		if (!this.monthlyDaysRow || !this.monthlyWeekdayRow) return;
		const showNamed =
			this.uiState.monthlyMode === "firstWeekdayNamed" ||
			this.uiState.monthlyMode === "lastWeekdayNamed";
		this.monthlyDaysRow.toggleClass("fulcrum-hidden", this.uiState.monthlyMode !== "onDays");
		this.monthlyWeekdayRow.toggleClass("fulcrum-hidden", !showNamed);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("fulcrum-recurrence-modal");
		contentEl.createEl("h2", {text: "Recurrence"});
		const taskTitle = this.task.title?.trim() || this.task.file.basename.replace(/\.md$/i, "");
		contentEl.createEl("p", {cls: "fulcrum-recurrence-task-name", text: taskTitle});

		new Setting(contentEl)
			.setName("Frequency")
			.addDropdown((d) => {
				d.addOptions({
					daily: "Daily",
					weekly: "Weekly",
					monthly: "Monthly",
					custom: "Custom (RRULE)",
				});
				d.setValue(this.customMode ? "custom" : this.uiState.freq);
				d.onChange((v) => {
					if (v === "custom") {
						this.customMode = true;
						this.renderFreqPanel();
						this.syncRuleFromUi();
						return;
					}
					this.customMode = false;
					this.uiState.freq = v as RecurrenceFreq;
					if (v === "weekly" && this.uiState.weeklyDays.length === 0) {
						this.uiState = defaultRecurrenceUiState("weekly", this.startIso());
					}
					this.renderFreqPanel();
					this.syncRuleFromUi();
				});
			});

		this.panelEl = contentEl.createDiv({cls: "fulcrum-recurrence-panel"});
		this.renderFreqPanel();

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

		this.previewEl = contentEl.createEl("p", {cls: "fulcrum-recurrence-preview"});

		if (!this.customMode) {
			this.syncRuleFromUi();
		} else {
			this.refreshPreview();
		}

		new Setting(contentEl)
			.setName("RRULE")
			.setDesc("Advanced: edit directly or switch to Custom frequency.")
			.addTextArea((t) => {
				this.ruleAreaEl = t.inputEl;
				t.setValue(this.ruleValue);
				t.onChange((v) => {
					this.ruleValue = v;
					this.refreshPreview();
				});
			});

		const actions = contentEl.createDiv({cls: "fulcrum-modal-actions"});
		actions.createEl("button", {text: "Clear recurrence"}).onclick = () => {
			void this.onSubmit(null, this.anchor);
			this.close();
		};
		actions.createEl("button", {text: "Save", cls: "mod-cta"}).onclick = () => {
			if (!this.customMode && this.uiState.freq === "weekly" && this.uiState.weeklyDays.length === 0) {
				new Notice("Select at least one weekday.");
				return;
			}
			if (
				!this.customMode &&
				this.uiState.freq === "monthly" &&
				this.uiState.monthlyMode === "onDays" &&
				parseMonthlyDaysInput(this.uiState.monthlyDays).length === 0
			) {
				new Notice("Enter at least one day of the month (1–31).");
				return;
			}
			const r = this.effectiveRule();
			void this.onSubmit(r.length ? r : null, this.anchor);
			this.close();
		};
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

export class TasksForecastSettingsModal extends Modal {
	private showVaultMeetings: boolean;
	private showSystemCalendars: boolean;
	private selectedIds = new Set<string>();

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly onSaved?: () => void,
	) {
		super(app);
		this.showVaultMeetings = host.settings.forecastShowVaultMeetings;
		this.showSystemCalendars = host.settings.forecastShowSystemCalendars;
		this.selectedIds = parseCalendarIdList(host.settings.forecastCalendarIds);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Horizon display"});

		new Setting(contentEl)
			.setName("Show vault meeting notes")
			.setDesc("Read-only meeting rows from your meetings folder in the day-grouped list.")
			.addToggle((t) =>
				t.setValue(this.showVaultMeetings).onChange((v) => {
					this.showVaultMeetings = v;
				}),
			);

		new Setting(contentEl)
			.setName("Show system calendars")
			.setDesc("Read-only events from macOS calendars via Fulcrum Bridge.")
			.addToggle((t) =>
				t.setValue(this.showSystemCalendars).onChange((v) => {
					this.showSystemCalendars = v;
				}),
			);

		contentEl.createEl("p", {
			cls: "fulcrum-settings-lead",
			text: "Calendars to show in Horizon. The same list is under Settings → Integrations → Calendar integration.",
		});

		void this.loadCalendars(contentEl);

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Save")
				.setCta()
				.onClick(() => void this.save()),
		);
	}

	private async loadCalendars(containerEl: HTMLElement): Promise<void> {
		const listEl = containerEl.createDiv({cls: "fulcrum-forecast-settings-calendars"});
		listEl.createEl("p", {text: "Loading calendars…", cls: "fulcrum-muted"});

		const {rows, error} = await loadBridgeCalendarRows(this.host);
		listEl.empty();

		if (error) {
			listEl.createEl("p", {text: error, cls: "fulcrum-muted"});
		}

		renderCalendarIdPicker(listEl, {
			sectionTitle: "",
			rows,
			selectedIds: this.selectedIds,
			onToggle: (ids) => {
				this.selectedIds = ids;
			},
		});
	}

	private async save(): Promise<void> {
		const forecastCalendarIds = joinCalendarIds(this.selectedIds);
		await this.host.patchSettings({
			forecastShowVaultMeetings: this.showVaultMeetings,
			forecastShowSystemCalendars: this.showSystemCalendars,
			forecastCalendarIds,
		});
		this.onSaved?.();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
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

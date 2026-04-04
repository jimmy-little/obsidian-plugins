import { ItemView, WorkspaceLeaf, Setting, TextComponent, ButtonComponent } from "obsidian";
import type RatchetPlugin from "../main";
import type { DataManager } from "../data/DataManager";
import type { TrackerConfig, GoalType, ResetPeriod } from "../data/TrackerConfig";
import { createTracker, makeTrackerId, DEFAULT_TRACKER_COLOR } from "../data/TrackerConfig";
import { renderTrackerCard } from "./TrackerCard";

export const VIEW_TYPE_RATCHET_MAIN = "ratchet-main-view";

const RESET_OPTIONS: { value: ResetPeriod; label: string }[] = [
	{ value: "never", label: "Never" },
	{ value: "daily", label: "Daily" },
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "yearly", label: "Yearly" },
];

const GOAL_TYPE_OPTIONS: { value: GoalType; label: string; desc: string }[] = [
	{ value: "at least", label: "At least", desc: "Reach a minimum (e.g. 3 cups, close rings)" },
	{ value: "at most", label: "At most", desc: "Stay at or below a cap (e.g. 0 drinks)" },
	{ value: "none", label: "No goal", desc: "Just count" },
];

const PRESET_COLORS = [
	"#7c3aed",
	"#2563eb",
	"#059669",
	"#ca8a04",
	"#dc2626",
	"#db2777",
	"#7c2d12",
	"#1e293b",
	"#64748b",
	"#0f172a",
];

export class RatchetMainView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: RatchetPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RATCHET_MAIN;
	}

	getDisplayText(): string {
		return "Ratchet";
	}

	getIcon(): string {
		return "tally-5";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {}

	render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass("ratchet-main-view");

		const scroll = container.createDiv("ratchet-main-scroll");
		const content = scroll.createDiv("ratchet-main-content");

		// Title
		content.createEl("h1", { text: "Ratchet" });

		// Grid: trackers + New button
		const grid = content.createDiv("ratchet-main-grid");
		const dm = this.plugin.getDataManager();
		const selectedId = this.plugin.ratchetViewState.selectedId;

		void (async () => {
			const trackers = await dm.getAllTrackers();
			for (const tracker of trackers) {
				const cardWrap = grid.createDiv("ratchet-card-wrap");
				renderTrackerCard(cardWrap, {
					tracker,
					dataManager: dm,
					onIncrement: () => this.render(),
					onOpenDetail: (t: TrackerConfig) => {
						this.plugin.ratchetViewState.selectedId = t.id;
						this.render();
					},
				});
			}
			// New tracker card
			const newWrap = grid.createDiv("ratchet-card-wrap");
			const newCard = newWrap.createDiv("ratchet-card ratchet-card-new");
			newCard.createDiv("ratchet-card-new-inner").createEl("span", { text: "+ New tracker" });
			newCard.addEventListener("click", () => {
				this.plugin.ratchetViewState.selectedId = "new";
				this.render();
			});

			// Edit form below when something is selected
			if (selectedId) {
				const formSection = content.createDiv("ratchet-main-form-section");
				formSection.createEl("h2", {
					text: selectedId === "new" ? "New tracker" : "Edit tracker",
				});
				this.renderTrackerForm(formSection, selectedId);
			}
		})();
	}

	private renderTrackerForm(container: HTMLElement, selectedId: string): void {
		const isEdit = selectedId !== "new";
		const dm = this.plugin.getDataManager();

		let name = "";
		let icon = "📌";
		let color = DEFAULT_TRACKER_COLOR;
		let resetPeriod: ResetPeriod = "daily";
		let goalType: GoalType = "at least";
		let goal = 0;
		let unit = "";
		const incrementButtons = [...this.plugin.settings.defaultIncrementButtons];

		const loadTracker = async (): Promise<void> => {
			if (!isEdit) return;
			const t = await dm.getTracker(selectedId);
			if (t) {
				name = t.name;
				icon = t.icon;
				color = t.color || DEFAULT_TRACKER_COLOR;
				resetPeriod = t.resetPeriod;
				goalType = t.goalType ?? "at least";
				goal = t.goal;
				unit = t.unit ?? "";
				incrementButtons.length = 0;
				incrementButtons.push(...t.incrementButtons);
			}
		};

		void (async () => {
			await loadTracker();

			const form = container.createDiv("ratchet-main-form");

			const nameSetting = new Setting(form)
				.setName("Name")
				.setDesc("Display name for the tracker")
				.addText((text: TextComponent) =>
					text.setPlaceholder("e.g. Coffee").setValue(name).onChange((v) => {
						name = v;
						updateIdHint(v);
					}),
				);
			const idHintEl = nameSetting.controlEl.createDiv("ratchet-tracker-id-hint");
			idHintEl.createSpan({ text: "Widget id: ", cls: "ratchet-tracker-id-label" });
			const idHintValue = idHintEl.createSpan("ratchet-tracker-id-value");
			const updateIdHint = (val: string) => {
				idHintValue.textContent = isEdit ? selectedId : makeTrackerId(val.trim()) || "—";
			};
			updateIdHint(name);

			new Setting(form)
				.setName("Icon")
				.setDesc("Emoji or character")
				.addText((text: TextComponent) =>
					text.setPlaceholder("📌").setValue(icon).onChange((v) => (icon = v || "📌")),
				);

			const colorSetting = new Setting(form)
				.setName("Color")
				.setDesc("Hex (e.g. #7c3aed) or pick below");
			let controlTextRef: TextComponent | null = null;
			colorSetting.addText((text: TextComponent) => {
				controlTextRef = text;
				text.setPlaceholder("#7c3aed").setValue(color).onChange((v) => {
					if (/^#[0-9A-Fa-f]{3,8}$/.test(v) || v === "") color = v || DEFAULT_TRACKER_COLOR;
				});
			});
			const colorRow = form.createDiv("ratchet-config-color-row");
			const picker = colorRow.createEl("input", { type: "color" });
			picker.value = color.startsWith("#") && color.length >= 7 ? color : DEFAULT_TRACKER_COLOR;
			picker.addEventListener("input", () => {
				color = picker.value;
				controlTextRef?.setValue(color);
			});
			const presets = colorRow.createDiv("ratchet-config-color-presets");
			for (const c of PRESET_COLORS) {
				const swatch = presets.createEl("button", { type: "button", cls: "ratchet-color-swatch" });
				swatch.style.backgroundColor = c;
				swatch.setAttribute("aria-label", c);
				swatch.addEventListener("click", () => {
					color = c;
					picker.value = c;
					controlTextRef?.setValue(c);
				});
			}

			new Setting(form)
				.setName("Reset period")
				.setDesc("When the count resets")
				.addDropdown((d) => {
					for (const opt of RESET_OPTIONS) d.addOption(opt.value, opt.label);
					d.setValue(resetPeriod).onChange((v) => (resetPeriod = v as ResetPeriod));
				});

			new Setting(form)
				.setName("Goal type")
				.setDesc("At least = reach minimum; At most = stay under cap; No goal = just count")
				.addDropdown((d) => {
					for (const opt of GOAL_TYPE_OPTIONS) d.addOption(opt.value, `${opt.label}: ${opt.desc}`);
					d.setValue(goalType).onChange((v) => (goalType = v as GoalType));
				});

			new Setting(form)
				.setName("Goal")
				.setDesc('Target number. For "At least" use e.g. 3 or 1 (toggle). For "At most" use e.g. 0.')
				.addText((text: TextComponent) =>
					text
						.setPlaceholder("0")
						.setValue(String(goal))
						.onChange((v) => (goal = Math.max(0, parseInt(v, 10) || 0))),
				);

			new Setting(form)
				.setName("Unit (optional)")
				.setDesc("e.g. cups, minutes, pages")
				.addText((text: TextComponent) =>
					text.setPlaceholder("").setValue(unit).onChange((v) => (unit = v)),
				);

			new Setting(form)
				.setName("Increment buttons")
				.setDesc("Comma-separated values for +/− buttons (e.g. 1, 5, 10). Widget and card use these.")
				.addText((text: TextComponent) =>
					text
						.setPlaceholder("1")
						.setValue(incrementButtons.join(", "))
						.onChange((v) => {
							const parsed = v
								.split(",")
								.map((s) => parseInt(s.trim(), 10))
								.filter((n) => !isNaN(n) && n > 0);
							incrementButtons.length = 0;
							incrementButtons.push(...(parsed.length ? parsed : [1]));
						}),
				);

			if (isEdit) {
				this.renderPastEntriesSection(form, selectedId, dm, goalType, goal, () => this.render());
			}

			const actions = form.createDiv("ratchet-config-actions");
			new ButtonComponent(actions).setButtonText("Cancel").onClick(() => {
				this.plugin.ratchetViewState.selectedId = null;
				this.render();
			});

			if (isEdit) {
				new ButtonComponent(actions)
					.setButtonText("Delete")
					.setClass("ratchet-btn-delete")
					.onClick(async () => {
						await dm.deleteTracker(selectedId);
						this.plugin.ratchetViewState.selectedId = null;
						this.render();
					});
			}

			new ButtonComponent(actions)
				.setButtonText(isEdit ? "Save" : "Create")
				.setClass("mod-cta")
				.onClick(async () => {
					if (!name.trim()) return;
					const id = isEdit ? selectedId : makeTrackerId(name.trim());
					if (isEdit) {
						await dm.updateTracker(selectedId, {
							name: name.trim(),
							icon: icon || "📌",
							color: color || DEFAULT_TRACKER_COLOR,
							resetPeriod,
							goalType,
							goal,
							unit: unit.trim(),
							incrementButtons: [...incrementButtons],
						});
					} else {
						const config = createTracker({
							id,
							name: name.trim(),
							icon: icon || "📌",
							resetPeriod,
							color: color || DEFAULT_TRACKER_COLOR,
							unit: unit.trim(),
							goal,
							goalType,
							incrementButtons,
						});
						await dm.createTracker(config);
					}
					this.plugin.ratchetViewState.selectedId = null;
					this.render();
				});
		})();
	}

	private static formatEntryDate(d: Date): string {
		const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		return `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
	}

	private renderPastEntriesSection(
		form: HTMLElement,
		trackerId: string,
		dm: DataManager,
		goalType: GoalType,
		goal: number,
		onRefresh: () => void,
	): void {
		const section = form.createDiv("ratchet-past-entries-section");
		section.createEl("h3", { text: "Past entries" });
		let daysBack = 90;
		const tableWrap = section.createDiv("ratchet-entries-table-wrap");

		const refreshTable = async (): Promise<void> => {
			tableWrap.empty();
			const end = new Date();
			const start = new Date(end);
			start.setDate(start.getDate() - daysBack);
			const entries = await dm.getDayEntries(trackerId, start, end);
			if (entries.length === 0) {
				tableWrap.createSpan({ text: "No entries in this range.", cls: "ratchet-entries-empty" });
				return;
			}
			const table = tableWrap.createEl("table", "ratchet-entries-table");
			const thead = table.createEl("thead").createEl("tr");
			thead.createEl("th", { text: "Date" });
			thead.createEl("th", { text: "Count" });
			const tbody = table.createEl("tbody");
			for (const entry of entries) {
				const tr = tbody.createEl("tr");
				tr.createEl("td", { cls: "ratchet-entries-date", text: RatchetMainView.formatEntryDate(entry.date) });
				const valueCell = tr.createEl("td", "ratchet-entries-value");
				const input = valueCell.createEl("input", { type: "number" });
				input.addClass("ratchet-entries-count-input");
				input.setAttribute("min", "0");
				input.value = String(entry.count);
				const applyEdit = async (): Promise<void> => {
					const newVal = parseInt(String(input.value), 10);
					if (isNaN(newVal) || newVal < 0) return;
					let delta = newVal - entry.count;
					// "At most 0": setting empty day to 0 = mark done (add 0-value event)
					if (goalType === "at most" && goal === 0 && newVal === 0 && entry.eventCount === 0) {
						delta = 0;
						await dm.incrementOnDate(trackerId, 0, entry.date, "done");
					} else if (delta === 0) {
						return;
					} else {
						await dm.incrementOnDate(trackerId, delta, entry.date, "edit");
					}
					await refreshTable();
					onRefresh();
				};
				input.addEventListener("blur", () => void applyEdit());
				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						input.blur();
					}
				});
			}
		};

		const rangeSetting = new Setting(section)
			.setName("Range")
			.setDesc("Show and edit entries from the last N days")
			.addDropdown((d) => {
				d.addOption("30", "Last 30 days")
					.addOption("90", "Last 90 days")
					.addOption("365", "Last 365 days");
				d.setValue(String(daysBack)).onChange((v) => {
					daysBack = parseInt(v, 10);
					void refreshTable();
				});
			});
		rangeSetting.settingEl.addClass("ratchet-entries-range-setting");

		void refreshTable();
	}
}

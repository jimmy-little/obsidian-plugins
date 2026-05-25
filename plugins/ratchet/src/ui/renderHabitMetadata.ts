import { ButtonComponent, Setting, TextComponent } from "obsidian";
import type RatchetPlugin from "../main";
import type { GoalType, ResetPeriod, TrackerConfig } from "../data/TrackerConfig";
import { DEFAULT_TRACKER_COLOR, RESET_PERIOD_LABELS, isCheckOffHabit, formatCheckOffGoalSummary, isTrackerArchived } from "../data/TrackerConfig";
import { appendTrackerConfigActions } from "./trackerConfigActions";

const RESET_OPTIONS: { value: ResetPeriod; label: string }[] = [
	{ value: "never", label: "Never" },
	{ value: "daily", label: "Daily" },
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "yearly", label: "Yearly" },
];

const GOAL_TYPE_OPTIONS: { value: GoalType; label: string; desc: string }[] = [
	{ value: "at least", label: "At least", desc: "Reach a minimum (e.g. 3 cups, close rings)" },
	{ value: "at most", label: "At most", desc: "Stay at or below a cap (e.g. 2 drinks)" },
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

export interface HabitMetadataOptions {
	onRefresh: () => void;
	onDeleted?: () => void;
}

function goalSummary(t: TrackerConfig): string {
	if (isCheckOffHabit(t)) return formatCheckOffGoalSummary(t);
	if (t.goalType === "none") return "No goal";
	const unit = t.unit?.trim() ? ` ${t.unit.trim()}` : "";
	if (t.goalType === "at least") return `At least ${t.goal}${unit}`;
	return `At most ${t.goal}${unit}`;
}

export function renderHabitMetadata(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	tracker: TrackerConfig,
	options: HabitMetadataOptions,
): void {
	mount.empty();
	mount.addClass("ratchet-habit-section", "ratchet-habit-metadata");

	const head = mount.createDiv({ cls: "ratchet-habit-section__head" });
	head.createEl("h2", { cls: "ratchet-habit-section__title", text: "Details" });

	let editing = false;
	const body = mount.createDiv({ cls: "ratchet-habit-metadata__body" });

	const editBtn = new ButtonComponent(head).setButtonText("Edit").setClass("ratchet-habit-metadata__edit-btn");

	const renderReadOnly = (): void => {
		body.empty();
		body.removeClass("ratchet-habit-metadata__body--editing");
		const dl = body.createEl("dl", { cls: "ratchet-habit-metadata__dl" });

		const addRow = (label: string, value: string, extra?: HTMLElement): void => {
			const dt = dl.createEl("dt", { text: label });
			const dd = dl.createEl("dd");
			if (extra) dd.appendChild(extra);
			else dd.setText(value);
		};

		addRow("Name", tracker.name);
		addRow("Icon", tracker.icon || "📌");
		const swatch = document.createElement("span");
		swatch.className = "ratchet-habit-metadata__color-swatch";
		swatch.style.backgroundColor = tracker.color || DEFAULT_TRACKER_COLOR;
		swatch.title = tracker.color || DEFAULT_TRACKER_COLOR;
		addRow("Color", "", swatch);
		addRow("Reset", RESET_PERIOD_LABELS[tracker.resetPeriod] ?? tracker.resetPeriod);
		addRow("Goal", goalSummary(tracker));
		addRow("Unit", tracker.unit?.trim() || "—");
		if (isTrackerArchived(tracker)) addRow("Status", "Archived");
		addRow("Widget id", tracker.id);
	};

	const renderEditForm = (): void => {
		body.empty();
		body.addClass("ratchet-habit-metadata__body--editing");
		const dm = plugin.getDataManager();

		let name = tracker.name;
		let icon = tracker.icon || "📌";
		let color = tracker.color || DEFAULT_TRACKER_COLOR;
		let resetPeriod = tracker.resetPeriod;
		let goalType = tracker.goalType ?? "at least";
		let goal = tracker.goal;
		let unit = tracker.unit ?? "";
		let checkOff = isCheckOffHabit(tracker);

		const form = body.createDiv("ratchet-main-form");

		new Setting(form)
			.setName("Name")
			.setDesc("Display name for the tracker")
			.addText((text: TextComponent) =>
				text.setPlaceholder("e.g. Coffee").setValue(name).onChange((v) => (name = v)),
			);

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
			const sw = presets.createEl("button", { type: "button", cls: "ratchet-color-swatch" });
			sw.style.backgroundColor = c;
			sw.setAttribute("aria-label", c);
			sw.addEventListener("click", () => {
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

		let goalFieldsWrap: HTMLElement | null = null;

		const refreshGoalFields = (): void => {
			if (!goalFieldsWrap) return;
			goalFieldsWrap.empty();
			if (checkOff) {
				new Setting(goalFieldsWrap)
					.setName("Goal")
					.setDesc("Check-offs per reset period (e.g. 1 per day, 3 per week)")
					.addText((text: TextComponent) =>
						text
							.setPlaceholder("1")
							.setValue(String(goal))
							.onChange((v) => (goal = Math.max(1, parseInt(v, 10) || 1))),
					);
				return;
			}
			new Setting(goalFieldsWrap)
				.setName("Goal type")
				.setDesc("At least = reach minimum; At most = stay under cap; No goal = just count")
				.addDropdown((d) => {
					for (const opt of GOAL_TYPE_OPTIONS) d.addOption(opt.value, `${opt.label}: ${opt.desc}`);
					d.setValue(goalType).onChange((v) => (goalType = v as GoalType));
				});
			new Setting(goalFieldsWrap)
				.setName("Goal")
				.setDesc("Target number")
				.addText((text: TextComponent) =>
					text
						.setPlaceholder("0")
						.setValue(String(goal))
						.onChange((v) => (goal = Math.max(0, parseInt(v, 10) || 0))),
				);
			new Setting(goalFieldsWrap)
				.setName("Unit (optional)")
				.setDesc("e.g. cups, minutes, pages")
				.addText((text: TextComponent) =>
					text.setPlaceholder("").setValue(unit).onChange((v) => (unit = v)),
				);
		};

		new Setting(form)
			.setName("Check-off habit")
			.setDesc("Mark each day done without counting (e.g. workout 3×/week, no caffeine daily)")
			.addToggle((t) =>
				t.setValue(checkOff).onChange((v) => {
					checkOff = v;
					if (v && goal < 1) goal = 1;
					refreshGoalFields();
				}),
			);

		goalFieldsWrap = form.createDiv("ratchet-config-goal-fields");
		refreshGoalFields();

		appendTrackerConfigActions(form, {
			archived: isTrackerArchived(tracker),
			isEdit: true,
			onCancel: () => {
				editing = false;
				editBtn.setButtonText("Edit");
				editBtn.setDisabled(false);
				renderReadOnly();
			},
			onSave: async () => {
				if (!name.trim()) return;
				await dm.updateTracker(tracker.id, {
					name: name.trim(),
					icon: icon || "📌",
					color: color || DEFAULT_TRACKER_COLOR,
					resetPeriod,
					checkOff,
					goalType: checkOff ? "at least" : goalType,
					goal: checkOff ? Math.max(goal, 1) : goal,
					unit: checkOff ? "" : unit.trim(),
				});
				editing = false;
				editBtn.setButtonText("Edit");
				editBtn.setDisabled(false);
				options.onRefresh();
			},
			onDelete: async () => {
				await dm.deleteTracker(tracker.id);
				options.onDeleted?.();
			},
			onArchive: async () => {
				await dm.updateTracker(tracker.id, { archived: true });
				editing = false;
				editBtn.setButtonText("Edit");
				editBtn.setDisabled(false);
				options.onRefresh();
			},
			onUnarchive: async () => {
				await dm.updateTracker(tracker.id, { archived: false });
				editing = false;
				editBtn.setButtonText("Edit");
				editBtn.setDisabled(false);
				options.onRefresh();
			},
		});
	};

	editBtn.onClick(() => {
		if (editing) return;
		editing = true;
		editBtn.setButtonText("Editing…");
		editBtn.setDisabled(true);
		renderEditForm();
	});

	renderReadOnly();
}

import { App, Modal, setIcon } from "obsidian";

/** Lucide icon names for the icon picker. User can also type any name in search and use "Use search as icon name". */
const LUCIDE_ICONS = [
	"activity", "airplay", "alarm-clock", "anchor", "aperture", "archive", "atom", "award",
	"bar-chart", "bar-chart-2", "bar-chart-3", "bar-chart-horizontal", "battery", "battery-charging",
	"bell", "bike", "book", "feather", "bookmark", "briefcase", "brush", "building", "building-2",
	"calendar", "camera", "car", "chart-bar", "chart-line", "chart-pie", "check", "check-circle",
	"chevron-down", "chevron-right", "clipboard", "clock", "cloud", "coffee", "compass",
	"credit-card", "crosshair", "cup", "database", "dollar-sign", "download", "dumbbell",
	"edit", "edit-2", "edit-3", "external-link", "eye", "film", "file", "file-text", "filter",
	"flag", "folder", "gift", "globe", "grape", "grid", "heart", "home", "image", "inbox",
	"info", "key", "laptop", "layers", "layout-dashboard", "lightbulb", "link", "list",
	"mail", "map", "map-pin", "maximize", "message-circle", "mic", "minus", "moon", "music",
	"navigation", "package", "pencil", "phone", "pie-chart", "plane", "play", "plus",
	"puzzle", "quote", "repeat", "run", "save", "scissors", "search", "send", "settings",
	"shopping-bag", "shopping-cart", "shield", "smile", "sparkles", "square", "star",
	"sun", "target", "terminal", "timer", "trending-up", "trending-down", "trophy",
	"tv", "umbrella", "upload", "user", "users", "users-2", "utensils", "video", "wallet",
	"wine", "workflow", "x", "zap",
];

export class IconPickerModal extends Modal {
	private selected: string;
	private onChoose: (icon: string) => void;

	constructor(app: App, initial: string, onChoose: (icon: string) => void) {
		super(app);
		this.selected = initial || "file-text";
		this.onChoose = onChoose;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Choose icon" });
		const searchEl = contentEl.createEl("input", { type: "text", cls: "quill-icon-picker-search" });
		searchEl.placeholder = "Search icons...";
		searchEl.value = this.selected;
		const grid = contentEl.createDiv("quill-icon-picker-grid");
		const render = (filter: string) => {
			grid.empty();
			const q = filter.trim().toLowerCase();
			const icons = q ? LUCIDE_ICONS.filter((n) => n.includes(q)) : LUCIDE_ICONS;
			for (const name of icons) {
				const cell = grid.createDiv("quill-icon-picker-cell");
				if (name === this.selected) cell.addClass("is-selected");
				const span = cell.createSpan("quill-icon-picker-icon");
				setIcon(span, name);
				cell.onclick = () => {
					this.selected = name;
					this.onChoose(name);
					this.close();
				};
			}
		};
		searchEl.oninput = () => render(searchEl.value);
		render(this.selected);
		const useCustom = contentEl.createEl("div", { cls: "quill-icon-picker-custom" });
		const customBtn = useCustom.createEl("button", { type: "button", cls: "quill-icon-picker-use-custom" });
		customBtn.setText("Use search as icon name");
		customBtn.onclick = () => {
			const name = searchEl.value.trim();
			if (name) {
				this.onChoose(name);
				this.close();
			}
		};
	}
}

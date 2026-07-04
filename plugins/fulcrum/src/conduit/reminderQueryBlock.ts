import {Menu, Notice, Platform} from "obsidian";
import type FulcrumPlugin from "../main";
import {
	filterReminders,
	parseReminderQueryConfig,
	summarizeReminderQuery,
} from "./reminderFilter";
import {createTaskNoteFromReminder} from "./reminderToTaskNote";
import type {FulcrumReminder} from "./types";
import type {RemindersBridge} from "./remindersBridge";

function formatDue(due: string | null): string | null {
	if (!due?.trim()) return null;
	const d = due.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
	return d.slice(0, 16).replace("T", " ");
}

function renderReminderRow(
	container: HTMLElement,
	reminder: FulcrumReminder,
	plugin: FulcrumPlugin,
	bridge: RemindersBridge,
	reload: () => Promise<void>,
): void {
	const row = container.createDiv({cls: "fulcrum-reminder-row"});
	if (reminder.completed) row.addClass("fulcrum-reminder-row--done");

	const checkbox = row.createEl("input", {
		type: "checkbox",
		cls: "fulcrum-reminder-row__checkbox",
	});
	checkbox.checked = reminder.completed;
	checkbox.addEventListener("change", () => {
		void (async () => {
			try {
				if (checkbox.checked) await bridge.complete(reminder.id);
				else await bridge.reopen(reminder.id);
				await reload();
			} catch (e) {
				checkbox.checked = !checkbox.checked;
				const msg = e instanceof Error ? e.message : String(e);
				new Notice(msg.length < 120 ? msg : "Could not update Reminder.");
			}
		})();
	});

	const textWrap = row.createDiv({cls: "fulcrum-reminder-row__text"});
	textWrap.createSpan({cls: "fulcrum-reminder-row__title", text: reminder.title});

	const metaParts: string[] = [];
	const due = formatDue(reminder.dueDate);
	if (due) metaParts.push(`📅 ${due}`);
	if (reminder.listName) metaParts.push(reminder.listName);
	if (reminder.tags.length) metaParts.push(reminder.tags.map((t) => `#${t.replace(/^#/, "")}`).join(" "));
	if (metaParts.length) {
		textWrap.createDiv({cls: "fulcrum-reminder-row__meta", text: metaParts.join(" · ")});
	}

	row.addEventListener("contextmenu", (ev) => {
		ev.preventDefault();
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("Create task note");
			item.setIcon("file-plus");
			item.onClick(() => {
				void createTaskNoteFromReminder(plugin, bridge, reminder).then(() => reload());
			});
		});
		menu.showAtMouseEvent(ev);
	});
}

export function registerReminderQueryBlock(plugin: FulcrumPlugin): void {
	if (!Platform.isMacOS) return;
	plugin.registerMarkdownCodeBlockProcessor("fulcrum-reminders", (source, el) => {
		void renderReminderQueryBlock(source, el, plugin);
	});
}

async function renderReminderQueryBlock(
	source: string,
	el: HTMLElement,
	plugin: FulcrumPlugin,
): Promise<void> {
	const config = parseReminderQueryConfig(source);
	if (!config) {
		el.createDiv({
			cls: "fulcrum-reminder-query-error",
			text: "Invalid fulcrum-reminders block. Example: due: today",
		});
		return;
	}

	if (!plugin.settings.conduitEnabled) {
		el.createDiv({
			cls: "fulcrum-reminder-query-error",
			text: "Enable the Reminders bridge in Fulcrum settings.",
		});
		return;
	}

	const wrapper = el.createDiv({cls: "fulcrum-reminder-query"});
	const header = wrapper.createDiv({cls: "fulcrum-reminder-query__header"});
	header.createSpan({
		cls: "fulcrum-reminder-query__filter",
		text: summarizeReminderQuery(config),
	});
	const refreshBtn = header.createEl("button", {
		text: "↻",
		cls: "fulcrum-reminder-query__refresh",
	});
	refreshBtn.setAttribute("aria-label", "Refresh");

	const listEl = wrapper.createDiv({cls: "fulcrum-reminder-query__list"});
	const footer = wrapper.createDiv({cls: "fulcrum-reminder-query__footer"});

	const load = async (): Promise<void> => {
		listEl.empty();
		footer.empty();
		listEl.createDiv({cls: "fulcrum-reminder-query__loading", text: "Loading reminders…"});
		try {
			const bridge = await plugin.getRemindersBridge();
			const all = await bridge.fetchAllReminders();
			const rows = filterReminders(all, config);
			listEl.empty();
			if (rows.length === 0) {
				listEl.createDiv({
					cls: "fulcrum-reminder-query__empty",
					text: "No reminders match this filter.",
				});
			} else {
				for (const row of rows) {
					renderReminderRow(listEl, row, plugin, bridge, load);
				}
			}
			footer.createSpan({
				cls: "fulcrum-reminder-query__updated",
				text: `Updated: ${new Date().toLocaleTimeString()}`,
			});
		} catch (e) {
			listEl.empty();
			const msg = e instanceof Error ? e.message : String(e);
			listEl.createDiv({cls: "fulcrum-reminder-query-error", text: `Failed to load: ${msg}`});
		}
	};

	refreshBtn.addEventListener("click", () => {
		void load();
	});
	await load();

	const refreshSec = plugin.settings.remindersQueryRefreshSeconds;
	if (refreshSec > 0) {
		const id = window.setInterval(() => void load(), refreshSec * 1000);
		plugin.register(() => window.clearInterval(id));
	}
}

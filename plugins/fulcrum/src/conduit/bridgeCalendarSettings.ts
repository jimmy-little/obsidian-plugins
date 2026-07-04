import {Setting} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {createRemindersBridge} from "./remindersBridge";
import type {BridgeCalendarRow} from "./types";

export type BridgeCalendarHost = {
	settings: FulcrumSettings;
};

export function parseCalendarIdList(raw: string): Set<string> {
	return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function joinCalendarIds(ids: Iterable<string>): string {
	return [...ids].join(",");
}

export type BridgeCalendarLoadResult = {
	rows: BridgeCalendarRow[];
	error: string | null;
};

export async function loadBridgeCalendarRows(
	host: BridgeCalendarHost,
): Promise<BridgeCalendarLoadResult> {
	if (!host.settings.conduitEnabled) {
		return {rows: [], error: "Enable Fulcrum Bridge above to load calendars."};
	}
	try {
		const bridge = await createRemindersBridge(host.settings);
		if (!bridge.calendars) {
			const url = host.settings.remindersBridgeUrl.trim();
			return {
				rows: [],
				error: url
					? `Could not reach Fulcrum Bridge at ${url}. Ensure it is running (menu bar pyramid icon or ./install-daemon.sh).`
					: "Set a Bridge URL above (default http://127.0.0.1:9247) to load calendars.",
			};
		}
		const rows = await bridge.calendars();
		if (rows.length === 0) {
			return {
				rows: [],
				error:
					"No calendars returned. Grant Calendar access in System Settings → Privacy & Security → Calendars → FulcrumBridge.",
			};
		}
		return {rows, error: null};
	} catch (e) {
		console.error(e);
		const msg = e instanceof Error ? e.message : String(e);
		return {
			rows: [],
			error: msg.length < 200 ? msg : "Could not load calendars from bridge.",
		};
	}
}

export function renderCalendarIdPicker(
	containerEl: HTMLElement,
	opts: {
		sectionTitle: string;
		sectionDesc?: string;
		rows: BridgeCalendarRow[];
		selectedIds: Set<string>;
		onToggle: (ids: Set<string>) => void | Promise<void>;
	},
): void {
	if (opts.sectionTitle) {
		containerEl.createEl("h4", {text: opts.sectionTitle, cls: "fulcrum-settings-heading"});
	}
	if (opts.sectionDesc) {
		containerEl.createEl("p", {text: opts.sectionDesc, cls: "fulcrum-settings-lead"});
	}
	const listEl = containerEl.createDiv({cls: "fulcrum-bridge-calendar-picker"});
	if (opts.rows.length === 0) return;
	for (const cal of opts.rows) {
		new Setting(listEl)
			.setName(cal.title)
			.addToggle((t) =>
				t.setValue(opts.selectedIds.has(cal.id)).onChange((v) => {
					const next = new Set(opts.selectedIds);
					if (v) next.add(cal.id);
					else next.delete(cal.id);
					void opts.onToggle(next);
				}),
			);
	}
}

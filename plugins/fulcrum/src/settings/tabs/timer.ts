import {displayTimerSettings} from "../../timer/settingsTab";
import type {SettingsContext} from "../settingsContext";
import {settingsLead} from "../settingsHelpers";

export function renderTimerTab(ctx: SettingsContext): void {
	settingsLead(
		ctx.containerEl,
		"Quick Start templates, timer display, frontmatter keys, and planned time blocks.",
	);
	displayTimerSettings(ctx.containerEl, ctx.plugin);
}

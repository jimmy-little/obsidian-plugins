import {Setting} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {bumpSettingsRevision} from "../fulcrum/stores";
import type {SettingsContext} from "./settingsContext";

export function heading(containerEl: HTMLElement, text: string): void {
	containerEl.createEl("h3", {text, cls: "fulcrum-settings-heading"});
}

export function settingsLead(containerEl: HTMLElement, text: string): void {
	containerEl.createEl("p", {text, cls: "fulcrum-settings-lead"});
}

/** Collapsible group for metadata field clusters. */
export function metadataGroup(
	containerEl: HTMLElement,
	summary: string,
	render: (body: HTMLElement) => void,
): void {
	const details = containerEl.createEl("details", {cls: "fulcrum-settings-details"});
	details.createEl("summary", {text: summary});
	const body = details.createDiv({cls: "fulcrum-settings-details__body"});
	render(body);
}

export function textSetting<K extends keyof FulcrumSettings>(
	ctx: SettingsContext,
	key: K,
	name: string,
	desc?: string,
	opts?: {rebuild?: boolean},
): void {
	const v = ctx.plugin.settings[key];
	const str = typeof v === "string" ? v : String(v);
	const row = new Setting(ctx.containerEl).setName(name);
	if (desc) row.setDesc(desc);
	const rebuild = opts?.rebuild !== false;
	row.addText((t) =>
		t.setValue(str).onChange(async (value) => {
			(ctx.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
			await ctx.plugin.saveSettings();
			if (rebuild) ctx.plugin.vaultIndex.scheduleRebuild();
		}),
	);
}

export function textAreaSetting<K extends keyof FulcrumSettings>(
	ctx: SettingsContext,
	key: K,
	name: string,
	desc?: string,
): void {
	const row = new Setting(ctx.containerEl).setName(name);
	if (desc) row.setDesc(desc);
	const v = ctx.plugin.settings[key];
	const str = typeof v === "string" ? v : String(v);
	row.addTextArea((ta) => {
		ta.inputEl.rows = 5;
		ta.setValue(str).onChange(async (value) => {
			(ctx.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
			await ctx.plugin.saveSettings();
			ctx.plugin.vaultIndex.scheduleRebuild();
		});
	});
}

export function toggleSetting<K extends keyof FulcrumSettings>(
	ctx: SettingsContext,
	key: K,
	name: string,
	desc?: string,
): void {
	const row = new Setting(ctx.containerEl).setName(name);
	if (desc) row.setDesc(desc);
	row.addToggle((tg) =>
		tg.setValue(Boolean(ctx.plugin.settings[key])).onChange(async (value) => {
			(ctx.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
			await ctx.plugin.saveSettings();
			ctx.plugin.vaultIndex.scheduleRebuild();
		}),
	);
}

export function displayToggleSetting<K extends keyof FulcrumSettings>(
	ctx: SettingsContext,
	key: K,
	name: string,
	desc?: string,
): void {
	const row = new Setting(ctx.containerEl).setName(name);
	if (desc) row.setDesc(desc);
	row.addToggle((tg) =>
		tg.setValue(Boolean(ctx.plugin.settings[key])).onChange(async (value) => {
			(ctx.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
			await ctx.plugin.saveSettings();
			bumpSettingsRevision();
		}),
	);
}

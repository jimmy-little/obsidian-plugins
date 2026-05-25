#!/usr/bin/env node
/**
 * One-shot transform: lapse main.ts → fulcrum TimerModule.ts
 */
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("plugins/lapse/src/main.ts");
const dest = path.resolve("plugins/fulcrum/src/timer/TimerModule.ts");

let code = fs.readFileSync(src, "utf8");

// Remove interop import
code = code.replace(/^import \{[\s\S]*?\} from "@obsidian-suite\/interop";\n/m, "");

// Replace obsidian imports - remove Plugin, PluginSettingTab from extends usage
code = code.replace(
	/^import \{([\s\S]*?)\} from "obsidian";/m,
	`import {$1} from "obsidian";
import type FulcrumPlugin from "../main";
import type {TimerSettings} from "./settings";
import {
	readTimerEntriesFromFm,
	resolveEntriesWriteKey,
} from "../fulcrum/utils/timerEntries";
import {allPlannedReadKeys} from "./settings";
import type {
	TimeEntry,
	PlannedBlock,
	TimerQuery,
	PageTimeData,
	CachedFileData,
	EntryCache,
	TemplateData,
	TemplateGroupResult,
	QuickStartDurationMaps,
	NoteEntryGroup,
	QuickStartItemPublic,
	PlannedBlockPublic,
	PlannedBlockUpsertInput,
	FULCRUM_PLANNED_DRAG_MIME,
} from "./types";`,
);

// Remove inline type definitions (LapseSettings through NoteEntryGroup)
code = code.replace(
	/interface LapseSettings \{[\s\S]*?\n\}\n\nconst DEFAULT_SETTINGS[\s\S]*?\n\}\n\ninterface TimeEntry \{[\s\S]*?\n\}\n\n[\s\S]*?interface NoteEntryGroup \{[\s\S]*?\n\}\n\n/,
	"",
);

// Class declaration
code = code.replace(
	/export default class LapsePlugin extends Plugin \{/,
	`export class TimerModule {
	host: FulcrumPlugin;

	constructor(host: FulcrumPlugin) {
		this.host = host;
	}

	get app() {
		return this.host.app;
	}

	get settings(): TimerSettings {
		return this.host.settings.timer;
	}

	register(cb: () => void): void {
		this.host.register(cb);
	}

	registerEvent(eventRef: { unregister: () => void }): void {
		this.host.registerEvent(eventRef);
	}

	addCommand(command: Parameters<FulcrumPlugin["addCommand"]>[0]): void {
		this.host.addCommand(command);
	}

	registerMarkdownCodeBlockProcessor(
		language: string,
		handler: Parameters<FulcrumPlugin["registerMarkdownCodeBlockProcessor"]>[1],
	): void {
		this.host.registerMarkdownCodeBlockProcessor(language, handler);
	}

	registerMarkdownPostProcessor(
		handler: Parameters<FulcrumPlugin["registerMarkdownPostProcessor"]>[0],
	): void {
		this.host.registerMarkdownPostProcessor(handler);
	}

	registerView(
		type: string,
		viewCreator: Parameters<FulcrumPlugin["registerView"]>[1],
	): void {
		this.host.registerView(type, viewCreator);
	}

	registerObsidianProtocolHandler(
		protocol: string,
		handler: Parameters<FulcrumPlugin["registerObsidianProtocolHandler"]>[1],
	): void {
		this.host.registerObsidianProtocolHandler(protocol, handler);
	}

	addStatusBarItem(): HTMLElement {
		return this.host.addStatusBarItem();
	}

	async loadData(): Promise<Record<string, unknown>> {
		return (await this.host.loadData()) ?? {};
	}

	async saveData(data: Record<string, unknown>): Promise<void> {
		await this.host.saveData(data);
	}`,
);

// Remove public API fields
code = code.replace(
	/\t\/\*\* @see LapsePublicApi[\s\S]*?\tapi\?: Readonly<LapsePublicApi>;\n\n/,
	"",
);

// Rename LapseQuery -> TimerQuery
code = code.replace(/\bLapseQuery\b/g, "TimerQuery");

// Rename view classes prefix Lapse -> Timer (keep View suffix for now)
code = code.replace(/\bLapseSidebarView\b/g, "TimerActivityView");
code = code.replace(/\bLapseReportsView\b/g, "TimerSessionsView");
code = code.replace(/\bLapseButtonsView\b/g, "TimerQuickStartView");
code = code.replace(/\bLapseGridView\b/g, "TimerEntryGridView");
code = code.replace(/\bLapseCalendarView\b/g, "TimerCalendarView");
code = code.replace(/\bLapseQuickStartModal\b/g, "TimerQuickStartModal");
code = code.replace(/\bLapseButtonModal\b/g, "TimerButtonModal");
code = code.replace(/\bLapseSettingTab\b/g, "TimerSettingTab");
code = code.replace(/\bLapsePlugin\b/g, "TimerModule");

// View type IDs
code = code.replace(/'lapse-sidebar'/g, "'fulcrum-timer-activity'");
code = code.replace(/'lapse-reports'/g, "'fulcrum-timer-sessions'");
code = code.replace(/'lapse-buttons'/g, "'fulcrum-timer-quick-start'");
code = code.replace(/'lapse-grid'/g, "'fulcrum-timer-entry-grid'");
code = code.replace(/'lapse-calendar'/g, "'fulcrum-timer-calendar'");

// CSS classes lapse- -> fulcrum-timer-
code = code.replace(/\blapse-/g, "fulcrum-timer-");

// Settings key renames
code = code.replace(/\blapseButtonTemplatesFolder\b/g, "timerButtonTemplatesFolder");

// MIME type
code = code.replace(/\bLAPSE_PLANNED_DRAG_MIME\b/g, "FULCRUM_PLANNED_DRAG_MIME");

// Public API types
code = code.replace(/\bLapseQuickStartItemPublic\b/g, "QuickStartItemPublic");
code = code.replace(/\bLapsePlannedBlockPublic\b/g, "PlannedBlockPublic");
code = code.replace(/\bLapsePlannedBlockUpsertInput\b/g, "PlannedBlockUpsertInput");
code = code.replace(/\bLapsePublicApi\b/g, "never");

// Remove registerPublicIntegrationApi method and call
code = code.replace(/\n\t\tthis\.registerPublicIntegrationApi\(\);\n/, "\n");
code = code.replace(
	/\n\t\/\*\* Build `lapsePublicApi`[\s\S]*?\n\t\}\n\n\t templateDataToPublic/,
	"\n\ttemplateDataToPublic",
);

// Remove onunload API cleanup
code = code.replace(
	/\t\tthis\.api = undefined;\n\t\twindow\.dispatchEvent\([\s\S]*?\);\n/,
	"",
);

// Remove lapse-active processor line
code = code.replace(
	/\t\tthis\.registerMarkdownCodeBlockProcessor\('lapse-active',[\s\S]*?\);\n/,
	"",
);

// Update code block processors - primary + aliases
code = code.replace(
	/\t\t\/\/ Register the code block processors\n\t\tthis\.registerMarkdownCodeBlockProcessor\('lapse', this\.processTimerCodeBlock\.bind\(this\)\);\n\t\tthis\.registerMarkdownCodeBlockProcessor\('lapse-report', this\.processReportCodeBlock\.bind\(this\)\);/,
	`		// Timer code block processors (primary + legacy aliases)
		const timerBlock = this.processTimerCodeBlock.bind(this);
		const reportBlock = this.processReportCodeBlock.bind(this);
		this.registerMarkdownCodeBlockProcessor("fulcrum-timer", timerBlock);
		this.registerMarkdownCodeBlockProcessor("fulcrum-timer-report", reportBlock);
		this.registerMarkdownCodeBlockProcessor("lapse", timerBlock);
		this.registerMarkdownCodeBlockProcessor("lapse-report", reportBlock);`,
);

// Inline button prefixes
code = code.replace(
	/if \(text\.startsWith\('lapse:'\)\)/,
	`if (text.startsWith("fulcrum-timer:") || text.startsWith("lapse:"))`,
);
code = code.replace(
	/const templateName = text\.substring\('lapse:'\.length\);/,
	`const templateName = text.startsWith("fulcrum-timer:")
						? text.substring("fulcrum-timer:".length)
						: text.substring("lapse:".length);`,
);
code = code.replace(
	/if \(!codeEl\.parentElement\?\.classList\.contains\('fulcrum-timer-button'\)\)/,
	`if (!codeEl.parentElement?.classList.contains("fulcrum-timer-button"))`,
);

// Remove ribbon icons block
code = code.replace(
	/\n\t\t\/\/ Add ribbon icons[\s\S]*?\t\tthis\.addRibbonIcon\('table',[\s\S]*?\}\);\n/,
	"\n",
);

// Remove settings tab registration
code = code.replace(
	/\n\t\t\/\/ Settings tab\n\t\tthis\.addSettingTab\(new TimerSettingTab\(this\.app, this\)\);\n/,
	"\n",
);

// Protocol handler - use fulcrum id via host
code = code.replace(
	/this\.registerObsidianProtocolHandler\(this\.manifest\.id,/,
	"this.registerObsidianProtocolHandler(this.host.manifest.id,",
);

// Console logs
code = code.replace(/Lapse:/g, "Fulcrum timer:");

// Command IDs and fence inserts
code = code.replace(/id: 'insert-lapse-timer'/g, "id: 'fulcrum-timer-insert'");
code = code.replace(/id: 'insert-lapse-autostart'/g, "id: 'fulcrum-timer-insert-start'");
code = code.replace(/id: 'quick-start-timer'/g, "id: 'fulcrum-timer-toggle'");
code = code.replace(/id: 'show-lapse-sidebar'/g, "id: 'fulcrum-timer-show-activity'");
code = code.replace(/id: 'show-lapse-reports'/g, "id: 'fulcrum-timer-show-sessions'");
code = code.replace(/id: 'show-lapse-buttons'/g, "id: 'fulcrum-timer-show-quick-start'");
code = code.replace(/id: 'show-lapse-calendar'/g, "id: 'fulcrum-timer-show-calendar'");
code = code.replace(/id: 'show-lapse-grid'/g, "id: 'fulcrum-timer-show-entry-grid'");
code = code.replace(/id: 'insert-lapse-button'/g, "id: 'fulcrum-timer-insert-button'");

code = code.replace(/```lapse\\n\\n```/g, "```fulcrum-timer\\n\\n```");
code = code.replace(/`lapse:\$\{templateName\}`/g, "`fulcrum-timer:${templateName}`");
code = code.replace(/`lapse:\$\{name\}`/g, "`fulcrum-timer:${name}`");

// Remove processActiveTimersCodeBlock method entirely (large block)
code = code.replace(
	/\n\tasync processActiveTimersCodeBlock\([\s\S]*?\n\t\}\n\n\tparseQuery/,
	"\n\tparseQuery",
);

// Remove TimerSettingTab class at end
code = code.replace(/\nclass TimerSettingTab extends PluginSettingTab \{[\s\S]*$/, "\n");

// Fix plugin references in view constructors - already TimerModule

// loadSettings/saveSettings -> use host
code = code.replace(/\n\tasync loadSettings\(\) \{[\s\S]*?\n\t\}\n\n\tasync saveSettings\(\)/, "\n\tasync saveSettings()");
code = code.replace(
	/async saveSettings\(\) \{\n\t\t\/\/ Only save settings, not the cache\n\t\tawait this\.saveData\(this\.settings\);\n\t\}/,
	`async saveTimerSettings(): Promise<void> {
		const data = await this.loadData();
		await this.saveData({ ...data, timerEntryCache: this.entryCache });
		await this.host.saveSettings();
	}`,
);

fs.writeFileSync(dest, code);
console.log("Wrote", dest, "lines:", code.split("\n").length);

import type {App, WorkspaceLeaf} from "obsidian";
import {Notice, Platform} from "obsidian";
import {claimLeaf} from "@obsidian-suite/core";
import {
	VIEW_PROJECT_MANAGER,
	VIEW_TIMELINE,
	VIEW_ACTIVE_TIMERS,
	VIEW_QUICK_START,
	VIEW_FLOATING_TIMERS,
} from "./constants";
import type {FulcrumSettings} from "./settingsDefaults";
import type {ProjectManagerViewState} from "../views/ProjectManagerView";
import type {TimelineViewState} from "../views/TimelineView";

function landingMode(settings: FulcrumSettings): "dashboard" | "today" {
	return settings.landingPage === "dashboard" ? "dashboard" : "today";
}

function resolveProjectManagerState(
	settings: FulcrumSettings,
	initial?: ProjectManagerViewState,
): ProjectManagerViewState {
	if (!initial) return {mode: landingMode(settings)};
	if (initial.mode === "project" && initial.projectPath) {
		return {mode: "project", projectPath: initial.projectPath};
	}
	if (initial.mode === "orbit") {
		return initial.personPath
			? {mode: "orbit", personPath: initial.personPath}
			: {mode: "orbit"};
	}
	if (
		initial.mode === "tasks" ||
		initial.mode === "kanban" ||
		initial.mode === "calendar" ||
		initial.mode === "time" ||
		initial.mode === "review" ||
		initial.mode === "today" ||
		initial.mode === "dashboard"
	) {
		return {mode: initial.mode, timeTab: initial.timeTab};
	}
	return {mode: landingMode(settings)};
}

/** Primary Fulcrum shell: sidebars + dashboard or project in the main pane. Exported for deep links. */
export async function revealOrCreateProjectManager(
	app: App,
	settings: FulcrumSettings,
	initial?: ProjectManagerViewState,
): Promise<void> {
	const state = resolveProjectManagerState(settings, initial);
	const existing = app.workspace.getLeavesOfType(VIEW_PROJECT_MANAGER)[0];
	if (existing) {
		await existing.setViewState({
			type: VIEW_PROJECT_MANAGER,
			active: true,
			state,
		});
		await app.workspace.revealLeaf(existing);
		return;
	}
	const leaf = claimLeaf(app, settings.openViewsIn);
	await leaf.setViewState({
		type: VIEW_PROJECT_MANAGER,
		active: true,
		state,
	});
	await app.workspace.revealLeaf(leaf);
}

export async function revealOrCreateDashboard(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "dashboard"});
}

export async function revealOrCreateToday(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "today"});
}

export async function revealOrCreateLanding(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: landingMode(settings)});
}

export async function revealOrCreateTimeTracked(
	app: App,
	settings: FulcrumSettings,
	tab?: import("../timer/types").TimeModeTab,
): Promise<void> {
	if (tab) {
		settings.timeModeTab = tab;
	}
	await revealOrCreateProjectManager(app, settings, {mode: "time", timeTab: tab ?? settings.timeModeTab});
}

export async function revealOrCreateTasks(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "tasks"});
}

export async function revealOrCreateReview(app: App, settings: FulcrumSettings): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "review"});
}

export async function revealOrCreateOrbit(
	app: App,
	settings: FulcrumSettings,
	initial?: {personPath?: string},
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {
		mode: "orbit",
		personPath: initial?.personPath,
	});
}

/** Single-day timeline (tasks + meetings); optional persisted focal date. */
export async function revealOrCreateTimeline(
	app: App,
	settings: FulcrumSettings,
	initial?: TimelineViewState,
): Promise<void> {
	const existing = app.workspace.getLeavesOfType(VIEW_TIMELINE)[0];
	if (existing) {
		if (initial?.focalDateIso) {
			await existing.setViewState({
				type: VIEW_TIMELINE,
				active: true,
				state: {focalDateIso: initial.focalDateIso},
			});
		} else {
			await existing.setViewState({
				type: VIEW_TIMELINE,
				active: true,
			});
		}
		await app.workspace.revealLeaf(existing);
		return;
	}
	const leaf = claimLeaf(app, settings.openViewsIn);
	await leaf.setViewState({
		type: VIEW_TIMELINE,
		active: true,
		state: initial?.focalDateIso ? {focalDateIso: initial.focalDateIso} : undefined,
	});
	await app.workspace.revealLeaf(leaf);
}

/** Docked leaf: running timers only (compact sidebar view). */
export async function revealOrCreateActiveTimers(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	const existing = app.workspace.getLeavesOfType(VIEW_ACTIVE_TIMERS)[0];
	if (existing) {
		await existing.setViewState({
			type: VIEW_ACTIVE_TIMERS,
			active: true,
		});
		await app.workspace.revealLeaf(existing);
		return;
	}
	const leaf = claimLeaf(app, settings.openViewsIn);
	await leaf.setViewState({
		type: VIEW_ACTIVE_TIMERS,
		active: true,
	});
	await app.workspace.revealLeaf(leaf);
}

/** Docked leaf: Quick Start template buttons (sidebar view). */
export async function revealOrCreateQuickStart(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	const existing = app.workspace.getLeavesOfType(VIEW_QUICK_START)[0];
	if (existing) {
		await existing.setViewState({
			type: VIEW_QUICK_START,
			active: true,
		});
		await app.workspace.revealLeaf(existing);
		return;
	}
	const leaf = claimLeaf(app, settings.openViewsIn);
	await leaf.setViewState({
		type: VIEW_QUICK_START,
		active: true,
	});
	await app.workspace.revealLeaf(leaf);
}

const FLOATING_TIMERS_POPOUT_SIZE = {width: 360, height: 520};

/** Desktop pop-out: active timers + quick start (no native companion app). */
export async function openFloatingTimersPopout(app: App): Promise<void> {
	if (!Platform.isDesktopApp) {
		new Notice("Floating timers require the Obsidian desktop app.");
		return;
	}

	const existingLeaves: WorkspaceLeaf[] = [];
	app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.view.getViewType() === VIEW_FLOATING_TIMERS) {
			existingLeaves.push(leaf);
		}
	});

	const existingLeaf = existingLeaves[0];
	if (existingLeaf) {
		await existingLeaf.setViewState({type: VIEW_FLOATING_TIMERS, active: true});
		app.workspace.revealLeaf(existingLeaf);
		return;
	}

	const leaf = app.workspace.openPopoutLeaf({
		size: FLOATING_TIMERS_POPOUT_SIZE,
	});
	await leaf.setViewState({type: VIEW_FLOATING_TIMERS, active: true});
}

export async function openProjectSummaryLeaf(
	app: App,
	settings: FulcrumSettings,
	projectPath: string,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {
		mode: "project",
		projectPath,
	});
}

import type {App} from "obsidian";
import {claimLeaf} from "@obsidian-suite/core";
import {VIEW_PROJECT_MANAGER, VIEW_TIMELINE} from "./constants";
import type {FulcrumSettings} from "./settingsDefaults";
import type {ProjectManagerViewState} from "../views/ProjectManagerView";
import type {TimelineViewState} from "../views/TimelineView";

function resolveProjectManagerState(initial?: ProjectManagerViewState): ProjectManagerViewState {
	if (!initial) return {mode: "dashboard"};
	if (initial.mode === "project" && initial.projectPath) {
		return {mode: "project", projectPath: initial.projectPath};
	}
	if (
		initial.mode === "areas" ||
		initial.mode === "kanban" ||
		initial.mode === "calendar" ||
		initial.mode === "time" ||
		initial.mode === "review"
	) {
		return {mode: initial.mode};
	}
	return {mode: "dashboard"};
}

/** Primary Fulcrum shell: sidebars + dashboard or project in the main pane. Exported for deep links. */
export async function revealOrCreateProjectManager(
	app: App,
	settings: FulcrumSettings,
	initial?: ProjectManagerViewState,
): Promise<void> {
	const state = resolveProjectManagerState(initial);
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

export async function revealOrCreateTimeTracked(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "time"});
}

export async function revealOrCreateAreas(
	app: App,
	settings: FulcrumSettings,
): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "areas"});
}

export async function revealOrCreateReview(app: App, settings: FulcrumSettings): Promise<void> {
	await revealOrCreateProjectManager(app, settings, {mode: "review"});
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

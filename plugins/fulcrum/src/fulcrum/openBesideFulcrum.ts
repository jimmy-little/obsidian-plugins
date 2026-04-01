import type {App, OpenViewState, TFile, WorkspaceLeaf} from "obsidian";
import {Platform} from "obsidian";

/** @returns Whether `leaf` is still attached to the workspace. */
export function leafIsInWorkspace(app: App, leaf: WorkspaceLeaf): boolean {
	let found = false;
	app.workspace.iterateAllLeaves((l) => {
		if (l === leaf) found = true;
	});
	return found;
}

/**
 * True when the leaf lives in the left/right sidebar (or mobile drawer), not the main editor root.
 * Opening “beside” such a leaf produces a useless narrow split; callers should target the main stack instead.
 */
export function anchorLeafIsInSideDock(app: App, leaf: WorkspaceLeaf): boolean {
	const r = leaf.getRoot();
	return r === app.workspace.leftSplit || r === app.workspace.rightSplit;
}

export type FulcrumCompanionLeaf = {current: WorkspaceLeaf | null};

/**
 * Open a markdown file in a leaf split to the right of the Fulcrum anchor leaf,
 * reusing the same companion leaf when possible. Falls back to a new tab when
 * there is no anchor, on mobile, or if the anchor is not in the workspace.
 */
export async function openMarkdownBesideFulcrum(
	app: App,
	anchorLeaf: WorkspaceLeaf | undefined,
	file: TFile,
	companion: FulcrumCompanionLeaf,
	openState?: OpenViewState,
): Promise<void> {
	if (
		Platform.isMobile ||
		!anchorLeaf ||
		!leafIsInWorkspace(app, anchorLeaf)
	) {
		const leaf = app.workspace.getLeaf("tab");
		await leaf.openFile(file, {active: true, ...openState});
		companion.current = leaf;
		return;
	}

	if (anchorLeafIsInSideDock(app, anchorLeaf)) {
		const mainLeaf =
			app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(false);
		await app.workspace.revealLeaf(mainLeaf);
		await mainLeaf.openFile(file, {active: true, ...openState});
		companion.current = mainLeaf;
		return;
	}

	let target = companion.current;
	if (!target || !leafIsInWorkspace(app, target)) {
		target = app.workspace.createLeafBySplit(anchorLeaf, "vertical", false);
		companion.current = target;
	}

	await app.workspace.revealLeaf(target);
	await target.openFile(file, {active: true, ...openState});
}

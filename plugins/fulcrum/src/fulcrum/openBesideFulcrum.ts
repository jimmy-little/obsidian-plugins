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
		await app.workspace.getLeaf("tab").openFile(file, {active: true, ...openState});
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

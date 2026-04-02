import type {App, WorkspaceLeaf} from "obsidian";

/** True when the leaf is in the left/right sidebar (or mobile drawer root), not the main editor root. */
export function leafIsInSideDock(app: App, leaf: WorkspaceLeaf): boolean {
	const r = leaf.getRoot();
	return r === app.workspace.leftSplit || r === app.workspace.rightSplit;
}

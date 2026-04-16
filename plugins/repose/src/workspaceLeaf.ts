import type { App, WorkspaceLeaf } from "obsidian";

/**
 * True when this leaf is in the left or right side dock.
 * Mirror Orbit behavior so Repose can run "list-only" in a dock.
 */
export function leafIsInSideDock(app: App, leaf: WorkspaceLeaf): boolean {
	const r = leaf.getRoot();
	return r === app.workspace.leftSplit || r === app.workspace.rightSplit;
}


import type {App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {VaultIndex} from "./VaultIndex";
import {transformInlineLinkPillsInRoot} from "./inlineLinkPills";

/** Obsidian sets inline min-height on preview sizers; breaks feed card layout and row hover bounds. */
function normalizeActivityPreviewLayout(root: HTMLElement): void {
	const targets: HTMLElement[] = [root];
	for (const el of Array.from(
		root.querySelectorAll<HTMLElement>(".markdown-preview-sizer, .markdown-preview-section"),
	)) {
		targets.push(el);
	}
	for (const el of targets) {
		el.style.minHeight = "0";
		el.style.height = "auto";
		el.style.maxHeight = "none";
		el.style.paddingBottom = "0";
	}
}

/** Post-render transforms for activity feeds and project page section bodies. */
export function transformActivityPreviewDom(
	app: App,
	root: HTMLElement,
	sourcePath: string,
	settings: FulcrumSettings,
	vaultIndex: VaultIndex,
): void {
	normalizeActivityPreviewLayout(root);
	transformInlineLinkPillsInRoot(app, root, sourcePath, settings, vaultIndex);
	// Obsidian may apply inline min-height on the sizer after the first layout pass.
	requestAnimationFrame(() => {
		normalizeActivityPreviewLayout(root);
	});
}

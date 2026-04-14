import type { App, WorkspaceLeaf } from "obsidian";

export type OpenViewsIn = "main" | "sidebar";

export {
	NotePropertiesModal,
	openNotePropertiesModal,
	type NotePropertiesModalOptions,
} from "./notePropertiesModal";
export {
	gatherAllPropertyKeys,
	gatherValueHistoryForKey,
	PropertyKeySuggest,
	PersonPropertyValueSuggest,
	partialTagNeedle,
	partialWikilinkNeedle,
	type PropertyValueSuggestItem,
} from "./notePropertySuggests";

/**
 * Choose a leaf for opening a custom view (Fulcrum-style).
 */
export function claimLeaf(app: App, openViewsIn: OpenViewsIn): WorkspaceLeaf {
	if (openViewsIn === "sidebar") {
		const right = app.workspace.getRightLeaf(false);
		if (right) return right;
	}
	return app.workspace.getLeaf("tab");
}

export async function revealOrCreateView(
	app: App,
	viewType: string,
	openViewsIn: OpenViewsIn,
	setState?: Record<string, unknown>,
): Promise<void> {
	const existing = app.workspace.getLeavesOfType(viewType)[0];
	if (existing) {
		await existing.setViewState({
			type: viewType,
			active: true,
			state: setState,
		});
		await app.workspace.revealLeaf(existing);
		return;
	}
	const leaf = claimLeaf(app, openViewsIn);
	await leaf.setViewState({
		type: viewType,
		active: true,
		state: setState,
	});
	await app.workspace.revealLeaf(leaf);
}

import type {Plugin} from "obsidian";
import {
	Editor,
	type EditorPosition,
	type EditorSuggest,
	type EditorSuggestTriggerInfo,
	type TFile,
	type Workspace,
} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {isCheckboxLine, isInlineTaskLineInScope} from "./utils/inlineTasks";

interface EditorSuggestManager {
	suggests: EditorSuggest<unknown>[];
}

/** True when Obsidian's vault link suggest should defer to Fulcrum's project suggest. */
export function shouldSuppressVaultLinkSuggestForInlineProject(
	editor: Editor,
	cursor: EditorPosition,
	file: TFile | null,
	settings: FulcrumSettings,
): boolean {
	if (!file || !isInlineTaskLineInScope(file.path, settings)) return false;
	const line = editor.getLine(cursor.line);
	if (!isCheckboxLine(line)) return false;
	const before = line.slice(0, cursor.ch);
	return /\+\[\[[^\]|]*$/u.test(before);
}

/**
 * Suppress Obsidian's default `[[` link suggest on inline task lines while completing `+[[project]]`.
 */
export function registerInlineTaskLinkSuggestGuard(
	plugin: Plugin,
	getSettings: () => FulcrumSettings,
	inlineTaskSuggest: EditorSuggest<unknown>,
): void {
	const patchSuggests = (): void => {
		const manager = (plugin.app.workspace as Workspace & {editorSuggest?: EditorSuggestManager})
			.editorSuggest;
		if (!manager?.suggests?.length) return;

		for (const suggest of manager.suggests) {
			if (suggest === inlineTaskSuggest) continue;
			const target = suggest as EditorSuggest<unknown> & {
				onTrigger: (
					cursor: EditorPosition,
					editor: Editor,
					file: TFile | null,
				) => EditorSuggestTriggerInfo | null;
				__fulcrumLinkGuardPatched?: boolean;
			};
			if (target.__fulcrumLinkGuardPatched) continue;
			target.__fulcrumLinkGuardPatched = true;

			const previous = target.onTrigger.bind(target);
			target.onTrigger = (cursor, editor, file) => {
				if (
					shouldSuppressVaultLinkSuggestForInlineProject(
						editor,
						cursor,
						file,
						getSettings(),
					)
				) {
					return null;
				}
				return previous(cursor, editor, file);
			};
		}
	};

	plugin.app.workspace.onLayoutReady(patchSuggests);
	plugin.registerEvent(plugin.app.workspace.on("layout-change", patchSuggests));
	patchSuggests();
}

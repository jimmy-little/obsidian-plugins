import type {FulcrumSettings} from "../settingsDefaults";
import {lineIncludesTag} from "./inlineTasks";

/** Tag required on a checkbox line for inline task indexing/display (empty = no filter). */
export function effectiveInlineTaskIncludeTag(settings: FulcrumSettings): string {
	return settings.inlineTaskIncludeTag.trim();
}

export function lineMatchesInlineTaskFilter(lineText: string, settings: FulcrumSettings): boolean {
	const tag = effectiveInlineTaskIncludeTag(settings);
	if (!tag) return true;
	return lineIncludesTag(lineText, tag);
}

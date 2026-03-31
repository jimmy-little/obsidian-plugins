import {writable} from "svelte/store";

const WORK_RELATED_ONLY_LS = "fulcrum-show-work-related-only";

function readWorkRelatedOnlyInitial(): boolean {
	try {
		return localStorage.getItem(WORK_RELATED_ONLY_LS) === "1";
	} catch {
		return false;
	}
}

/**
 * When true, main Fulcrum views and the project sidebar list only projects
 * linked to an area with frontmatter `work-related: true`.
 */
export const workRelatedOnly = writable(readWorkRelatedOnlyInitial());

export function setWorkRelatedOnly(value: boolean): void {
	workRelatedOnly.set(value);
	try {
		localStorage.setItem(WORK_RELATED_ONLY_LS, value ? "1" : "0");
	} catch {
		/* private mode / quota */
	}
}

/** Incremented after each index rebuild so views refresh. */
export const indexRevision = writable(0);

export function bumpIndexRevision(): void {
	indexRevision.update((n: number) => n + 1);
}

/** Incremented after patchSettings so Svelte views re-read plugin.settings. */
export const settingsRevision = writable(0);

export function bumpSettingsRevision(): void {
	settingsRevision.update((n: number) => n + 1);
}

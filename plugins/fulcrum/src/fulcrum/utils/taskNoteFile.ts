import type {FulcrumSettings} from "../settingsDefaults";

function fmString(fm: Record<string, unknown>, key: string): string | undefined {
	const v = fm[key];
	if (v == null) return undefined;
	if (typeof v === "string") return v.trim() || undefined;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

export function tagsIncludeTask(fm: Record<string, unknown>, tag: string): boolean {
	const t = fm.tags;
	const want = tag.toLowerCase().replace(/^#/, "");
	if (Array.isArray(t)) {
		return t.some((x) => String(x).toLowerCase().replace(/^#/, "") === want);
	}
	if (typeof t === "string") {
		return t
			.split(/[\s,]+/)
			.map((s) => s.replace(/^#/, "").toLowerCase())
			.includes(want);
	}
	return false;
}

/** Whether frontmatter identifies a dedicated task note. */
export function isTaskNoteFile(
	fm: Record<string, unknown> | undefined,
	settings: FulcrumSettings,
): boolean {
	if (!fm) return false;
	const typeField = settings.typeField.trim() || "type";
	const tVal = fmString(fm, typeField)?.toLowerCase();
	return tagsIncludeTask(fm, settings.taskTag) || tVal === "task";
}

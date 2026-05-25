import type { SessionNote } from "./types";

export function resolveWorkoutRenameValue(
	session: SessionNote,
	rawFm: Record<string, unknown> = {},
): string {
	const nameStr = rawFm.name != null ? String(rawFm.name).trim() : "";
	const programDay = session.frontmatter.programDay?.trim();
	if (programDay) return programDay;
	if (nameStr) return nameStr;
	return session.file.basename.replace(/\.md$/i, "");
}

export function resolveWorkoutDisplayTitle(
	session: SessionNote,
	rawFm: Record<string, unknown> = {},
): string {
	const nameStr = rawFm.name != null ? String(rawFm.name).trim() : "";
	const dayPart =
		session.frontmatter.programDay?.trim() || nameStr || "Workout";
	const date = session.frontmatter.date?.trim() || "—";
	return `${date} — ${dayPart}`;
}

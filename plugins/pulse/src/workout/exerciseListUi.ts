import type { ExerciseNote } from "./types";

export type ExerciseGroupBy = "movement" | "equipment" | "body_part";

const GROUP_STORAGE_KEY = "pulse-exercise-sidebar-group-by";

export function getStoredExerciseGroupBy(): ExerciseGroupBy {
	try {
		const v = localStorage.getItem(GROUP_STORAGE_KEY);
		if (v === "equipment" || v === "body_part" || v === "movement") return v;
	} catch { /* ignore */ }
	return "movement";
}

export function setStoredExerciseGroupBy(by: ExerciseGroupBy): void {
	try {
		localStorage.setItem(GROUP_STORAGE_KEY, by);
	} catch { /* ignore */ }
}

export function exerciseGroupLabel(ex: ExerciseNote, by: ExerciseGroupBy): string {
	const fm = ex.frontmatter;
	if (by === "equipment") return (fm.equipment ?? "").trim() || "Uncategorized";
	if (by === "body_part") return (fm.body_part ?? "").trim() || "Uncategorized";
	return (fm.movement ?? "").trim() || "Uncategorized";
}

/** Match if every whitespace-separated token appears somewhere in name, movement, equipment, body part, or tags. */
export function exerciseMatchesFilter(ex: ExerciseNote, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const tokens = q.split(/\s+/).filter(Boolean);
	const hay = [
		ex.frontmatter.name,
		ex.frontmatter.movement,
		ex.frontmatter.equipment,
		ex.frontmatter.body_part ?? "",
		...(ex.frontmatter.tags ?? []),
	].join(" ").toLowerCase();
	return tokens.every(t => hay.includes(t));
}

export function groupExercisesBy(exercises: ExerciseNote[], by: ExerciseGroupBy): Map<string, ExerciseNote[]> {
	const grouped = new Map<string, ExerciseNote[]>();
	for (const ex of exercises) {
		const label = exerciseGroupLabel(ex, by);
		if (!grouped.has(label)) grouped.set(label, []);
		grouped.get(label)!.push(ex);
	}
	return grouped;
}

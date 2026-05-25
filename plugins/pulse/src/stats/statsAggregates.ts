import { normalizeWorkoutLabel } from "../workout/workoutIcon";
import type { ExerciseNote, SessionNote } from "../workout/types";

/** Strip wikilink wrappers; preserve display casing (e.g. `[[Mind & Body]]` → Mind & Body). */
function workoutTypeLabel(raw: unknown): string {
	if (raw == null) return "";
	const s = String(raw).trim();
	if (!s) return "";
	const wiki = s.match(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/);
	if (wiki) return wiki[1]!.trim();
	return s.replace(/^["']|["']$/g, "").trim();
}

function stripWiki(raw: unknown): string {
	return normalizeWorkoutLabel(raw != null ? String(raw) : "");
}

function titleCaseLabel(raw: string): string {
	if (!raw) return raw;
	return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** HKWorkoutActivityTypeTraditionalStrengthTraining → Traditional Strength Training */
export function humanizeActivityType(raw: string): string {
	let s = raw.trim();
	if (!s) return "";
	if (s.startsWith("HKWorkoutActivityType")) {
		s = s.slice("HKWorkoutActivityType".length);
	}
	s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
	return titleCaseLabel(s);
}

function isStrengthDayLabel(label: string): boolean {
	if (/^(push|pull)\s*day$/.test(label)) return true;
	if (/\b(push|pull)\s+day\b/.test(label)) return true;
	if (label === "legs") return true;
	if (/legs\s+and\s+hinge/.test(label)) return true;
	return false;
}

/** Display label for workout-type breakdown (Traditional Strength, Yoga, Indoor Cycling, …). */
export function resolveSessionWorkoutTypeLabel(fm: Record<string, unknown>): string {
	const type = workoutTypeLabel(fm.type);
	if (type) return type;

	const imported = fm.importedActivityType != null
		? humanizeActivityType(String(fm.importedActivityType))
		: "";
	if (imported) return imported;

	const programDay = stripWiki(fm.programDay);
	const name = stripWiki(fm.name);
	if (programDay && isStrengthDayLabel(programDay)) return "Traditional Strength Training";
	if (name && isStrengthDayLabel(name)) return "Traditional Strength Training";
	if (programDay) return titleCaseLabel(programDay);
	if (name) return titleCaseLabel(name);

	return "Other";
}

export function aggregateWorkoutTypeCounts(
	sessions: SessionNote[],
): { name: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const session of sessions) {
		const label = resolveSessionWorkoutTypeLabel(
			session.frontmatter as unknown as Record<string, unknown>,
		);
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return [...counts.entries()]
		.filter(([name]) => name.toLowerCase() !== "other")
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);
}

export function aggregateBodyPartVolumes(
	sessions: SessionNote[],
	exercises: ExerciseNote[],
): { name: string; volume: number }[] {
	const exerciseMap = new Map<string, ExerciseNote>();
	for (const ex of exercises) exerciseMap.set(ex.file.path, ex);

	const volumes = new Map<string, number>();
	for (const session of sessions) {
		for (const ex of session.session.exercises) {
			const exercise = exerciseMap.get(ex.exercisePath);
			const bodyPartRaw = exercise?.frontmatter.body_part
				?? (exercise?.frontmatter as Record<string, unknown> | undefined)?.["body-part"];
			const bodyPartStr = bodyPartRaw != null ? String(bodyPartRaw).trim() : "";
			const bodyPart = bodyPartStr || "Uncategorized";
			const volume = ex.sets.reduce(
				(sum, set) => sum + ((set.weight ?? 0) * (set.reps ?? 0)),
				0,
			);
			if (volume <= 0) continue;
			volumes.set(bodyPart, (volumes.get(bodyPart) ?? 0) + volume);
		}
	}

	return [...volumes.entries()]
		.map(([name, volume]) => ({ name, volume }))
		.sort((a, b) => b.volume - a.volume);
}

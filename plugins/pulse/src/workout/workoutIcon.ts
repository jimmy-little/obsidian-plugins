import { TFile, TFolder, Vault } from "obsidian";
import { ACTIVITY_ICONS_FOLDER, WORKOUT_TYPE_TO_ICON } from "../import/types";

/** Strip wikilinks and normalize for icon / pattern matching. */
export function normalizeWorkoutLabel(raw: string | undefined | null): string {
	if (raw == null) return "";
	return String(raw)
		.replace(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g, "$1")
		.trim()
		.toLowerCase();
}

export interface WorkoutIconInput {
	name?: string;
	type?: string;
	programDay?: string;
	importSource?: string;
	importedActivityType?: string;
	/** When true, used for legacy Gravl detection (pulse-session without Health import markers). */
	hasPulseSession?: boolean;
}

function isSaunaLabel(label: string): boolean {
	const patterns = ["heat therapy", "sauna", "steamroom", "steam room"];
	return patterns.some((p) => label.includes(p));
}

function isStrengthDayLabel(label: string): boolean {
	if (/^(push|pull)\s*day$/.test(label)) return true;
	if (/\b(push|pull)\s+day\b/.test(label)) return true;
	if (label === "legs") return true;
	if (/legs\s+and\s+hinge/.test(label)) return true;
	return false;
}

function lookupWorkoutTypeIcon(label: string): string | null {
	if (!label) return null;
	if (WORKOUT_TYPE_TO_ICON[label]) return WORKOUT_TYPE_TO_ICON[label];
	for (const [pattern, icon] of Object.entries(WORKOUT_TYPE_TO_ICON)) {
		if (label.includes(pattern) || pattern.includes(label)) return icon;
	}
	return null;
}

function isLegacyGravlWorkout(input: WorkoutIconInput): boolean {
	if (normalizeWorkoutLabel(input.importSource) === "gravl") return true;
	if (normalizeWorkoutLabel(input.importSource)) return false;
	if (!input.hasPulseSession) return false;
	if (input.importedActivityType?.trim()) return false;
	const typeNorm = normalizeWorkoutLabel(input.type);
	const nameNorm = normalizeWorkoutLabel(input.name);
	if (!typeNorm.includes("traditional strength")) return false;
	return Boolean(nameNorm && nameNorm !== typeNorm);
}

export function resolveWorkoutIconName(input: WorkoutIconInput): string {
	if (normalizeWorkoutLabel(input.importSource) === "gravl") return "gravl";
	if (isLegacyGravlWorkout(input)) return "gravl";

	const labels = [
		input.name,
		input.type,
		input.programDay,
		input.importedActivityType,
	]
		.map(normalizeWorkoutLabel)
		.filter(Boolean);

	for (const label of labels) {
		if (isSaunaLabel(label)) return "sauna";
	}

	for (const label of labels) {
		if (isStrengthDayLabel(label)) return "strength";
	}

	for (const label of labels) {
		const icon = lookupWorkoutTypeIcon(label);
		if (icon) return icon;
	}

	return "other";
}

export function workoutIconInputFromFrontmatter(
	fm: Record<string, unknown>,
	opts?: { hasPulseSession?: boolean },
): WorkoutIconInput {
	return {
		name: fm.name != null ? String(fm.name) : undefined,
		type: fm.type != null ? String(fm.type) : undefined,
		programDay: fm.programDay != null ? String(fm.programDay) : undefined,
		importSource: fm.importSource != null ? String(fm.importSource) : undefined,
		importedActivityType:
			fm.importedActivityType != null ? String(fm.importedActivityType) : undefined,
		hasPulseSession: opts?.hasPulseSession,
	};
}

export function getActivityIconResourcePath(vault: Vault, iconName: string): string | null {
	const path = `${ACTIVITY_ICONS_FOLDER}/${iconName}.png`;
	const file = vault.getAbstractFileByPath(path);
	if (file instanceof TFile) return vault.getResourcePath(file);
	return null;
}

/** Fuzzy match PNG basenames under `activityIcons/` when map lookup fails. */
export function scanVaultForActivityIcon(vault: Vault, labels: string[]): string | null {
	const folder = vault.getAbstractFileByPath(ACTIVITY_ICONS_FOLDER);
	if (!folder || !("children" in folder)) return null;

	const candidates: { base: string; len: number }[] = [];
	for (const label of labels.map(normalizeWorkoutLabel).filter(Boolean)) {
		for (const child of (folder as TFolder).children) {
			if (!(child instanceof TFile) || child.extension !== "png") continue;
			const base = child.basename.toLowerCase();
			if (!base) continue;
			if (label.includes(base) || base.includes(label)) {
				candidates.push({ base: child.basename, len: base.length });
			}
		}
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.len - a.len);
	return candidates[0]!.base;
}

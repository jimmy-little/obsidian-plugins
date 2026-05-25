import { durationSecondsFromWorkoutFrontmatter, startIsoFromWorkoutFrontmatter } from "../import/workoutDedup";
import type { SessionData } from "./types";

export interface WorkoutStatItem {
	label: string;
	value: string;
}

function num(v: unknown): number | undefined {
	if (typeof v === "number" && !Number.isNaN(v)) return v;
	if (typeof v === "string" && v.trim() !== "") {
		const n = parseFloat(v);
		return Number.isNaN(n) ? undefined : n;
	}
	return undefined;
}

export function formatWorkoutDuration(seconds: number): string {
	if (seconds <= 0) return "";
	if (seconds < 60) return `${seconds}s`;
	const mins = Math.round(seconds / 60);
	if (mins < 60) return `${mins} min`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatStartLabel(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function computeSessionVolume(session: SessionData): number {
	let vol = 0;
	for (const ex of session.exercises) {
		for (const set of ex.sets) {
			if (set.weight != null && set.reps != null && set.weight > 0 && set.reps > 0) {
				vol += set.weight * set.reps;
			}
		}
	}
	return vol;
}

function sumSessionDistance(session: SessionData): number {
	let dist = 0;
	for (const ex of session.exercises) {
		for (const set of ex.sets) {
			if (set.distance != null && set.distance > 0) dist += set.distance;
		}
	}
	return dist;
}

function countSets(session: SessionData): number {
	return session.exercises.reduce((n, ex) => n + ex.sets.length, 0);
}

export function buildWorkoutSessionStats(
	rawFm: Record<string, unknown>,
	session: SessionData,
	weightUnit: string
): WorkoutStatItem[] {
	const stats: WorkoutStatItem[] = [];

	const durSec = durationSecondsFromWorkoutFrontmatter(rawFm);
	if (durSec > 0) {
		stats.push({ label: "Duration", value: formatWorkoutDuration(durSec) });
	}

	const calories = num(rawFm.calories);
	if (calories != null && calories > 0) {
		stats.push({ label: "Calories", value: `${Math.round(calories)} kcal` });
	}

	const hrAvg = num(rawFm.hrAvg);
	if (hrAvg != null && hrAvg > 0) {
		stats.push({ label: "Avg HR", value: `${Math.round(hrAvg)} bpm` });
	}

	const hrMax = num(rawFm.hrMax);
	if (hrMax != null && hrMax > 0) {
		stats.push({ label: "Max HR", value: `${Math.round(hrMax)} bpm` });
	}

	const intensity = num(rawFm.intensity);
	if (intensity != null && intensity > 0) {
		stats.push({ label: "Intensity", value: intensity.toFixed(1) });
	}

	const dist = sumSessionDistance(session);
	if (dist > 0) {
		stats.push({ label: "Distance", value: `${dist.toFixed(2)} mi` });
	}

	const setCount = countSets(session);
	if (setCount > 0) {
		stats.push({ label: "Sets", value: String(setCount) });
	}

	const volume = computeSessionVolume(session);
	if (volume > 0) {
		stats.push({
			label: "Volume",
			value: `${Math.round(volume).toLocaleString()} ${weightUnit}`,
		});
	}

	const start = startIsoFromWorkoutFrontmatter(rawFm);
	if (start) {
		stats.push({ label: "Start", value: formatStartLabel(start) });
	}

	return stats;
}

export function renderWorkoutStatCards(parent: HTMLElement, stats: WorkoutStatItem[]): void {
	if (stats.length === 0) return;
	const row = parent.createDiv({ cls: "pulse-workout-session-stats" });
	for (const stat of stats) {
		const card = row.createDiv({ cls: "pulse-workout-session-stats__card" });
		card.createDiv({ cls: "pulse-workout-session-stats__label", text: stat.label });
		card.createDiv({ cls: "pulse-workout-session-stats__value", text: stat.value });
	}
}

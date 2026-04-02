import { TFile } from "obsidian";
import type { DistanceUnit } from "./exerciseKind";

export interface SetEntry {
	set: number;
	weight?: number;
	reps?: number;
	duration?: number;
	/** Distance for cardio (e.g. miles or km); unit is per-exercise */
	distance?: number;
	note?: string;
}

export interface ExerciseLogEntry {
	date: string;
	sessionPath: string;
	sets: SetEntry[];
}

export interface ExerciseFrontmatter {
	"pulse-type": "exercise";
	name: string;
	movement: string;
	equipment: string;
	/** Muscle / region (e.g. chest, back, shoulders) */
	body_part: string;
	unit: "lb" | "kg";
	/** For movement Cardio: label for distance column (mi / km / m) */
	"distance-unit"?: "mi" | "km" | "m";
	tags?: string[];
	"pr-weight"?: number;
	"pr-date"?: string;
}

export interface ExerciseNote {
	file: TFile;
	frontmatter: ExerciseFrontmatter;
	log: ExerciseLogEntry[];
}

export interface SessionExercise {
	exercisePath: string;
	order: number;
	sets: SetEntry[];
}

export interface SessionData {
	exercises: SessionExercise[];
}

export interface SessionFrontmatter {
	"pulse-type": "session";
	date: string;
	program?: string;
	programDay?: string;
	duration?: number;
	bodyweight?: number;
	notes?: string;
	startTime?: string;
	importedActivityType?: string;
	importedStart?: string;
	importedEnd?: string;
	importedDuration?: number;
	hrAvg?: number;
	hrMax?: number;
	importedAt?: string;
}

export interface SessionNote {
	file: TFile;
	frontmatter: SessionFrontmatter;
	session: SessionData;
}

/** Session not linked to a program (sidebar “Workouts” list, edit flow). */
export function isStandaloneSession(note: SessionNote): boolean {
	const p = note.frontmatter.program;
	return p == null || String(p).trim() === "";
}

export interface ProgramExercise {
	exercisePath: string;
	sets: number;
	reps?: number;
	duration?: number;
	rpe?: number | null;
}

export interface ProgramDay {
	name: string;
	exercises: ProgramExercise[];
}

export interface ProgramNote {
	file: TFile;
	name: string;
	schedule: string[];
	rotation: "sequential" | "weekday-mapped";
	active: boolean;
	days: ProgramDay[];
}

export interface PRRecord {
	weight: number;
	date: string;
	reps: number;
}

export interface NewExerciseData {
	name: string;
	movement: string;
	equipment: string;
	body_part?: string;
	unit: "lb" | "kg";
	tags?: string[];
}

export interface NewProgramData {
	name: string;
	schedule: string[];
	rotation: "sequential" | "weekday-mapped";
	active: boolean;
	days: ProgramDay[];
}

export interface ActiveWorkoutState {
	sessionPath: string | null;
	programName?: string;
	programDayName?: string;
	exercises: ActiveExercise[];
	startTime: number;
	bodyweight?: number;
}

export interface ActiveExercise {
	exercisePath: string;
	exerciseName: string;
	/** From exercise note; drives strength vs cardio logging */
	movement: string;
	/** Shown next to distance field for cardio */
	distanceUnit: DistanceUnit;
	sets: ActiveSet[];
	previousBest?: { weight: number; reps: number };
	/** Last session snapshot for cardio header */
	previousCardio?: { duration?: number; distance?: number };
}

export interface ActiveSet {
	set: number;
	weight?: number;
	reps?: number;
	/** Elapsed time for a set (seconds), esp. cardio */
	duration?: number;
	distance?: number;
	note?: string;
	completed: boolean;
}

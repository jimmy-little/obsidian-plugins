/**
 * Cross-source workout de-duplication (e.g. Gravl + Health Auto Export).
 */

import type { TFile } from "obsidian";

export type WorkoutKind = "strength" | "cardio" | "other";

const TIME_BUCKET_MS = 180_000;
const DURATION_BUCKET_SEC = 30;
const LOOSE_DURATION_BUCKET_SEC = 300;

const CARDIO_RE =
	/walk|run|cycl|swim|elliptical|hike|yoga|row|stair|dance|mindful|cooldown|sauna|pilates|barre/i;
const STRENGTH_RE = /strength|traditional|hiit|functional|training|gym|lift|press|squat|deadlift/i;

export function inferWorkoutKindFromName(name: string): WorkoutKind {
	const n = (name ?? "").trim();
	if (!n) return "other";
	if (CARDIO_RE.test(n)) return "cardio";
	if (STRENGTH_RE.test(n)) return "strength";
	return "other";
}

const GENERIC_WORKOUT_NAME_RE =
	/^(traditional strength training|mind & body|core training|pilates|other|workout|unknown)$/i;

export function isGenericWorkoutDisplayName(name: string): boolean {
	return GENERIC_WORKOUT_NAME_RE.test(name.trim());
}

export function preferWorkoutDisplayName(a: string, b: string): string {
	const ta = a.trim();
	const tb = b.trim();
	if (ta && !isGenericWorkoutDisplayName(ta)) return ta;
	if (tb && !isGenericWorkoutDisplayName(tb)) return tb;
	return ta || tb;
}

/** Buckets start time (3 min) + duration (30 s) + coarse kind for stable cross-app keys. */
export function computePulseDedupKey(params: {
	startIso: string;
	durationSec: number;
	kind: WorkoutKind;
}): string {
	const d = new Date(params.startIso);
	if (isNaN(d.getTime())) return "";
	const anchor = Math.round(d.getTime() / TIME_BUCKET_MS) * TIME_BUCKET_MS;
	const durB = Math.max(30, Math.round(params.durationSec / DURATION_BUCKET_SEC) * DURATION_BUCKET_SEC);
	return `${anchor}|${durB}|${params.kind}`;
}

/** Kind-agnostic key with wider duration buckets — Gravl vs Health often disagree on minutes. */
export function computePulseDedupKeyLoose(params: {
	startIso: string;
	durationSec: number;
}): string {
	const d = new Date(params.startIso);
	if (isNaN(d.getTime())) return "";
	const anchor = Math.round(d.getTime() / TIME_BUCKET_MS) * TIME_BUCKET_MS;
	const durB = Math.max(
		60,
		Math.round(params.durationSec / LOOSE_DURATION_BUCKET_SEC) * LOOSE_DURATION_BUCKET_SEC,
	);
	return `${anchor}|${durB}`;
}

export function dedupKeyLooseFromFrontmatter(fm: Record<string, unknown>, path = ""): string | null {
	const explicit = fm.pulseDedupKeyLoose;
	if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

	const start = startIsoFromWorkoutFrontmatter(fm);
	if (!start) return null;
	const durSec = durationSecondsFromWorkoutFrontmatter(fm);
	if (durSec <= 0) return null;
	if (!isWorkoutDedupCandidate(fm, path)) return null;
	return computePulseDedupKeyLoose({ startIso: start, durationSec: durSec });
}

/** Try strict, cross-kind, adjacent buckets, then loose key. */
export function lookupDedupTargetFile(
	strictMap: Map<string, TFile>,
	looseMap: Map<string, TFile>,
	startIso: string,
	durationSec: number,
	kind: WorkoutKind,
): TFile | null {
	if (!startIso || durationSec <= 0) return null;

	const strict = computePulseDedupKey({ startIso, durationSec, kind });
	if (strict) {
		const hit = strictMap.get(strict);
		if (hit) return hit;
	}

	for (const k of ["strength", "cardio", "other"] as const) {
		const key = computePulseDedupKey({ startIso, durationSec, kind: k });
		const hit = strictMap.get(key);
		if (hit) return hit;
	}

	const startMs = new Date(startIso).getTime();
	if (!Number.isNaN(startMs)) {
		for (const deltaMs of [-TIME_BUCKET_MS, TIME_BUCKET_MS]) {
			const adj = new Date(startMs + deltaMs).toISOString();
			for (const k of ["strength", "cardio", "other"] as const) {
				const key = computePulseDedupKey({ startIso: adj, durationSec, kind: k });
				const hit = strictMap.get(key);
				if (hit) return hit;
			}
		}
	}

	for (const dDelta of [-30, 30, -60, 60, -120, 120]) {
		const adjDur = Math.max(30, durationSec + dDelta);
		for (const k of ["strength", "cardio", "other"] as const) {
			const key = computePulseDedupKey({ startIso, durationSec: adjDur, kind: k });
			const hit = strictMap.get(key);
			if (hit) return hit;
		}
	}

	const loose = computePulseDedupKeyLoose({ startIso, durationSec });
	if (loose) {
		const hit = looseMap.get(loose);
		if (hit) return hit;
	}

	return null;
}

export function durationSecondsFromWorkoutFrontmatter(fm: Record<string, unknown>): number {
	const imp = fm.importedDuration;
	if (typeof imp === "number" && imp > 0) return Math.round(imp);
	const d = Number(fm.duration);
	if (!Number.isFinite(d) || d <= 0) return 0;
	if (fm["pulse-type"] === "session") return Math.round(d * 60);
	if (fm.workoutId != null && String(fm.workoutId).trim() !== "") {
		return d > 400 ? Math.round(d) : Math.round(d * 60);
	}
	return d > 400 ? Math.round(d) : Math.round(d * 60);
}

export function startIsoFromWorkoutFrontmatter(fm: Record<string, unknown>): string {
	const s =
		(typeof fm.start === "string" && fm.start.trim()) ||
		(typeof fm.importedStart === "string" && fm.importedStart.trim()) ||
		(typeof fm.startTime === "string" && fm.startTime.trim()) ||
		"";
	return s;
}

/** Imported workout notes under `…/Workouts/…` with `YYYYMMDD-HHMM-` filename prefix. */
export function isLikelyImportedWorkoutPath(path: string, basename?: string): boolean {
	const norm = path.replace(/\\/g, "/");
	const base = basename ?? norm.split("/").pop() ?? "";
	return /\/Workouts\//i.test(norm) && /^\d{8}-\d{4}-/.test(base);
}

/** Parse date/time/name from import filename when metadata cache is empty or incomplete. */
export function fallbackWorkoutFrontmatterFromBasename(basename: string): Record<string, unknown> {
	const base = basename.replace(/\.md$/i, "");
	const m = base.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})-(.+)$/);
	if (!m) return { name: base };
	const [, y, mo, d, hh, mm, rest] = m;
	return {
		date: `${y}-${mo}-${d}`,
		start: `${y}-${mo}-${d}T${hh}:${mm}:00`,
		name: rest!.replace(/-/g, " "),
	};
}

/** Local calendar date (`YYYY-MM-DD`) from workout frontmatter. */
export function workoutDateFromFrontmatter(fm: Record<string, unknown>): string {
	const date = fm.date;
	if (date != null && String(date).trim()) return String(date).trim().slice(0, 10);
	const start = startIsoFromWorkoutFrontmatter(fm);
	return start ? start.slice(0, 10) : "";
}

/** Notes that should participate in cross-source workout de-duplication. */
export function isWorkoutDedupCandidate(fm: Record<string, unknown>, path = ""): boolean {
	if (fm.workoutId != null && String(fm.workoutId).trim()) return true;
	if (fm["pulse-type"] === "session") return true;
	if (fm.importedStart != null || fm.importedActivityType != null) return true;
	if (fm.importedAt != null && (fm.calories != null || fm.hrAvg != null)) return true;

	const type = String(fm.type ?? "");
	if (/meeting|trip/i.test(type)) return false;
	if (fm.organizer != null || fm.tripFrom != null || fm.tripTo != null) return false;

	const normPath = path.replace(/\\/g, "/");
	if (normPath.includes("/Time Tracking/")) return false;

	if (/\/Workouts\//i.test(normPath)) {
		const start = startIsoFromWorkoutFrontmatter(fm);
		const durSec = durationSecondsFromWorkoutFrontmatter(fm);
		if (start && durSec > 0) return true;
	}

	if (fm.calories != null && startIsoFromWorkoutFrontmatter(fm)) return true;

	return false;
}

export function dedupKeyFromFrontmatter(
	fm: Record<string, unknown>,
	path = ""
): string | null {
	if (!isWorkoutDedupCandidate(fm, path)) return null;

	const explicit = fm.pulseDedupKey;
	if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

	const start = startIsoFromWorkoutFrontmatter(fm);
	if (!start) return null;
	const durSec = durationSecondsFromWorkoutFrontmatter(fm);
	if (durSec <= 0) return null;
	const name = String(fm.name ?? fm.importedActivityType ?? "");
	const kind = inferWorkoutKindFromName(name);
	return computePulseDedupKey({ startIso: start, durationSec: durSec, kind });
}

/**
 * Merge incoming import YAML into existing note: fill blanks; keep pulseDedupKey.
 */
export function mergeWorkoutImportFrontmatter(
	existing: Record<string, string | number>,
	incoming: Record<string, unknown>,
	dedupKey: string
): Record<string, string | number> {
	const out: Record<string, string | number> = { ...existing };
	for (const [k, v] of Object.entries(incoming)) {
		if (v === undefined || v === null) continue;
		if (k === "pulseDedupKey") continue;
		if (typeof v === "object" && !Array.isArray(v)) continue;
		const cur = out[k];
		const empty = cur === undefined || cur === "" || cur === null;
		if (empty) {
			if (typeof v === "number" && !Number.isNaN(v)) out[k] = v;
			else if (typeof v === "boolean") out[k] = v ? "true" : "false";
			else out[k] = String(v);
		}
	}
	if (dedupKey) {
		out.pulseDedupKey = dedupKey;
	}
	const start = startIsoFromWorkoutFrontmatter({ ...existing, ...incoming } as Record<string, unknown>);
	const durSec = durationSecondsFromWorkoutFrontmatter({ ...existing, ...incoming } as Record<string, unknown>);
	if (start && durSec > 0) {
		out.pulseDedupKeyLoose = computePulseDedupKeyLoose({ startIso: start, durationSec: durSec });
	}
	const outLo = out as Record<string, unknown>;
	const legacyGt = outLo.globalType;
	if (legacyGt != null && String(legacyGt).trim() !== "") {
		const curType = outLo.type;
		if (curType === undefined || curType === "" || curType === null) {
			out.type = typeof legacyGt === "number" ? String(legacyGt) : String(legacyGt).trim();
		}
	}
	delete outLo.globalType;
	return out;
}

/** Append new markdown sections that are missing from the existing body. */
export function mergeWorkoutImportBodies(existingBody: string, incomingBody: string): string {
	const ex = (existingBody ?? "").trim();
	const inc = (incomingBody ?? "").trim();
	if (!ex) return inc;
	if (!inc) return ex;

	const markers = ["## Gravl sets", "## Heart Rate", "## Route", "```pulse-session"];
	let add = inc;
	for (const m of markers) {
		if (inc.includes(m) && !ex.includes(m)) {
			const idx = inc.indexOf(m);
			const slice = inc.slice(idx).trim();
			if (slice && !ex.includes(slice.slice(0, Math.min(80, slice.length)))) {
				return `${ex}\n\n${slice}`;
			}
		}
	}
	if (inc.length > ex.length * 1.2 && inc.includes("##")) {
		return `${ex}\n\n${inc}`;
	}
	return ex;
}

/**
 * Cross-source workout de-duplication (e.g. Gravl + Health Auto Export).
 */

export type WorkoutKind = "strength" | "cardio" | "other";

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

/** Buckets start time (3 min) + duration (30 s) + coarse kind for stable cross-app keys. */
export function computePulseDedupKey(params: {
	startIso: string;
	durationSec: number;
	kind: WorkoutKind;
}): string {
	const d = new Date(params.startIso);
	if (isNaN(d.getTime())) return "";
	const anchor = Math.round(d.getTime() / 180000) * 180000;
	const durB = Math.max(30, Math.round(params.durationSec / 30) * 30);
	return `${anchor}|${durB}|${params.kind}`;
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

export function dedupKeyFromFrontmatter(fm: Record<string, unknown>): string | null {
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

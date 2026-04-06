import type { AutoExportParsed, FITINDEXRow } from "./types";

export function parseAutoExportJson(jsonText: string): AutoExportParsed {
	const raw = JSON.parse(jsonText) as Record<string, unknown>;
	const data = raw.data as Record<string, unknown> | undefined;
	const workouts = (data && Array.isArray(data.workouts)) ? data.workouts : [];
	const metrics = (data && Array.isArray(data.metrics)) ? data.metrics : undefined;
	const sleepAnalysis = Array.isArray(raw.sleep_analysis) ? raw.sleep_analysis : undefined;
	return { workouts, metrics, sleepAnalysis };
}

export function isAutoExportJson(parsed: AutoExportParsed): boolean {
	return parsed.workouts.length > 0 || (parsed.metrics?.length ?? 0) > 0 || (parsed.sleepAnalysis?.length ?? 0) > 0;
}

function parseFITINDEXDate(raw: string): string {
	const mmddyyyy = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (mmddyyyy) {
		const [, m, d, y] = mmddyyyy;
		return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
	}
	const mmddyy = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
	if (mmddyy) {
		const [, m, d, y2] = mmddyy;
		const y = parseInt(y2, 10) < 50 ? `20${y2}` : `19${y2}`;
		return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
	}
	const yyyymmdd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return yyyymmdd ? yyyymmdd[1] + "-" + yyyymmdd[2] + "-" + yyyymmdd[3] : "";
}

function norm(s: string): string {
	return (s ?? "").trim().replace(/\s+/g, " ").replace(/^\uFEFF/, "");
}

function applyFITINDEXByIndex(row: FITINDEXRow, values: string[]): void {
	const raw = (i: number) => values[i]?.trim().replace(/^["']|["']$/g, "") ?? "";
	if (values.length < 14) return;
	const dateStr = parseFITINDEXDate(raw(0));
	if (dateStr) row.date = dateStr;
	row.time = raw(0);
	if (row.weightLb == null) row.weightLb = parseNum(raw(1));
	if (row.bmi == null) row.bmi = parseNum(raw(2));
	if (row.bodyFatPct == null) row.bodyFatPct = parseNum(raw(3));
	if (row.fatFreeWeightLb == null) row.fatFreeWeightLb = parseNum(raw(4));
	if (row.subcutaneousFatPct == null) row.subcutaneousFatPct = parseNum(raw(5));
	if (row.visceralFat == null) row.visceralFat = parseNum(raw(6));
	if (row.bodyWaterPct == null) row.bodyWaterPct = parseNum(raw(7));
	if (row.skeletalMusclePct == null) row.skeletalMusclePct = parseNum(raw(8));
	if (row.muscleMassLb == null) row.muscleMassLb = parseNum(raw(9));
	if (row.boneMassLb == null) row.boneMassLb = parseNum(raw(10));
	if (row.proteinPct == null) row.proteinPct = parseNum(raw(11));
	if (row.bmrKcal == null) row.bmrKcal = parseNum(raw(12));
	if (row.metabolicAge == null) row.metabolicAge = parseNum(raw(13));
}

export function parseFITINDEXCsv(csvText: string, options?: { indexFallback?: boolean }): FITINDEXRow[] {
	const indexFallback = options?.indexFallback !== false;
	const lines = csvText.trim().split(/\r?\n/).filter((line) => line.trim());
	if (lines.length < 2) return [];
	const headerLine = lines[0].replace(/^\uFEFF/, "");
	const headers = headerLine.split(",").map((h) => h.trim());
	const rows: FITINDEXRow[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values = parseCsvLine(lines[i]);
		const row: FITINDEXRow = { date: "", time: "" };

		for (let c = 0; c < headers.length && c < values.length; c++) {
			const key = norm(headers[c]);
			const raw = values[c]?.trim() ?? "";
			if (key === "Date") {
				const parsed = parseFITINDEXDate(raw);
				if (parsed) row.date = parsed;
			} else if (key === "Time" || key === "Time of Measurement") {
				row.time = raw.replace(/^["']|["']$/g, "");
				if (!row.date) row.date = parseFITINDEXDate(row.time) || (row.time.match(/^\d{4}-\d{2}-\d{2}/) ? row.time.slice(0, 10) : "");
			} else if (key === "Weight (kg)") row.weightKg = parseNum(raw);
			else if (key === "Weight(lb)" || key === "Weight (lb)") row.weightLb = parseNum(raw);
			else if (key === "BMI") row.bmi = parseNum(raw);
			else if (key === "Body Fat (%)" || key === "Body Fat(%)" || key === "Body Fat Percentage (%)" || key === "Body Fat Percentage(%)") row.bodyFatPct = parseNum(raw);
			else if (key === "Body Fat Mass(lb)" || key === "Body Fat Mass (lb)") row.bodyFatMassLb = parseNum(raw);
			else if (key === "Fat-free Body Weight (kg)") row.fatFreeWeightKg = parseNum(raw);
			else if (key === "Fat-free Body Weight(lb)" || key === "Fat-free Body Weight (lb)" || key === "Fat-Free Mass (lb)" || key === "Fat-Free Mass(lb)") row.fatFreeWeightLb = parseNum(raw);
			else if (key === "Subcutaneous Fat (%)" || key === "Subcutaneous Fat(%)") row.subcutaneousFatPct = parseNum(raw);
			else if (key === "Visceral Fat") row.visceralFat = parseNum(raw);
			else if (key === "Body Water (%)" || key === "Body Water(%)" || key === "Body Water Percentage (%)" || key === "Body Water Percentage(%)") row.bodyWaterPct = parseNum(raw);
			else if (key === "Body Water Mass(lb)" || key === "Body Water Mass (lb)") row.bodyWaterMassLb = parseNum(raw);
			else if (key === "Muscle Percentage (%)" || key === "Muscle Percentage(%)") row.musclePct = parseNum(raw);
			else if (key === "Skeletal Muscle (%)" || key === "Skeletal Muscle(%)" || key === "Skeletal Muscle Percentage (%)" || key === "Skeletal Muscle Percentage(%)") row.skeletalMusclePct = parseNum(raw);
			else if (key === "Muscle Mass (kg)") row.muscleMassKg = parseNum(raw);
			else if (key === "Muscle Mass(lb)" || key === "Muscle Mass (lb)" || key === "Skeletal Muscle Mass(lb)" || key === "Skeletal Muscle Mass (lb)") row.muscleMassLb = parseNum(raw);
			else if (key === "Bone Mass (kg)") row.boneMassKg = parseNum(raw);
			else if (key === "Bone Mass(lb)" || key === "Bone Mass (lb)") row.boneMassLb = parseNum(raw);
			else if (key === "Protein (%)" || key === "Protein(%)" || key === "Protein Percentage (%)" || key === "Protein Percentage(%)") row.proteinPct = parseNum(raw);
			else if (key === "Protein Mass(lb)" || key === "Protein Mass (lb)") row.proteinMassLb = parseNum(raw);
			else if (key === "BMR (kcal)" || key === "BMR(kcal)") row.bmrKcal = parseNum(raw);
			else if (key === "Metabolic Age") row.metabolicAge = parseNum(raw);
			else if (key === "WHR (Waist-to-Hip Ratio)" || key === "WHR") row.whr = parseNum(raw);
			else if (key === "Optimal Weight(lb)" || key === "Optimal Weight (lb)") row.optimalWeightLb = parseNum(raw);
			else if (key === "Weight Level") row.weightLevel = raw.replace(/^["']|["']$/g, "").trim() || undefined;
			else if (key === "Body Type") row.bodyType = raw.replace(/^["']|["']$/g, "").trim() || undefined;
		}

		if (indexFallback) applyFITINDEXByIndex(row, values);
		if (row.date) rows.push(row);
	}

	return rows;
}

export function parseNum(s: string): number | undefined {
	const t = (s ?? "").trim().replace(/^["']|["']$/g, "");
	if (t === "" || t === "--" || t === "−" || t === "–") return undefined;
	const n = parseFloat(t);
	return isNaN(n) ? undefined : n;
}

export function parseCsvLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
		} else if ((ch === "," && !inQuotes) || ch === "\n") {
			result.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	result.push(current);
	return result;
}

export function isFITINDEXCsvFileName(fileName: string): boolean {
	return fileName.toUpperCase().includes("FITINDEX") && fileName.toLowerCase().endsWith(".csv");
}

export function isRENPHOCsvFileName(fileName: string): boolean {
	return fileName.toUpperCase().includes("RENPHO") && fileName.toLowerCase().endsWith(".csv");
}

/** Workouts summary CSV from Health Auto Export zip (hyphen or underscore prefix, any casing). */
export function isHealthAutoExportWorkoutsCsv(fileName: string): boolean {
	const n = fileName.toLowerCase();
	return n.endsWith(".csv") && (n.startsWith("workouts-") || n.startsWith("workouts_"));
}

/**
 * Wide daily summary CSV from Health Auto Export (zip), e.g. `HealthAutoExport-2026-01-01-2026-02-01.csv`
 * or `HealthAutoExport_2026-01-01-2026-02-01.csv` (newer exports often use underscores).
 */
export function isHealthAutoExportDailyCsv(fileName: string): boolean {
	const n = fileName.toLowerCase();
	return n.endsWith(".csv") && (n.startsWith("healthautoexport-") || n.startsWith("healthautoexport_"));
}

export interface HealthAutoExportDailyRow {
	date: string;
	metrics: Record<string, number>;
}

function parseHealthAutoExportDailyDate(raw: string): string {
	const s = (raw ?? "").trim();
	const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
	return iso ? iso[1]! : "";
}

/**
 * Map Health Auto Export daily CSV column titles to stats-note YAML keys (same as JSON metric import).
 * Returns null for the date column and unknown columns.
 */
export function mapHealthAutoExportDailyHeaderToKey(header: string): string | null {
	const h = header.trim().toLowerCase();
	if (h === "date/time" || h.startsWith("date/time")) return null;

	if (h.includes("step count")) return "steps";
	if (h.includes("active energy") && h.includes("kcal")) return "activeCalories";
	if (h.includes("apple exercise time")) return "exerciseMinutes";
	if (h.includes("walking + running distance")) return "distance";
	if (h.includes("flights climbed")) return "flights";
	if (h.includes("vo2 max")) return "vo2Max";
	if (h.includes("blood oxygen")) return "bloodOxygen";
	if (h === "weight (lb)" || (h.includes("weight") && h.includes("lb"))) return "weight";
	if (h.includes("body mass index")) return "bmi";
	if (h.includes("body fat percentage")) return "bfp";
	if (h.includes("lean body mass")) return "lbm";
	if (h.includes("apple sleeping wrist temperature")) return "wristTemp";
	if (h.includes("heart rate variability")) return "hrv";
	if (h.includes("resting heart rate")) return "restingHr";
	if (h.includes("respiratory rate")) return "respiratoryRate";
	if (h.includes("heart rate") && h.includes("[avg]")) return "hr";
	if (h.includes("heart rate") && h.includes("[min]")) return "hrMin";
	if (h.includes("heart rate") && h.includes("[max]")) return "hrMax";
	if (h.includes("mindful minutes")) return "mindfulMinutes";
	if (h.includes("sleep analysis") && h.includes("asleep")) return "timeAsleep";
	if (h.includes("sleep analysis") && h.includes("[deep]")) return "deepSleep";
	if (h.includes("sleep analysis") && h.includes("[core]")) return "sleepCore";
	if (h.includes("sleep analysis") && h.includes("[rem]")) return "remSleep";
	if (h.includes("sleep analysis") && h.includes("awake")) return "sleepAwake";
	if (h.includes("time in daylight")) return "daylightMinutes";

	return null;
}

export function parseHealthAutoExportDailyCsv(csvText: string): HealthAutoExportDailyRow[] {
	const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];
	const headers = parseCsvLine(lines[0]!.replace(/^\uFEFF/, "")).map((x) => x.trim());
	const colKeys = headers.map((h) => mapHealthAutoExportDailyHeaderToKey(h));
	const rows: HealthAutoExportDailyRow[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values = parseCsvLine(lines[i]!);
		if (values.length === 0) continue;
		const dateStr = parseHealthAutoExportDailyDate(values[0] ?? "");
		if (!dateStr) continue;
		const metrics: Record<string, number> = {};
		for (let c = 1; c < headers.length && c < values.length; c++) {
			const key = colKeys[c];
			if (!key) continue;
			const n = parseNum(values[c] ?? "");
			if (n === undefined) continue;
			metrics[key] = n;
		}
		if (Object.keys(metrics).length > 0) {
			rows.push({ date: dateStr, metrics });
		}
	}
	return rows;
}

function parseDurationToSeconds(s: string): number {
	const parts = (s || "").trim().split(":").map((p) => parseInt(p, 10) || 0);
	if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return parts[0] || 0;
}

export function parseHealthAutoExportWorkoutsCsv(csvText: string): Record<string, unknown>[] {
	const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];
	const headerLine = lines[0].replace(/^\uFEFF/, "");
	const headers = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());
	const col = (name: string) => headers.findIndex((h) => h.includes(name.toLowerCase()));
	let idxType = col("workout type");
	if (idxType < 0) {
		const byActivity = headers.findIndex((h) => h === "activity" || h === "type");
		idxType = byActivity >= 0 ? byActivity : 0;
	}
	let idxStart = col("start");
	if (idxStart < 0) idxStart = headers.findIndex((h) => h === "start" || h.startsWith("start "));
	if (idxStart < 0) idxStart = 1;
	let idxEnd = col("end");
	if (idxEnd < 0) idxEnd = headers.findIndex((h) => h === "end" || h.startsWith("end "));
	if (idxEnd < 0) idxEnd = 2;
	let idxDuration = col("duration");
	if (idxDuration < 0) idxDuration = headers.findIndex((h) => h.includes("duration"));
	if (idxDuration < 0) idxDuration = 3;
	const idxActiveEnergy = col("active energy") >= 0 ? col("active energy") : 4;
	const idxRestingEnergy = col("resting energy") >= 0 ? col("resting energy") : -1;
	const idxIntensity = col("intensity") >= 0 ? col("intensity") : -1;
	const idxMaxHr = headers.findIndex((h) => h.includes("max") && h.includes("heart"));
	const idxAvgHr = headers.findIndex((h) => h.includes("avg") && h.includes("heart"));
	const idxDistance = col("distance") >= 0 ? col("distance") : -1;
	const idxSteps = col("step count") >= 0 ? col("step count") : -1;
	const idxFlights = col("flights") >= 0 ? col("flights") : -1;
	const idxLocation = col("location") >= 0 ? col("location") : -1;
	const workouts: Record<string, unknown>[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values = parseCsvLine(lines[i]);
		const get = (idx: number) => (idx >= 0 && values[idx] !== undefined ? values[idx].trim() : "");
		const getNum = (idx: number) => (idx >= 0 && values[idx] !== undefined ? parseFloat(values[idx]) : undefined);
		const name = get(idxType) || "Unknown";
		const start = get(idxStart);
		if (!start) continue;
		const end = get(idxEnd);
		const durationStr = get(idxDuration);
		const durationSec = durationStr ? parseDurationToSeconds(durationStr) : undefined;
		const activeKcal = getNum(idxActiveEnergy);
		const workout: Record<string, unknown> = {
			name,
			start,
			end: end || undefined,
			duration: durationSec,
			activeEnergyBurned: activeKcal != null ? { qty: activeKcal, units: "kcal" } : undefined,
			calories: activeKcal,
		};
		const restingEnergy = getNum(idxRestingEnergy);
		if (restingEnergy != null) workout.restingEnergy = { qty: restingEnergy, units: "kcal" };
		const intensity = getNum(idxIntensity);
		if (intensity != null) workout.intensity = { qty: intensity, units: "kcal/hr·kg" };
		const maxHr = getNum(idxMaxHr);
		if (maxHr != null) workout.heartRateMax = maxHr;
		const avgHr = getNum(idxAvgHr);
		if (avgHr != null) workout.heartRateAvg = avgHr;
		const distance = getNum(idxDistance);
		if (distance != null) workout.distance = { qty: distance, units: "km" };
		const steps = getNum(idxSteps);
		if (steps != null) workout.stepCount = steps;
		const flights = getNum(idxFlights);
		if (flights != null) workout.flightsClimbed = flights;
		if (get(idxLocation)) workout.location = get(idxLocation);
		workouts.push(workout);
	}
	return workouts;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, string | number>; body: string } {
	const frontmatter: Record<string, string | number> = {};
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	const body = match ? match[2] : content;
	const fmText = match ? match[1] : "";
	for (const line of fmText.split(/\r?\n/)) {
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		const raw = line.slice(colon + 1).trim();
		if (raw === "" || raw === '""' || raw === "''") {
			frontmatter[key] = "";
			continue;
		}
		const num = parseFloat(raw);
		if (!isNaN(num) && raw === num.toString()) {
			frontmatter[key] = num;
		} else {
			frontmatter[key] = raw.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
		}
	}
	return { frontmatter, body };
}

export function stringifyFrontmatter(fm: Record<string, string | number>): string {
	const lines: string[] = [];
	for (const [k, v] of Object.entries(fm)) {
		if (v === undefined || v === null) continue;
		if (typeof v === "number") {
			lines.push(`${k}: ${v}`);
		} else {
			const s = String(v);
			const needsQuotes = s.includes(":") || s.includes('"') || s.includes("\n") || s.includes(" ");
			lines.push(needsQuotes ? `${k}: "${s.replace(/"/g, '\\"')}"` : `${k}: ${s}`);
		}
	}
	return lines.join("\n") + "\n";
}

export function frontmatterWithoutBlanks(fm: Record<string, string | number>): Record<string, string | number> {
	const out: Record<string, string | number> = {};
	for (const [k, v] of Object.entries(fm)) {
		if (v === undefined || v === null) continue;
		if (typeof v === "string" && v.trim() === "") continue;
		out[k] = v;
	}
	return out;
}

export function getStatsNotePath(date: Date, pathTemplate: string): string {
	const template = pathTemplate?.trim() || "60 Logs/{year}/Stats/{month}/{date}.md";
	const year = date.getFullYear().toString();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const dateStr =
		date.getFullYear() +
		"-" +
		(date.getMonth() + 1).toString().padStart(2, "0") +
		"-" +
		date.getDate().toString().padStart(2, "0");
	return template.replace(/\{year\}/g, year).replace(/\{month\}/g, month).replace(/\{date\}/g, dateStr);
}

/**
 * Parse Health Auto Export per-workout files: `{Activity}-Heart Rate-{YYYYMMDD}_{HHMMSS}....csv`
 * Skips Heart Rate Recovery, Resting Energy, etc.
 */
export function parseHeartRateExportFilename(fileName: string): { name: string; start: string } | null {
	const base = fileName.replace(/\.csv$/i, "");
	const marker = "-Heart Rate-";
	const idx = base.indexOf(marker);
	if (idx < 0) return null;
	const activity = base.slice(0, idx).trim();
	let tail = base.slice(idx + marker.length);
	if (!activity) return null;
	if (tail.startsWith("Recovery")) return null;
	const m = tail.match(/^(\d{8})_(\d{2})(\d{2})(\d{2})/);
	if (!m) return null;
	const y = parseInt(m[1]!.slice(0, 4), 10);
	const mo = parseInt(m[1]!.slice(4, 6), 10);
	const d = parseInt(m[1]!.slice(6, 8), 10);
	const hh = parseInt(m[2]!, 10);
	const min = parseInt(m[3]!, 10);
	const ss = parseInt(m[4]!, 10);
	const dt = new Date(y, mo - 1, d, hh, min, ss);
	if (isNaN(dt.getTime())) return null;
	const pad = (n: number) => n.toString().padStart(2, "0");
	const start = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
	return { name: activity, start };
}

export function workoutIdFromWorkout(workout: { name?: string; start?: string }): string {
	const name = (workout?.name ?? "").trim() || "Unknown";
	const start = (workout?.start ?? "").toString().trim().slice(0, 19);
	const key = `${name}|${start}`;
	let h = 0;
	for (let i = 0; i < key.length; i++) {
		const c = key.charCodeAt(i);
		h = (h << 5) - h + c;
		h = h >>> 0;
	}
	const hex = (h >>> 0).toString(16).padStart(8, "0");
	let h2 = 5381;
	for (let i = 0; i < key.length; i++) h2 = (h2 * 33) ^ key.charCodeAt(i);
	const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
	const hex3 = (key.length + h + h2).toString(16).padStart(8, "0").slice(-8);
	const hex4 = (h ^ h2).toString(16).padStart(8, "0").slice(-8);
	return `${hex}-${hex2.slice(0, 4)}-${hex2.slice(4, 8)}-${hex3}-${hex4}${hex.slice(0, 4)}`;
}

function toCamelCase(s: string): string {
	const parts = s.split("_").filter(Boolean);
	if (parts.length === 0) return s;
	let out = parts[0].toLowerCase();
	for (let i = 1; i < parts.length; i++) {
		const w = parts[i];
		out += w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "";
	}
	return out;
}

export { toCamelCase };

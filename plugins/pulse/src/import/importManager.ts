import { Notice, TFile, TFolder, Vault } from "obsidian";
import JSZip from "jszip";
import type { PulseSettings } from "../settings";
import {
	parseAutoExportJson, isAutoExportJson, parseFITINDEXCsv,
	isFITINDEXCsvFileName, isRENPHOCsvFileName, isHealthAutoExportWorkoutsCsv,
	isHealthAutoExportDailyCsv, parseHealthAutoExportDailyCsv,
	parseHealthAutoExportWorkoutsCsv, parseFrontmatter, stringifyFrontmatter,
	frontmatterWithoutBlanks, getStatsNotePath, workoutIdFromWorkout,
	parseCsvLine, toCamelCase, parseHeartRateExportFilename,
} from "./parsers";
import {
	AUTOEXPORT_METRIC_TO_FRONTMATTER,
	WORKOUT_TYPE_TO_ICON,
	ACTIVITY_ICONS_FOLDER,
	KG_TO_LB,
} from "./types";
import type { ImportedWorkoutData, RoutePoint } from "./types";
import type { HealthAutoExportDailyRow } from "./parsers";
import type { WorkoutDataManager } from "../workout/WorkoutDataManager";

const DEFAULT_STATS_PATH_TEMPLATE = "60 Logs/{year}/Stats/{month}/{date}.md";

export class ImportManager {
	/** Maps `workoutId` frontmatter → note file (rebuilt when null). */
	private workoutIdIndex: Map<string, TFile> | null = null;
	/** Workout IDs already written in this import run (skips duplicate CSV rows). */
	private currentImportWorkoutIds = new Set<string>();

	constructor(
		private vault: Vault,
		private app: import("obsidian").App,
		private settings: PulseSettings,
		private persistSettings: (() => Promise<void>) | undefined,
		private workoutDataManager: WorkoutDataManager
	) {}

	private clearImportCaches(): void {
		this.workoutIdIndex = null;
		this.currentImportWorkoutIds.clear();
	}

	private async ensureWorkoutIdIndex(): Promise<void> {
		if (this.workoutIdIndex) return;
		const map = new Map<string, TFile>();
		for (const f of this.vault.getMarkdownFiles()) {
			try {
				const c = await this.vault.read(f);
				const { frontmatter } = parseFrontmatter(c);
				const wid = frontmatter.workoutId;
				if (wid != null && String(wid).trim() !== "") {
					map.set(String(wid), f);
				}
			} catch {
				/* skip */
			}
		}
		this.workoutIdIndex = map;
	}

	private async saveImportMeta(): Promise<void> {
		try {
			await this.persistSettings?.();
		} catch {
			/* ignore */
		}
	}

	private markLastBodyCompImport(): void {
		this.settings.lastBodyCompImportAt = new Date().toISOString();
		void this.saveImportMeta();
	}

	private markLastWorkoutImport(): void {
		this.settings.lastWorkoutImportAt = new Date().toISOString();
		void this.saveImportMeta();
	}

	async expandZipToVault(zipFile: TFile, baseFolder: string): Promise<void> {
		const zipBasename = zipFile.basename;
		const extractRoot = baseFolder ? `${baseFolder}/${zipBasename}` : zipBasename;
		const url = this.vault.getResourcePath(zipFile);
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to read zip: ${response.status}`);
		const arrayBuffer = await response.arrayBuffer();
		const zip = await JSZip.loadAsync(arrayBuffer);
		const textExtensions = new Set(["csv", "json", "gpx", "xml", "txt", "md"]);
		for (const [entryPath, entry] of Object.entries(zip.files) as [string, { dir: boolean; async(s: string): Promise<string> }][]) {
			if (entry.dir) continue;
			const normalized = entryPath.replace(/\\/g, "/").replace(/\/+/g, "/");
			if (normalized.includes("..")) continue;
			const ext = (normalized.split(".").pop() || "").toLowerCase();
			if (!textExtensions.has(ext)) continue;
			const content = await entry.async("string");
			const vaultPath = baseFolder ? `${extractRoot}/${normalized}` : `${zipBasename}/${normalized}`;
			const parts = vaultPath.split("/");
			for (let i = 1; i < parts.length; i++) {
				const dirPath = parts.slice(0, i).join("/");
				if (!this.vault.getAbstractFileByPath(dirPath)) {
					await this.vault.createFolder(dirPath);
				}
			}
			try {
				await this.vault.create(vaultPath, content);
			} catch (e) {
				if (!String(e).includes("already exists")) throw e;
			}
		}
	}

	async scanAndImport(): Promise<void> {
		const folder = this.settings.scanFolderPath?.trim() || "";
		let allFiles = this.vault.getFiles();
		const inScope = (f: TFile) => !folder || f.path === folder || f.path.startsWith(folder + "/");
		const zips = allFiles.filter((f) => inScope(f) && (f.extension || "").toLowerCase() === "zip");
		for (const zipFile of zips) {
			try {
				await this.expandZipToVault(zipFile, folder);
				allFiles = this.vault.getFiles();
				if (this.settings.deleteSourceAfterImport) {
					await this.vault.trash(zipFile, false);
				}
			} catch (err) {
				new Notice(`Failed to extract ${zipFile.name}: ${err}`);
			}
		}
		this.clearImportCaches();
		const toProcess = allFiles.filter((f) => {
			if (!inScope(f)) return false;
			const ext = (f.extension || "").toLowerCase();
			if (ext === "json") return true;
			if (ext === "csv" && isFITINDEXCsvFileName(f.name)) return true;
			if (ext === "csv" && isRENPHOCsvFileName(f.name)) return true;
			if (ext === "csv" && isHealthAutoExportDailyCsv(f.name)) return true;
			if (ext === "csv" && isHealthAutoExportWorkoutsCsv(f.name)) return true;
			return false;
		});
		console.info("[Pulse] Import scan:", {
			scanFolder: folder || "(whole vault)",
			filesQueued: toProcess.length,
			paths: toProcess.map((f) => f.path),
		});
		if (toProcess.length === 0) {
			try {
				const orphan = await this.processOrphanHeartRateCsvs(folder);
				if (orphan.success > 0) {
					new Notice(
						`Pulse: imported ${orphan.success} workout(s) from Heart Rate CSVs${orphan.errors > 0 ? ` (${orphan.errors} error(s))` : ""}.`
					);
					return;
				}
			} catch (err) {
				new Notice(`Import failed: ${err}`);
				return;
			}
			new Notice(
				folder
					? `Pulse: nothing to import under ${folder}. Looks for JSON, HealthAutoExport-*.csv (daily metrics), Workouts-*.csv, FITINDEX/RENPHO.`
					: "Pulse: nothing to import. Looks for JSON, HealthAutoExport-*.csv, Workouts-*.csv, FITINDEX/RENPHO."
			);
			return;
		}
		new Notice(`Pulse: scanning ${toProcess.length} file(s)...`);
		try {
			const result = await this.processVaultFiles(toProcess);
			const orphan = await this.processOrphanHeartRateCsvs(folder);
			const total = result.success + orphan.success;
			const errTotal = result.errors + orphan.errors;
			new Notice(`Imported ${total} item(s)${errTotal > 0 ? ` (${errTotal} error(s))` : ""}`);
		} catch (err) {
			new Notice(`Import failed: ${err}`);
		}
	}

	/**
	 * When the summary Workouts*.csv omits rows, derive workouts from per-activity
	 * `{Name}-Heart Rate-{YYYYMMDD}_{HHMMSS}*.csv` files in the scan folder.
	 */
	async processOrphanHeartRateCsvs(scanFolder: string): Promise<{ success: number; errors: number }> {
		await this.ensureWorkoutIdIndex();
		const inScope = (f: TFile) => !scanFolder || f.path === scanFolder || f.path.startsWith(scanFolder + "/");
		let success = 0;
		let errors = 0;
		for (const f of this.vault.getFiles()) {
			if ((f.extension || "").toLowerCase() !== "csv") continue;
			if (!inScope(f)) continue;
			const parsed = parseHeartRateExportFilename(f.name);
			if (!parsed) continue;
			const workout: Record<string, unknown> = {
				name: parsed.name,
				start: parsed.start,
				duration: 0,
			};
			const wid = workoutIdFromWorkout(workout as { name: string; start: string });
			if (this.currentImportWorkoutIds.has(wid)) continue;
			if (this.workoutIdIndex?.has(wid)) continue;
			try {
				await this.processWorkout(workout, undefined, f.path);
				success++;
			} catch (e) {
				console.error(`Pulse: Heart Rate CSV workout import ${f.path}:`, e);
				errors++;
			}
		}
		return { success, errors };
	}

	async processVaultFiles(files: TFile[]): Promise<{ success: number; errors: number }> {
		let success = 0;
		let errors = 0;
		for (const file of files) {
			let processed = false;
			try {
				const text = await this.vault.read(file);
				const ext = (file.extension || "").toLowerCase();
				if (ext === "json") {
					let parsed;
					try {
						parsed = parseAutoExportJson(text);
					} catch (parseErr) {
						console.error(`Error parsing ${file.path}:`, parseErr);
						new Notice(`Error parsing ${file.path}: invalid JSON`);
						errors++;
						continue;
					}
					if (!isAutoExportJson(parsed)) continue;
					const result = await this.processJSONText(text);
					success += result.success;
					errors += result.errors;
					processed = true;
				} else if (ext === "csv" && (isFITINDEXCsvFileName(file.name) || isRENPHOCsvFileName(file.name))) {
					const rows = parseFITINDEXCsv(text, { indexFallback: isFITINDEXCsvFileName(file.name) });
					if (rows.length > 0) {
						const n = await this.processFITINDEXToStatsNotes(rows);
						success += n;
						if (n > 0) this.markLastBodyCompImport();
						processed = true;
					}
				} else if (ext === "csv" && isHealthAutoExportDailyCsv(file.name)) {
					const rows = parseHealthAutoExportDailyCsv(text);
					if (rows.length > 0) {
						const n = await this.processHealthAutoExportDailyToStatsNotes(rows);
						success += n;
						processed = true;
					}
				} else if (ext === "csv" && isHealthAutoExportWorkoutsCsv(file.name)) {
					const workouts = parseHealthAutoExportWorkoutsCsv(text);
					for (const workout of workouts) {
						try {
							await this.processWorkout(workout, undefined, file.path);
							success++;
						} catch (error) {
							console.error("Error processing workout from Workouts CSV:", error);
							errors++;
						}
					}
					processed = workouts.length > 0;
				}
				if (processed && this.settings.deleteSourceAfterImport) {
					await this.vault.trash(file, false);
				}
			} catch (error) {
				console.error(`Error processing ${file.path}:`, error);
				new Notice(`Error processing ${file.path}: ${error}`);
				errors++;
			}
		}
		return { success, errors };
	}

	async processJSONText(jsonText: string, imageData?: string): Promise<{ success: number; errors: number }> {
		let success = 0;
		let errors = 0;
		const parsed = parseAutoExportJson(jsonText);
		if (!isAutoExportJson(parsed)) {
			throw new Error("Invalid AutoExport JSON");
		}
		const { workouts, metrics, sleepAnalysis } = parsed;
		for (const workout of workouts) {
			try {
				const isFirst = workouts.indexOf(workout) === 0;
				await this.processWorkout(workout, isFirst ? imageData : undefined, "HealthAutoExport.json");
				success++;
			} catch (error) {
				console.error("Error processing workout:", error);
				errors++;
			}
		}
		if (metrics?.length) {
			try {
				const n = await this.processMetricsToStatsNotes(metrics);
				success += n;
			} catch (err) {
				console.error("Error processing metrics:", err);
				errors++;
			}
		}
		if (sleepAnalysis?.length) {
			try {
				const n = await this.processSleepToStatsNotes(sleepAnalysis);
				success += n;
			} catch (err) {
				console.error("Error processing sleep:", err);
				errors++;
			}
		}
		return { success, errors };
	}

	async getStatsNoteBodyTemplateContent(): Promise<string> {
		const path = (this.settings.statsNoteBodyTemplatePath ?? "").trim();
		if (!path) return "";
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return "";
		try {
			return await this.vault.read(file);
		} catch {
			return "";
		}
	}

	async getOrCreateStatsNote(date: Date): Promise<{ path: string; frontmatter: Record<string, string | number>; body: string }> {
		const path = getStatsNotePath(date, this.settings.statsNotePathTemplate ?? DEFAULT_STATS_PATH_TEMPLATE);
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			const content = await this.vault.read(existing);
			const { frontmatter, body } = parseFrontmatter(content);
			return { path, frontmatter, body };
		}
		const pathParts = path.split("/");
		if (pathParts.length > 1) {
			for (let i = 1; i < pathParts.length; i++) {
				const folderPath = pathParts.slice(0, i).join("/");
				if (!this.vault.getAbstractFileByPath(folderPath)) {
					await this.vault.createFolder(folderPath);
				}
			}
		}
		const dateStr = date.getFullYear() + "-" + (date.getMonth() + 1).toString().padStart(2, "0") + "-" + date.getDate().toString().padStart(2, "0");
		const bodyTemplate = await this.getStatsNoteBodyTemplateContent();
		const initialFrontmatter: Record<string, string | number> = { date: dateStr };
		const initialContent = "---\n" + stringifyFrontmatter(initialFrontmatter) + "---\n\n" + (bodyTemplate || "");
		try {
			await this.vault.create(path, initialContent);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const isAlreadyExists = /already exists/i.test(errMsg);
			for (let attempt = 0; attempt < 5; attempt++) {
				const file = this.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const content = await this.vault.read(file);
					const parsed = parseFrontmatter(content);
					return { path, frontmatter: parsed.frontmatter, body: parsed.body };
				}
				if (!isAlreadyExists) break;
				await new Promise((r) => setTimeout(r, 30 + attempt * 20));
			}
			const parentPath = pathParts.slice(0, -1).join("/");
			const fileName = pathParts[pathParts.length - 1];
			const folder = this.vault.getAbstractFileByPath(parentPath);
			if (folder && "children" in folder) {
				const found = (folder as TFolder).children.find((f: { name: string }) => f.name === fileName);
				if (found instanceof TFile) {
					const content = await this.vault.read(found);
					const parsed = parseFrontmatter(content);
					return { path: found.path, frontmatter: parsed.frontmatter, body: parsed.body };
				}
			}
			const byPath = this.vault.getFiles().find((f) => f.path === path || f.path.endsWith("/" + fileName));
			if (byPath) {
				const content = await this.vault.read(byPath);
				const parsed = parseFrontmatter(content);
				return { path: byPath.path, frontmatter: parsed.frontmatter, body: parsed.body };
			}
			throw err instanceof Error ? err : new Error(`Could not create stats note at ${path}: ${err}`);
		}
		return { path, frontmatter: initialFrontmatter, body: bodyTemplate || "" };
	}

	async mergeAndWriteStatsNote(path: string, updates: Record<string, string | number>, body: string): Promise<void> {
		let existing = this.vault.getAbstractFileByPath(path) as TFile | null;
		let frontmatter: Record<string, string | number>;
		let bodyOut = body;
		if (existing) {
			const content = await this.vault.read(existing);
			const parsed = parseFrontmatter(content);
			frontmatter = { ...parsed.frontmatter };
			for (const [k, v] of Object.entries(updates)) {
				if (v !== undefined && v !== null) frontmatter[k] = v;
			}
			bodyOut = parsed.body;
		} else {
			frontmatter = { ...updates };
		}
		const filtered = frontmatterWithoutBlanks(frontmatter);
		const out = "---\n" + stringifyFrontmatter(filtered) + "---\n\n" + (bodyOut || "");
		if (existing) {
			await this.vault.modify(existing, out);
		} else {
			try {
				await this.vault.create(path, out);
			} catch (createErr) {
				for (let attempt = 0; attempt < 5; attempt++) {
					existing = this.vault.getAbstractFileByPath(path) as TFile | null;
					if (existing) {
						const content = await this.vault.read(existing);
						const parsed = parseFrontmatter(content);
						frontmatter = { ...parsed.frontmatter };
						for (const [k, v] of Object.entries(updates)) {
							if (v !== undefined && v !== null) frontmatter[k] = v;
						}
						bodyOut = parsed.body;
						const filteredRetry = frontmatterWithoutBlanks(frontmatter);
						const mergedOut = "---\n" + stringifyFrontmatter(filteredRetry) + "---\n\n" + (bodyOut || "");
						await this.vault.modify(existing, mergedOut);
						return;
					}
					const errMsg = createErr instanceof Error ? createErr.message : String(createErr);
					if (!/already exists/i.test(errMsg)) break;
					await new Promise((r) => setTimeout(r, 30 + attempt * 20));
				}
				throw createErr instanceof Error ? createErr : new Error(`Could not create stats note at ${path}`);
			}
		}
	}

	async processMetricsToStatsNotes(metrics: Record<string, unknown>[]): Promise<number> {
		const byDate = new Map<string, Record<string, string | number>>();
		const collect = (dateStr: string, key: string, value: string | number) => {
			if (!byDate.has(dateStr)) byDate.set(dateStr, {});
			byDate.get(dateStr)![key] = value;
		};
		for (const m of metrics) {
			const name = m.name;
			if (!name) continue;
			const key = AUTOEXPORT_METRIC_TO_FRONTMATTER[String(name)] ?? toCamelCase(String(name));
			const points = Array.isArray(m.data) ? m.data : (m.date != null ? [m] : []);
			for (const p of points as Record<string, unknown>[]) {
				const dateStr = p.date ? String(p.date).trim().slice(0, 10) : "";
				if (!dateStr || dateStr.length < 10) continue;
				const qty = p.qty;
				if (qty === undefined || qty === null) continue;
				const num = typeof qty === "number" ? qty : parseFloat(String(qty));
				if (isNaN(num)) continue;
				const value = Math.round(num * 100) / 100;
				collect(dateStr, key, value);
			}
		}
		let count = 0;
		for (const [dateStr, updates] of byDate) {
			try {
				if (Object.keys(updates).length === 0) continue;
				const [y, m, d] = dateStr.split("-").map(Number);
				const date = new Date(y, m - 1, d);
				const { path } = await this.getOrCreateStatsNote(date);
				await this.mergeAndWriteStatsNote(path, updates, "");
				count++;
			} catch (err) {
				console.error(`Error writing stats note for ${dateStr}:`, err);
			}
		}
		return count;
	}

	/** Wide `HealthAutoExport-*.csv` daily rows → stats notes (same keys as JSON metrics). */
	async processHealthAutoExportDailyToStatsNotes(rows: HealthAutoExportDailyRow[]): Promise<number> {
		let count = 0;
		for (const row of rows) {
			try {
				if (!row.date) continue;
				const [y, m, d] = row.date.split("-").map(Number);
				const date = new Date(y, m - 1, d);
				const updates: Record<string, string | number> = {};
				for (const [k, v] of Object.entries(row.metrics)) {
					updates[k] = Math.round(v * 100) / 100;
				}
				if (Object.keys(updates).length === 0) continue;
				const { path } = await this.getOrCreateStatsNote(date);
				await this.mergeAndWriteStatsNote(path, updates, "");
				count++;
			} catch (err) {
				console.error(`Error writing HealthAutoExport daily stats for ${row.date}:`, err);
			}
		}
		return count;
	}

	async processSleepToStatsNotes(sleepAnalysis: Record<string, unknown>[]): Promise<number> {
		let count = 0;
		for (const s of sleepAnalysis) {
			try {
				const endStr = (s.sleepEnd ?? s.inBedEnd) as string | undefined;
				if (!endStr) continue;
				const dateStr = String(endStr).trim().slice(0, 10);
				if (dateStr.length < 10) continue;
				const [y, m, d] = dateStr.split("-").map(Number);
				const date = new Date(y, m - 1, d);
				const updates: Record<string, string | number> = {};
				if (s.sleepStart != null) updates["sleepStartTime"] = String(s.sleepStart);
				if (s.sleepEnd != null) updates["sleepEndTime"] = String(s.sleepEnd);
				if (s.inBedStart != null) updates["inBedStart"] = String(s.inBedStart);
				if (s.inBedEnd != null) updates["inBedEnd"] = String(s.inBedEnd);
				if (typeof s.totalSleep === "number") updates["timeAsleep"] = s.totalSleep;
				if (typeof s.deep === "number") updates["deepSleep"] = s.deep;
				if (typeof s.core === "number") updates["sleepCore"] = s.core;
				if (typeof s.rem === "number") updates["remSleep"] = s.rem;
				if (typeof s.awake === "number") updates["sleepAwake"] = s.awake;
				if (s.source != null) updates["source"] = String(s.source);
				const { path } = await this.getOrCreateStatsNote(date);
				await this.mergeAndWriteStatsNote(path, updates, "");
				count++;
			} catch (err) {
				console.error("Error writing sleep stats note:", err);
			}
		}
		return count;
	}

	async processFITINDEXToStatsNotes(rows: import("./types").FITINDEXRow[]): Promise<number> {
		let count = 0;
		for (const row of rows) {
			try {
				if (!row.date) continue;
				const [y, m, d] = row.date.split("-").map(Number);
				const date = new Date(y, m - 1, d);
				const updates: Record<string, string | number> = {};
				if (row.weightLb != null) updates["weight"] = Math.round(row.weightLb * 100) / 100;
				else if (row.weightKg != null) updates["weight"] = Math.round(row.weightKg * KG_TO_LB * 100) / 100;
				if (row.bmi != null) updates["bmi"] = row.bmi;
				if (row.bodyFatPct != null) updates["bfp"] = row.bodyFatPct;
				if (row.fatFreeWeightLb != null) updates["lbm"] = Math.round(row.fatFreeWeightLb * 100) / 100;
				else if (row.fatFreeWeightKg != null) updates["lbm"] = Math.round(row.fatFreeWeightKg * KG_TO_LB * 100) / 100;
				if (row.subcutaneousFatPct != null) updates["subcutaneousFat"] = row.subcutaneousFatPct;
				if (row.visceralFat != null) updates["visceralFat"] = row.visceralFat;
				if (row.bodyWaterPct != null) updates["bodyWater"] = row.bodyWaterPct;
				if (row.skeletalMusclePct != null) updates["skeletalMuscle"] = row.skeletalMusclePct;
				if (row.muscleMassLb != null) updates["muscleMass"] = Math.round(row.muscleMassLb * 100) / 100;
				else if (row.muscleMassKg != null) updates["muscleMass"] = Math.round(row.muscleMassKg * KG_TO_LB * 100) / 100;
				if (row.boneMassLb != null) updates["boneMass"] = Math.round(row.boneMassLb * 100) / 100;
				else if (row.boneMassKg != null) updates["boneMass"] = Math.round(row.boneMassKg * KG_TO_LB * 100) / 100;
				if (row.proteinPct != null) updates["protein"] = row.proteinPct;
				if (row.bmrKcal != null) updates["bmr"] = row.bmrKcal;
				if (row.metabolicAge != null) updates["metabolicAge"] = row.metabolicAge;
				if (row.bodyFatMassLb != null) updates["bodyFatMass"] = Math.round(row.bodyFatMassLb * 100) / 100;
				if (row.musclePct != null) updates["musclePct"] = row.musclePct;
				if (row.proteinMassLb != null) updates["proteinMass"] = Math.round(row.proteinMassLb * 100) / 100;
				if (row.bodyWaterMassLb != null) updates["bodyWaterMass"] = Math.round(row.bodyWaterMassLb * 100) / 100;
				if (row.whr != null) updates["whr"] = row.whr;
				if (row.optimalWeightLb != null) updates["optimalWeight"] = Math.round(row.optimalWeightLb * 100) / 100;
				if (row.weightLevel != null && row.weightLevel !== "") updates["weightLevel"] = row.weightLevel;
				if (row.bodyType != null && row.bodyType !== "") updates["bodyType"] = row.bodyType;
				const { path } = await this.getOrCreateStatsNote(date);
				await this.mergeAndWriteStatsNote(path, updates, "");
				count++;
			} catch (err) {
				console.error(`Error writing FITINDEX stats for ${row.date}:`, err);
			}
		}
		return count;
	}

	private buildImportedWorkoutData(workout: Record<string, unknown>, sourcePath?: string): ImportedWorkoutData {
		const startRaw = workout.start != null ? String(workout.start) : "";
		const endRaw = workout.end != null ? String(workout.end) : "";
		let durationSec =
			typeof workout.duration === "number"
				? workout.duration
				: parseFloat(String(workout.duration ?? ""));
		if (Number.isNaN(durationSec)) durationSec = 0;

		const startDate = startRaw ? new Date(startRaw) : new Date();
		let endDate = endRaw ? new Date(endRaw) : new Date(startDate.getTime() + Math.max(1, durationSec) * 1000);
		if (isNaN(endDate.getTime())) {
			endDate = new Date(startDate.getTime() + Math.max(1, durationSec) * 1000);
		}

		const hrAvg =
			this.importNum(this.getNestedValue(workout, "heartRateAvg")) ??
			this.importNum(workout.heartRateAvg as unknown);
		const hrMax =
			this.importNum(this.getNestedValue(workout, "heartRateMax")) ??
			this.importNum(workout.heartRateMax as unknown);

		return {
			activityType: String(workout.name ?? "Unknown"),
			startDate: startRaw || startDate.toISOString(),
			endDate: endRaw || endDate.toISOString(),
			duration: Math.round(durationSec),
			hrAvg,
			hrMax,
			importedAt: new Date().toISOString(),
			sourceFile: sourcePath ?? "",
		};
	}

	private importNum(v: unknown): number | undefined {
		if (typeof v === "number" && !Number.isNaN(v)) return v;
		if (typeof v === "string" && v.trim() !== "") {
			const n = parseFloat(v);
			return Number.isNaN(n) ? undefined : n;
		}
		return undefined;
	}

	async processWorkout(workout: Record<string, unknown>, imageData?: string, sourcePath?: string): Promise<string> {
		await this.ensureWorkoutIdIndex();
		const workoutName = (workout.name as string) || "Unknown";
		const template = this.settings.templates.find(
			(t) => t.workoutType.toLowerCase() === workoutName.toLowerCase()
		);
		let templatePath = (template?.templatePath || this.settings.defaultTemplatePath || "").trim();
		let templateContent = "";
		if (templatePath) {
			const templateFile = this.vault.getAbstractFileByPath(templatePath) as TFile;
			if (templateFile) {
				templateContent = await this.vault.read(templateFile);
			} else {
				console.warn(`Pulse: workout template missing at "${templatePath}", using empty body`);
				templatePath = "";
			}
		}
		const templatePathForYaml = templatePath || "pulse:import-without-template";
		let workoutDate = workout.start ? new Date(workout.start as string) : new Date();
		if (isNaN(workoutDate.getTime())) workoutDate = new Date();
		const workoutId = workoutIdFromWorkout(workout as { name?: string; start?: string });

		if (this.currentImportWorkoutIds.has(workoutId)) {
			const existing = this.workoutIdIndex?.get(workoutId);
			return existing?.path ?? "";
		}

		const filePath = this.generateFilePath(workoutName, workoutDate);
		let finalFilePath = filePath;
		let targetFile: TFile | null = this.workoutIdIndex?.get(workoutId) ?? null;

		if (targetFile) {
			finalFilePath = targetFile.path;
		} else {
			const existingAtPath = this.vault.getAbstractFileByPath(filePath);
			if (existingAtPath instanceof TFile) {
				const content = await this.vault.read(existingAtPath);
				const { frontmatter } = parseFrontmatter(content);
				const exId = frontmatter.workoutId != null ? String(frontmatter.workoutId) : "";
				if (!exId || exId === workoutId) {
					targetFile = existingAtPath;
					finalFilePath = filePath;
				}
			}
			if (!targetFile) {
				let counter = 1;
				finalFilePath = filePath;
				while (this.vault.getAbstractFileByPath(finalFilePath)) {
					const parts2 = filePath.split("/");
					const fileName = parts2[parts2.length - 1];
					const folder = parts2.slice(0, -1).join("/");
					const baseName = fileName.replace(".md", "");
					const newFileName = `${baseName} (${counter}).md`;
					finalFilePath = folder ? `${folder}/${newFileName}` : newFileName;
					counter++;
				}
			}
		}

		if (!targetFile) {
			const pathParts = finalFilePath.split("/");
			if (pathParts.length > 1) {
				const folderPath = pathParts.slice(0, -1).join("/");
				if (!this.vault.getAbstractFileByPath(folderPath)) {
					await this.vault.createFolder(folderPath);
				}
			}
		}
		const imageToSave = imageData ?? (await this.generateWorkoutBannerImage(workout));
		let relativeImagePath: string | undefined;
		let savedImageExtension: string | undefined;
		if (imageToSave) {
			savedImageExtension = await this.saveImage(imageToSave, finalFilePath);
			const pathPartsImg = finalFilePath.split("/");
			const noteFileName = pathPartsImg[pathPartsImg.length - 1].replace(".md", "");
			relativeImagePath = `assets/${noteFileName}.${savedImageExtension}`;
		}
		const mappedData: Record<string, unknown> = {};
		for (const mapping of this.settings.keyMappings) {
			if (!mapping.jsonKey || !mapping.yamlKey) continue;
			let value = this.getNestedValue(workout, mapping.jsonKey);
			if (value !== undefined && value !== null) {
				if (mapping.rounding !== undefined && typeof value === "number") {
					value = this.applyRounding(value, mapping.rounding);
				}
				mappedData[mapping.yamlKey] = value;
			}
		}
		if (this.settings.keyMappings.length === 0) {
			Object.assign(mappedData, workout);
		}
		const year = workoutDate.getFullYear();
		const month = (workoutDate.getMonth() + 1).toString().padStart(2, "0");
		const day = workoutDate.getDate().toString().padStart(2, "0");
		mappedData["date"] = `${year}-${month}-${day}`;
		mappedData["workoutId"] = workoutId;
		const yamlFrontmatter = this.generateYAMLFrontmatter(mappedData, templatePathForYaml, relativeImagePath, workoutName);
		let bodyContent = templateContent;
		let heartRateChartBlock = "";
		const workoutStartKey = this.getWorkoutStartKey(workout as { start?: string });
		if (workoutStartKey) {
			const hrFile = this.getHeartRateCsvFile(workoutName, workoutStartKey);
			if (hrFile) {
				try {
					const hrCsv = await this.vault.read(hrFile);
					const { labels, data } = this.parseHeartRateCsv(hrCsv);
					const chartBlock = this.buildChartsHeartRateBlock(labels, data);
					if (chartBlock) {
						heartRateChartBlock = chartBlock;
						bodyContent = (templateContent.trim() ? templateContent + "\n\n" : "") + chartBlock;
					}
				} catch (e) {
					console.warn("Failed to read/parse Heart Rate CSV:", e);
				}
			}
			const workoutDir = finalFilePath.includes("/") ? finalFilePath.split("/").slice(0, -1).join("/") : "";
			const routesFolder = workoutDir ? `${workoutDir}/routes` : "routes";
			const routeFile = this.getRouteFile(workoutName, workoutStartKey);
			if (routeFile && workoutId) {
				try {
					const routeText = await this.vault.read(routeFile);
					const points = routeFile.extension.toLowerCase() === "gpx"
						? this.parseRouteGpx(routeText)
						: this.parseRouteCsv(routeText);
					if (points.length >= 2) {
						await this.saveRouteData(workoutId, points, routesFolder);
						const mapDataUrl = await this.generateRouteMapImage(points);
						if (mapDataUrl) {
							const routeImagePath = `${routesFolder}/${workoutId}.png`;
							await this.saveImageToPath(mapDataUrl, routeImagePath);
							const routeSection = `\n\n## Route\n\n![[${routeImagePath}]]\n`;
							bodyContent = bodyContent.trimEnd() + routeSection;
						}
					}
				} catch (e) {
					console.warn("Failed to process route for map:", e);
				}
			}
		}
		const noteContent = `---\n${yamlFrontmatter}---\n\n${bodyContent}`;
		if (targetFile) {
			await this.vault.modify(targetFile, noteContent);
		} else {
			await this.vault.create(finalFilePath, noteContent);
			const created = this.vault.getAbstractFileByPath(finalFilePath);
			if (created instanceof TFile) targetFile = created;
		}
		if (targetFile) {
			this.workoutIdIndex?.set(workoutId, targetFile);
		}
		this.currentImportWorkoutIds.add(workoutId);

		try {
			const importData = this.buildImportedWorkoutData(workout, sourcePath);
			const importStart = new Date(importData.startDate);
			const importEnd = new Date(importData.endDate);
			const match = await this.workoutDataManager.findBestMatchingSessionForImport(
				importStart,
				importEnd,
				importData.activityType
			);
			if (match) {
				await this.workoutDataManager.mergeImportData(
					match.file.path,
					importData,
					heartRateChartBlock || undefined
				);
			}
		} catch (e) {
			console.warn("Pulse: could not merge Health import into session:", e);
		}

		this.markLastWorkoutImport();
		return finalFilePath;
	}

	generateFilePath(workoutName: string, workoutDate: Date): string {
		const template = this.settings.saveDestination || "{YYYY}/{MM}/{YYYYMMDD-HHMM}-{name}.md";
		const year = workoutDate.getFullYear().toString();
		const month = (workoutDate.getMonth() + 1).toString().padStart(2, "0");
		const day = workoutDate.getDate().toString().padStart(2, "0");
		const hours = workoutDate.getHours().toString().padStart(2, "0");
		const minutes = workoutDate.getMinutes().toString().padStart(2, "0");
		const dateTimeStr = `${year}${month}${day}-${hours}${minutes}`;
		const dateTimeStrHyphenated = `${year}-${month}-${day}-${hours}${minutes}`;
		const sanitizedName = workoutName.replace(/[<>:"/\\|?*]/g, "-");
		let filePath = template
			.replace(/{YYYY}/g, year)
			.replace(/{MM}/g, month)
			.replace(/{YYYYMMDD-HHMM}/g, dateTimeStr)
			.replace(/{YYYY-MM-DD-HHMM}/g, dateTimeStrHyphenated)
			.replace(/{name}/g, sanitizedName);
		if (!filePath.endsWith(".md")) filePath += ".md";
		return filePath;
	}

	getWorkoutStartKey(workout: { start?: string }): string {
		const start = workout?.start;
		if (!start) return "";
		const d = new Date(start);
		if (isNaN(d.getTime())) return "";
		const y = d.getFullYear();
		const m = (d.getMonth() + 1).toString().padStart(2, "0");
		const day = d.getDate().toString().padStart(2, "0");
		const h = d.getHours().toString().padStart(2, "0");
		const min = d.getMinutes().toString().padStart(2, "0");
		const s = d.getSeconds().toString().padStart(2, "0");
		return `${y}${m}${day}_${h}${min}${s}`;
	}

	getHeartRateCsvFile(workoutName: string, workoutStartKey: string): TFile | null {
		const scanFolder = (this.settings.scanFolderPath ?? "").trim();
		const prefix = `${workoutName}-Heart Rate-`;
		const allFiles = this.vault.getFiles();
		for (const f of allFiles) {
			if (f.extension !== "csv" || !f.name.startsWith(prefix)) continue;
			const inScope = !scanFolder || f.path === scanFolder || f.path.startsWith(scanFolder + "/");
			if (!inScope) continue;
			const stem = f.basename.slice(prefix.length);
			if (stem === workoutStartKey || stem.startsWith(workoutStartKey.slice(0, 12))) return f;
		}
		return null;
	}

	getRouteFile(workoutName: string, workoutStartKey: string): TFile | null {
		const scanFolder = (this.settings.scanFolderPath ?? "").trim();
		const prefix = `${workoutName}-Route-`;
		const allFiles = this.vault.getFiles();
		for (const f of allFiles) {
			const ext = (f.extension || "").toLowerCase();
			if ((ext !== "csv" && ext !== "gpx") || !f.name.startsWith(prefix)) continue;
			const inScope = !scanFolder || f.path === scanFolder || f.path.startsWith(scanFolder + "/");
			if (!inScope) continue;
			const stem = f.basename.slice(prefix.length);
			if (stem === workoutStartKey || stem.startsWith(workoutStartKey.slice(0, 12))) return f;
		}
		return null;
	}

	parseRouteCsv(csvText: string): RoutePoint[] {
		const points: RoutePoint[] = [];
		const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
		if (lines.length < 2) return points;
		const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
		const idxLat = headers.findIndex((h) => h.includes("latitude") || h === "lat");
		const idxLon = headers.findIndex((h) => h.includes("longitude") || h === "lon" || h === "lng");
		const idxSpeed = headers.findIndex((h) => h.includes("speed"));
		if (idxLat < 0 || idxLon < 0) return points;
		for (let i = 1; i < lines.length; i++) {
			const values = parseCsvLine(lines[i]);
			const lat = parseFloat(values[idxLat]);
			const lon = parseFloat(values[idxLon]);
			if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
			const speed = idxSpeed >= 0 && values[idxSpeed] !== undefined ? parseFloat(values[idxSpeed]) : 0;
			points.push({ lat, lon, speed: Number.isNaN(speed) ? 0 : speed });
		}
		return points;
	}

	parseRouteGpx(gpxText: string): RoutePoint[] {
		const points: RoutePoint[] = [];
		const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
		const speedRegex = /<speed>([^<]+)<\/speed>/i;
		let m: RegExpExecArray | null;
		while ((m = trkptRegex.exec(gpxText)) !== null) {
			const lat = parseFloat(m[1]);
			const lon = parseFloat(m[2]);
			if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
			const inner = m[3] || "";
			const speedMatch = inner.match(speedRegex);
			const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
			points.push({ lat, lon, speed: Number.isNaN(speed) ? 0 : speed });
		}
		return points;
	}

	parseHeartRateCsv(csvText: string): { labels: string[]; data: number[] } {
		const labels: string[] = [];
		const data: number[] = [];
		const lines = csvText.trim().split(/\r?\n/);
		if (lines.length < 2) return { labels, data };
		const header = lines[0].toLowerCase();
		const avgIdx = header.includes("avg") ? header.split(",").findIndex((c) => c.includes("avg")) : -1;
		const timeIdx = header.includes("date/time") ? 0 : header.split(",").findIndex((c) => c.includes("time"));
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split(",").map((p) => p.trim());
			const timeStr = timeIdx >= 0 && parts[timeIdx] ? parts[timeIdx].trim().slice(11, 19) : "";
			const label = timeStr ? timeStr.slice(0, 5) : `${i}`;
			let bpm = NaN;
			if (avgIdx >= 0 && parts[avgIdx] !== undefined) bpm = parseFloat(parts[avgIdx]);
			else if (parts[1] !== undefined) bpm = parseFloat(parts[1]);
			if (!Number.isNaN(bpm)) {
				labels.push(label);
				data.push(Math.round(bpm));
			}
		}
		return { labels, data };
	}

	buildChartsHeartRateBlock(labels: string[], data: number[]): string {
		if (labels.length === 0 || data.length === 0) return "";
		const labelsYaml = labels.map((l) => `  - "${l}"`).join("\n");
		const dataArray = "[" + data.join(", ") + "]";
		return `## Heart Rate\n\n\`\`\`chart\ntype: line\nlabels:\n${labelsYaml}\nseries:\n  - title: Heart Rate (BPM)\n    fill: true\n    tension: 0.3\n    data: ${dataArray}\n\`\`\`\n`;
	}

	async ensureRoutesFolder(folder: string): Promise<void> {
		if (folder && !this.vault.getAbstractFileByPath(folder)) {
			await this.vault.createFolder(folder);
		}
	}

	async saveRouteData(workoutId: string, points: RoutePoint[], routesFolder: string): Promise<void> {
		await this.ensureRoutesFolder(routesFolder);
		const path = `${routesFolder}/${workoutId}.json`;
		const content = JSON.stringify({ workoutId, points }, null, 0);
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.vault.modify(existing, content);
		} else {
			await this.vault.create(path, content);
		}
	}

	async saveImageToPath(imageDataUrl: string, vaultPath: string): Promise<void> {
		let base64Data = imageDataUrl;
		if (imageDataUrl.startsWith("data:image/")) {
			const match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
			if (match) base64Data = match[1];
		}
		const binaryString = atob(base64Data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
		const existing = this.vault.getAbstractFileByPath(vaultPath);
		if (existing && "path" in existing) {
			await this.vault.modifyBinary(existing as TFile, bytes.buffer);
		} else {
			const pathParts = vaultPath.split("/");
			for (let i = 1; i < pathParts.length; i++) {
				const dirPath = pathParts.slice(0, i).join("/");
				if (!this.vault.getAbstractFileByPath(dirPath)) await this.vault.createFolder(dirPath);
			}
			await this.vault.createBinary(vaultPath, bytes.buffer);
		}
	}

	private getMapTileUrl(z: number, x: number, y: number): string {
		const style = this.settings.mapTileStyle ?? "maptiler-fiord";
		const key = (this.settings.maptilerApiKey ?? "").trim();
		if (style === "maptiler-fiord" && key) {
			return `https://api.maptiler.com/tiles/fiord/${z}/${x}/${y}?key=${encodeURIComponent(key)}`;
		}
		if (style === "carto-dark" || (style === "maptiler-fiord" && !key)) {
			return `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
		}
		return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
	}

	async generateRouteMapImage(points: RoutePoint[]): Promise<string> {
		if (typeof document === "undefined" || points.length < 2) return "";
		const width = 960;
		const height = 540;
		const padding = 0;
		const TILE_SIZE = 256;
		const minLat = Math.min(...points.map((p) => p.lat));
		const maxLat = Math.max(...points.map((p) => p.lat));
		const minLon = Math.min(...points.map((p) => p.lon));
		const maxLon = Math.max(...points.map((p) => p.lon));
		const latSpan = maxLat - minLat || 0.0001;
		const lonSpan = maxLon - minLon || 0.0001;
		const drawWidth = width - padding * 2;
		const drawHeight = height - padding * 2;

		const latToY = (lat: number, z: number): number => {
			const latRad = (lat * Math.PI) / 180;
			const n = Math.pow(2, z);
			return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * TILE_SIZE;
		};
		const lonToX = (lon: number, z: number): number => {
			const n = Math.pow(2, z);
			return ((lon + 180) / 360) * n * TILE_SIZE;
		};
		const midLat = (minLat + maxLat) / 2;
		const zoomForLon = Math.log2((drawWidth / TILE_SIZE) * (360 / lonSpan));
		const zoomForLat = Math.log2((drawHeight / TILE_SIZE) * (180 / (latSpan || 0.0001)) * Math.cos((midLat * Math.PI) / 180));
		const z = Math.max(1, Math.min(19, Math.floor(Math.min(zoomForLon, zoomForLat))));
		const minTileX = Math.floor(lonToX(minLon, z) / TILE_SIZE);
		const maxTileX = Math.floor(lonToX(maxLon, z) / TILE_SIZE);
		const minTileY = Math.floor(latToY(maxLat, z) / TILE_SIZE);
		const maxTileY = Math.floor(latToY(minLat, z) / TILE_SIZE);
		const offsetX = padding - minTileX * TILE_SIZE;
		const offsetY = padding - minTileY * TILE_SIZE;
		const mapWidth = (maxTileX - minTileX + 1) * TILE_SIZE;
		const mapHeight = (maxTileY - minTileY + 1) * TILE_SIZE;
		const scale = Math.max(width / mapWidth, height / mapHeight);
		const translateX = (width - mapWidth * scale) / 2;
		const translateY = (height - mapHeight * scale) / 2;

		const speeds = points.map((p) => p.speed).filter((s) => s > 0);
		const minSpeed = speeds.length ? Math.min(...speeds) : 0;
		const maxSpeed = speeds.length ? Math.max(...speeds) : 1;
		const speedRange = maxSpeed - minSpeed || 1;
		const speedToColor = (s: number): string => {
			const t = (s - minSpeed) / speedRange;
			if (t <= 0.33) {
				const u = t / 0.33;
				return `rgb(${Math.round(u * 0)}, ${Math.round(u * 128)}, ${Math.round(255 - u * 128)})`;
			}
			if (t <= 0.66) {
				const u = (t - 0.33) / 0.33;
				return `rgb(${Math.round(u * 255)}, 255, ${Math.round(128 - u * 128)})`;
			}
			const u = (t - 0.66) / 0.34;
			return `rgb(255, ${Math.round(255 - u * 255)}, 0)`;
		};

		const toX = (lon: number) => offsetX + lonToX(lon, z);
		const toY = (lat: number) => offsetY + latToY(lat, z);

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return "";
		ctx.fillStyle = "#1a1a2e";
		ctx.fillRect(0, 0, width, height);

		const offscreen = document.createElement("canvas");
		offscreen.width = mapWidth;
		offscreen.height = mapHeight;
		const offCtx = offscreen.getContext("2d");
		if (!offCtx) return canvas.toDataURL("image/png");
		offCtx.fillStyle = "#1a1a2e";
		offCtx.fillRect(0, 0, mapWidth, mapHeight);

		const tilesToFetch: { x: number; y: number }[] = [];
		for (let tx = minTileX; tx <= maxTileX; tx++) {
			for (let ty = minTileY; ty <= maxTileY; ty++) {
				tilesToFetch.push({ x: tx, y: ty });
			}
		}
		let tilesOk = true;
		await Promise.all(
			tilesToFetch.map(async (t) => {
				const url = this.getMapTileUrl(z, t.x, t.y);
				try {
					const res = await fetch(url);
					if (!res.ok) { tilesOk = false; return; }
					const blob = await res.blob();
					const img = await createImageBitmap(blob);
					const dx = offsetX + t.x * TILE_SIZE;
					const dy = offsetY + t.y * TILE_SIZE;
					offCtx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
					img.close();
				} catch {
					tilesOk = false;
				}
			})
		);
		if (!tilesOk) {
			offCtx.fillStyle = "#1a1a2e";
			offCtx.fillRect(0, 0, mapWidth, mapHeight);
		}
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			const avgSpeed = (a.speed + b.speed) / 2;
			offCtx.strokeStyle = speedToColor(avgSpeed);
			offCtx.lineWidth = 4;
			offCtx.lineCap = "round";
			offCtx.lineJoin = "round";
			offCtx.beginPath();
			offCtx.moveTo(toX(a.lon), toY(a.lat));
			offCtx.lineTo(toX(b.lon), toY(b.lat));
			offCtx.stroke();
		}
		ctx.drawImage(offscreen, 0, 0, mapWidth, mapHeight, translateX, translateY, mapWidth * scale, mapHeight * scale);
		return canvas.toDataURL("image/png");
	}

	async getIconNameForWorkout(workoutName: string): Promise<string> {
		const key = (workoutName || "").toLowerCase().trim();
		if (WORKOUT_TYPE_TO_ICON[key]) return WORKOUT_TYPE_TO_ICON[key];
		for (const [pattern, icon] of Object.entries(WORKOUT_TYPE_TO_ICON)) {
			if (key.includes(pattern) || pattern.includes(key)) return icon;
		}
		const folder = this.vault.getAbstractFileByPath(ACTIVITY_ICONS_FOLDER);
		if (folder && "children" in folder) {
			const candidates: { base: string; len: number }[] = [];
			for (const child of (folder as TFolder).children) {
				if (child instanceof TFile && child.extension === "png") {
					const base = child.basename.toLowerCase();
					if (!base) continue;
					if (key.includes(base) || base.includes(key)) candidates.push({ base: child.basename, len: base.length });
				}
			}
			if (candidates.length) {
				candidates.sort((a, b) => b.len - a.len);
				return candidates[0].base;
			}
		}
		return "other";
	}

	getActivityIconUrl(iconName: string): string | null {
		const path = `${ACTIVITY_ICONS_FOLDER}/${iconName}.png`;
		const file = this.vault.getAbstractFileByPath(path);
		if (file && "path" in file) return this.vault.getResourcePath(file as TFile);
		return null;
	}

	async generateWorkoutBannerImage(workout: Record<string, unknown>): Promise<string> {
		if (typeof document === "undefined") return "";
		const name = (workout?.name as string) || "Workout";
		const durationSec = (workout?.duration ?? workout?.duration_qty) as number | undefined;
		const durationSecNum = typeof durationSec === "number" ? durationSec : 0;
		const minutes = Math.floor(durationSecNum / 60);
		const seconds = Math.floor(durationSecNum % 60);
		const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
		const energyBurned = workout?.activeEnergyBurned as { qty?: number } | undefined;
		const calories = energyBurned?.qty ?? (workout?.calories as number | undefined);
		const calNum = typeof calories === "number" ? Math.round(calories) : 0;

		const width = 640;
		const height = 200;
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return "";

		const iconName = await this.getIconNameForWorkout(name);
		const iconUrl = this.getActivityIconUrl(iconName);

		const drawCard = (img: HTMLImageElement | null) => {
			ctx.fillStyle = "#0d0d0d";
			ctx.fillRect(0, 0, width, height);
			const circleR = 32;
			const circleY = 52;
			const gap = 16;
			ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
			const nameWidth = ctx.measureText(name).width;
			const titleGroupWidth = circleR * 2 + gap + nameWidth;
			const startX = (width - titleGroupWidth) / 2;
			const circleX = startX + circleR;
			const nameX = startX + circleR * 2 + gap;
			ctx.beginPath();
			ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
			ctx.fillStyle = "#1a3d1a";
			ctx.fill();
			if (img && img.width > 0) {
				ctx.save();
				ctx.beginPath();
				ctx.arc(circleX, circleY, circleR - 3, 0, Math.PI * 2);
				ctx.closePath();
				ctx.clip();
				const iconSize = (circleR - 3) * 2;
				ctx.drawImage(img, circleX - iconSize / 2, circleY - iconSize / 2, iconSize, iconSize);
				ctx.restore();
			}
			ctx.fillStyle = "#ffffff";
			ctx.textBaseline = "middle";
			ctx.fillText(name, nameX, circleY);
			const dividerY = height - 68;
			const cardPadding = 24;
			ctx.strokeStyle = "rgba(255,255,255,0.12)";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(cardPadding, dividerY);
			ctx.lineTo(width - cardPadding, dividerY);
			ctx.stroke();
			const metricY = dividerY + 36;
			const centerX = width / 2;
			const metricGap = 20;
			ctx.textAlign = "right";
			ctx.fillStyle = "rgba(255,255,255,0.6)";
			ctx.font = "11px system-ui, sans-serif";
			ctx.fillText("Active Calories", centerX - metricGap, metricY - 20);
			ctx.fillStyle = "#ff375f";
			ctx.font = "bold 24px system-ui, sans-serif";
			const calText = calNum.toString();
			const calWidth = ctx.measureText(calText).width;
			ctx.fillText(calText, centerX - metricGap, metricY + 2);
			ctx.font = "14px system-ui, sans-serif";
			ctx.fillText("CAL", centerX - metricGap - calWidth - 8, metricY + 2);
			ctx.textAlign = "left";
			ctx.fillStyle = "rgba(255,255,255,0.6)";
			ctx.font = "11px system-ui, sans-serif";
			ctx.fillText("Total Time", centerX + metricGap, metricY - 20);
			ctx.fillStyle = "#ffd60a";
			ctx.font = "bold 24px system-ui, sans-serif";
			ctx.fillText(timeStr, centerX + metricGap, metricY + 2);
			ctx.textAlign = "left";
		};

		if (iconUrl) {
			return new Promise((resolve) => {
				const img = new Image();
				img.onload = () => { drawCard(img); try { resolve(canvas.toDataURL("image/png")); } catch { resolve(""); } };
				img.onerror = () => { drawCard(null); try { resolve(canvas.toDataURL("image/png")); } catch { resolve(""); } };
				img.src = iconUrl;
			});
		}

		drawCard(null);
		try { return canvas.toDataURL("image/png"); } catch { return ""; }
	}

	async saveImage(imageData: string, noteFilePath: string): Promise<string> {
		let base64Data = imageData;
		let extension = "png";
		if (imageData.startsWith("data:image/")) {
			const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
			if (match) { extension = match[1]; base64Data = match[2]; }
		}
		const pathParts = noteFilePath.split("/");
		const noteFileName = pathParts[pathParts.length - 1].replace(".md", "");
		const folderPath = pathParts.slice(0, -1).join("/");
		const assetsFolderPath = folderPath ? `${folderPath}/assets` : "assets";
		const imagePath = `${assetsFolderPath}/${noteFileName}.${extension}`;
		if (!this.vault.getAbstractFileByPath(assetsFolderPath)) {
			await this.vault.createFolder(assetsFolderPath);
		}
		const binaryString = atob(base64Data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
		const existingImage = this.vault.getAbstractFileByPath(imagePath);
		if (existingImage && "path" in existingImage) {
			await this.vault.modifyBinary(existingImage as TFile, bytes.buffer);
		} else {
			await this.vault.createBinary(imagePath, bytes.buffer);
		}
		return extension;
	}

	workoutFromFrontmatter(fm: Record<string, string | number>): Record<string, unknown> {
		return {
			name: typeof fm.name === "string" ? fm.name : "Workout",
			duration: typeof fm.duration === "number" ? fm.duration : undefined,
			activeEnergyBurned: typeof fm.calories === "number" ? { qty: fm.calories } : undefined,
			calories: typeof fm.calories === "number" ? fm.calories : undefined,
			start: fm.startTime ?? fm.start,
		};
	}

	isWorkoutNoteFrontmatter(fm: Record<string, string | number>): boolean {
		if (!fm.name || typeof fm.name !== "string") return false;
		return fm.duration != null || fm.calories != null || fm.startTime != null || fm.start != null;
	}

	async updateBannerForNote(file: TFile): Promise<boolean> {
		const content = await this.vault.read(file);
		const { frontmatter, body } = parseFrontmatter(content);
		if (!this.isWorkoutNoteFrontmatter(frontmatter)) return false;
		const workout = this.workoutFromFrontmatter(frontmatter);
		const imageDataUrl = await this.generateWorkoutBannerImage(workout);
		if (!imageDataUrl) return false;
		const ext = await this.saveImage(imageDataUrl, file.path);
		const noteBaseName = file.basename.replace(/\.md$/i, "");
		const relativeImagePath = `assets/${noteBaseName}.${ext}`;
		const merged = { ...frontmatter, banner: `[[${relativeImagePath}]]` };
		const filtered = frontmatterWithoutBlanks(merged);
		const newContent = "---\n" + stringifyFrontmatter(filtered) + "---\n\n" + (body || "");
		await this.vault.modify(file, newContent);
		return true;
	}

	async updateBannerForActiveNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) { new Notice("No active note."); return; }
		if (file.extension !== "md") { new Notice("Active file is not a markdown note."); return; }
		try {
			const updated = await this.updateBannerForNote(file);
			if (updated) new Notice("Banner updated.");
			else new Notice("This note doesn't look like a workout note.");
		} catch (e) {
			console.error(e);
			new Notice("Failed to update banner: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	async updateAllBanners(): Promise<{ updated: number; skipped: number; errors: number }> {
		const files = this.vault.getMarkdownFiles();
		let updated = 0;
		let skipped = 0;
		let errors = 0;
		for (const file of files) {
			try {
				const content = await this.vault.read(file);
				const { frontmatter } = parseFrontmatter(content);
				if (!this.isWorkoutNoteFrontmatter(frontmatter)) { skipped++; continue; }
				const ok = await this.updateBannerForNote(file);
				if (ok) updated++; else skipped++;
			} catch { errors++; }
		}
		return { updated, skipped, errors };
	}

	applyRounding(value: number, rounding: number): number {
		if (rounding < 0) return value;
		const decimalPlaces = (value.toString().split(".")[1] || "").length;
		if (decimalPlaces <= rounding) return value;
		const factor = Math.pow(10, rounding);
		return Math.round(value * factor) / factor;
	}

	getNestedValue(obj: Record<string, unknown>, path: string): unknown {
		const keys = path.split(".");
		let value: unknown = obj;
		for (const key of keys) {
			if (value === null || value === undefined) return undefined;
			value = (value as Record<string, unknown>)[key];
		}
		return value;
	}

	generateYAMLFrontmatter(
		data: Record<string, unknown>,
		templatePath: string,
		relativeImagePath?: string,
		workoutName?: string
	): string {
		const lines: string[] = [];
		for (const [key, value] of Object.entries(data)) {
			if (value === null || value === undefined) continue;
			if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
				const obj = value as Record<string, unknown>;
				if (obj.qty !== undefined) {
					lines.push(`${key}: ${this.formatYAMLValue(obj.qty)}`);
					if (obj.units) lines.push(`${key}Units: ${this.formatYAMLValue(obj.units)}`);
				} else {
					lines.push(`${key}: ${this.formatYAMLValue(JSON.stringify(value))}`);
				}
			} else {
				lines.push(`${key}: ${this.formatYAMLValue(value)}`);
			}
		}
		for (const field of this.settings.additionalFrontMatter) {
			if (!field.key) continue;
			if (field.key.trim().toLowerCase() === "banner") continue;
			const resolvedValue = this.resolveTemplateVariables(field.value, templatePath, relativeImagePath, workoutName);
			if (resolvedValue !== undefined && resolvedValue !== null && resolvedValue !== "") {
				lines.push(`${field.key}: ${this.formatYAMLValue(resolvedValue)}`);
			}
		}
		if (relativeImagePath) {
			lines.push(`banner: ${this.formatYAMLValue(`[[${relativeImagePath}]]`)}`);
		}
		if (workoutName) {
			lines.push(`globalType: ${this.formatYAMLValue(`[[${workoutName}]]`)}`);
		}
		return lines.join("\n") + "\n";
	}

	resolveTemplateVariables(value: string, templatePath: string, relativeImagePath?: string, workoutName?: string): string {
		let resolved = value;
		if (relativeImagePath) resolved = resolved.replace(/{image}/g, relativeImagePath);
		else resolved = resolved.replace(/{image}/g, "");
		resolved = resolved.replace(/{template}/g, templatePath);
		if (workoutName) resolved = resolved.replace(/{name}/g, workoutName);
		return resolved;
	}

	formatYAMLValue(value: unknown): string {
		if (typeof value === "string") {
			if (value.includes("[[") || value.includes(":") || value.includes('"') || value.includes("'") || value.includes("\n")) {
				return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
			}
			return value;
		}
		if (typeof value === "number") return value.toString();
		if (typeof value === "boolean") return value.toString();
		if (value instanceof Date) return value.toISOString();
		return String(value);
	}
}

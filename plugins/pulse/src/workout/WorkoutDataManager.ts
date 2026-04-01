import { TFile, Vault, normalizePath } from "obsidian";
import type { WorkoutSettings } from "../settings";
import type { ImportedWorkoutData } from "../import/types";
import { ACTIVITY_TYPE_MAP } from "../import/types";
import type {
	ExerciseNote,
	ExerciseFrontmatter,
	ExerciseLogEntry,
	SetEntry,
	SessionNote,
	SessionFrontmatter,
	SessionData,
	SessionExercise,
	ProgramNote,
	ProgramDay,
	PRRecord,
	NewExerciseData,
	NewProgramData,
} from "./types";
import { parseDistanceUnit } from "./exerciseKind";

export class WorkoutDataManager {
	constructor(private vault: Vault, private settings: WorkoutSettings) {}

	// --------------- Exercise CRUD ---------------

	async getExercise(path: string): Promise<ExerciseNote | null> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		const content = await this.vault.read(file);
		return this.parseExerciseNote(file, content, true);
	}

	async getAllExercises(): Promise<ExerciseNote[]> {
		const folder = this.settings.exercisesFolder;
		const files = this.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));
		const exercises: ExerciseNote[] = [];
		for (const file of files) {
			try {
				const content = await this.vault.read(file);
				// Lenient: any .md in the exercises folder is treated as an exercise
				const note = this.parseExerciseNote(file, content, true);
				if (note) exercises.push(note);
			} catch { /* skip unparseable */ }
		}
		return exercises;
	}

	async createExercise(data: NewExerciseData): Promise<TFile> {
		const folder = this.settings.exercisesFolder;
		await this.ensureFolder(folder);
		const sanitized = data.name.replace(/[<>:"/\\|?*]/g, "-");
		const path = normalizePath(`${folder}/${sanitized}.md`);

		const existing = this.vault.getAbstractFileByPath(path);
		if (existing && existing instanceof TFile) {
			return existing;
		}

		const fm = [
			"---",
			"pulse-type: exercise",
			`name: ${data.name}`,
			`movement: ${data.movement}`,
			`equipment: ${data.equipment}`,
			`unit: ${data.unit}`,
			data.tags?.length ? `tags: [${data.tags.join(", ")}]` : null,
			"---",
		].filter(Boolean).join("\n");
		const body = `\n# ${data.name}\n\n\`\`\`pulse-log\n[]\n\`\`\`\n`;
		const content = fm + "\n" + body;
		return await this.vault.create(path, content);
	}

	async updateExercise(path: string, updates: Partial<NewExerciseData>): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return;
		let content = await this.vault.read(file);

		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return;

		const fmText = fmMatch[1];
		const lines = fmText.split(/\r?\n/);
		const fmMap = new Map<string, string>();
		for (const line of lines) {
			const colon = line.indexOf(":");
			if (colon === -1) continue;
			fmMap.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
		}

		if (updates.name != null) fmMap.set("name", updates.name);
		if (updates.movement != null) fmMap.set("movement", updates.movement);
		if (updates.equipment != null) fmMap.set("equipment", updates.equipment);
		if (updates.unit != null) fmMap.set("unit", updates.unit);
		if (updates.tags != null) {
			fmMap.set("tags", `[${updates.tags.join(", ")}]`);
		}

		if (!fmMap.has("pulse-type")) fmMap.set("pulse-type", "exercise");

		const newFmLines: string[] = [];
		for (const [k, v] of fmMap) {
			newFmLines.push(`${k}: ${v}`);
		}
		const newFm = "---\n" + newFmLines.join("\n") + "\n---";

		content = content.replace(/^---\n[\s\S]*?\n---/, newFm);
		await this.vault.modify(file, content);
	}

	async appendSetToExercise(exercisePath: string, entry: ExerciseLogEntry): Promise<void> {
		const file = this.vault.getAbstractFileByPath(exercisePath);
		if (!file || !(file instanceof TFile)) return;
		const content = await this.vault.read(file);
		const logMatch = content.match(/(```pulse-log\n)([\s\S]*?)(```)/);

		let log: ExerciseLogEntry[];
		if (logMatch) {
			try {
				log = JSON.parse(logMatch[2]);
			} catch {
				log = [];
			}
		} else {
			log = [];
		}

		const existingIdx = log.findIndex(e => e.date === entry.date && e.sessionPath === entry.sessionPath);
		if (existingIdx >= 0) {
			log[existingIdx] = entry;
		} else {
			log.unshift(entry);
		}

		const newLogJson = JSON.stringify(log, null, 2);
		let newContent: string;

		if (logMatch) {
			newContent = content.replace(
				/(```pulse-log\n)([\s\S]*?)(```)/,
				`$1${newLogJson}\n$3`
			);
		} else {
			// No pulse-log block exists — append one to the file
			const block = "\n```pulse-log\n" + newLogJson + "\n```\n";
			newContent = content.trimEnd() + "\n" + block;
		}

		await this.vault.modify(file, newContent);

		if (this.settings.autoPR) {
			await this.updatePersonalRecord(exercisePath);
		}
	}

	// --------------- Session CRUD ---------------

	async getSession(path: string): Promise<SessionNote | null> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		const content = await this.vault.read(file);
		return this.parseSessionNote(file, content);
	}

	async getAllSessions(limit?: number): Promise<SessionNote[]> {
		const folder = this.settings.sessionsFolder;
		const files = this.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(folder + "/"))
			.sort((a, b) => b.basename.localeCompare(a.basename));
		const limited = limit ? files.slice(0, limit) : files;
		const sessions: SessionNote[] = [];
		for (const file of limited) {
			try {
				const content = await this.vault.read(file);
				const note = this.parseSessionNote(file, content);
				if (note) sessions.push(note);
			} catch { /* skip */ }
		}
		return sessions;
	}

	async createSession(programDay?: ProgramDay, programName?: string): Promise<TFile> {
		const folder = this.settings.sessionsFolder;
		await this.ensureFolder(folder);
		const now = new Date();
		const dateStr = this.formatDate(now);
		const dayName = programDay?.name ?? "Workout";
		let fileName = `${dateStr} ${dayName}.md`;
		let path = normalizePath(`${folder}/${fileName}`);

		let counter = 2;
		while (this.vault.getAbstractFileByPath(path)) {
			fileName = `${dateStr} ${dayName} ${counter}.md`;
			path = normalizePath(`${folder}/${fileName}`);
			counter++;
		}

		const exercises: SessionExercise[] = programDay
			? programDay.exercises.map((e, i) => ({
				exercisePath: e.exercisePath,
				order: i + 1,
				sets: Array.from({ length: e.sets }, (_, si) => ({
					set: si + 1,
					weight: undefined,
					reps: e.reps,
					duration: e.duration,
				} as SetEntry)),
			}))
			: [];

		const sessionData: SessionData = { exercises };
		const fm: Record<string, string | number> = {
			"pulse-type": "session" as unknown as string,
			date: dateStr,
		};
		if (programName) (fm as Record<string, string>).program = programName;
		if (programDay) (fm as Record<string, string>).programDay = programDay.name;

		const fmStr = Object.entries(fm)
			.map(([k, v]) => `${k}: ${v}`)
			.join("\n");

		const content = [
			"---",
			fmStr,
			"---",
			"",
			`# ${dateStr} — ${dayName}`,
			"",
			"```pulse-session",
			JSON.stringify(sessionData, null, 2),
			"```",
			"",
		].join("\n");

		return await this.vault.create(path, content);
	}

	async saveSession(path: string, data: SessionNote): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return;

		const fmEntries: [string, string | number][] = [
			["pulse-type", "session"],
			["date", data.frontmatter.date],
		];
		if (data.frontmatter.program) fmEntries.push(["program", data.frontmatter.program]);
		if (data.frontmatter.programDay) fmEntries.push(["programDay", data.frontmatter.programDay]);
		if (data.frontmatter.duration != null) fmEntries.push(["duration", data.frontmatter.duration]);
		if (data.frontmatter.bodyweight != null) fmEntries.push(["bodyweight", data.frontmatter.bodyweight]);
		if (data.frontmatter.notes) fmEntries.push(["notes", data.frontmatter.notes]);
		if (data.frontmatter.startTime) fmEntries.push(["startTime", data.frontmatter.startTime]);
		if (data.frontmatter.importedActivityType) fmEntries.push(["importedActivityType", data.frontmatter.importedActivityType]);
		if (data.frontmatter.importedStart) fmEntries.push(["importedStart", data.frontmatter.importedStart]);
		if (data.frontmatter.importedEnd) fmEntries.push(["importedEnd", data.frontmatter.importedEnd]);
		if (data.frontmatter.importedDuration != null) fmEntries.push(["importedDuration", data.frontmatter.importedDuration]);
		if (data.frontmatter.hrAvg != null) fmEntries.push(["hrAvg", data.frontmatter.hrAvg]);
		if (data.frontmatter.hrMax != null) fmEntries.push(["hrMax", data.frontmatter.hrMax]);
		if (data.frontmatter.importedAt) fmEntries.push(["importedAt", data.frontmatter.importedAt]);

		const fmStr = fmEntries.map(([k, v]) => {
			if (typeof v === "string" && (v.includes(":") || v.includes(" "))) return `${k}: "${v}"`;
			return `${k}: ${v}`;
		}).join("\n");

		const dayName = data.frontmatter.programDay ?? "Workout";
		const content = [
			"---",
			fmStr,
			"---",
			"",
			`# ${data.frontmatter.date} — ${dayName}`,
			"",
			"```pulse-session",
			JSON.stringify(data.session, null, 2),
			"```",
			"",
		].join("\n");

		await this.vault.modify(file, content);

		for (const exercise of data.session.exercises) {
			const logEntry: ExerciseLogEntry = {
				date: data.frontmatter.date,
				sessionPath: path,
				sets: exercise.sets.filter(s =>
					s.weight != null || s.reps != null || s.duration != null || s.distance != null,
				),
			};
			if (logEntry.sets.length > 0) {
				await this.appendSetToExercise(exercise.exercisePath, logEntry);
			}
		}
	}

	async getIncompleteSessions(limit = 10): Promise<SessionNote[]> {
		const folder = this.settings.sessionsFolder;
		const files = this.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(folder + "/"))
			.sort((a, b) => b.basename.localeCompare(a.basename));

		const results: SessionNote[] = [];
		for (const file of files) {
			if (results.length >= limit) break;
			try {
				const content = await this.vault.read(file);
				const note = this.parseSessionNote(file, content);
				if (note && note.frontmatter.duration == null && !note.frontmatter.importedActivityType) {
					results.push(note);
				}
			} catch { /* skip */ }
		}
		return results;
	}

	async saveSessionDraft(path: string, data: SessionNote): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return;

		const fmEntries: [string, string | number][] = [
			["pulse-type", "session"],
			["date", data.frontmatter.date],
		];
		if (data.frontmatter.program) fmEntries.push(["program", data.frontmatter.program]);
		if (data.frontmatter.programDay) fmEntries.push(["programDay", data.frontmatter.programDay]);
		if (data.frontmatter.bodyweight != null) fmEntries.push(["bodyweight", data.frontmatter.bodyweight]);
		if (data.frontmatter.notes) fmEntries.push(["notes", data.frontmatter.notes]);
		if (data.frontmatter.startTime) fmEntries.push(["startTime", data.frontmatter.startTime]);

		const fmStr = fmEntries.map(([k, v]) => {
			if (typeof v === "string" && (v.includes(":") || v.includes(" "))) return `${k}: "${v}"`;
			return `${k}: ${v}`;
		}).join("\n");

		const dayName = data.frontmatter.programDay ?? "Workout";
		const content = [
			"---",
			fmStr,
			"---",
			"",
			`# ${data.frontmatter.date} — ${dayName}`,
			"",
			"```pulse-session",
			JSON.stringify(data.session, null, 2),
			"```",
			"",
		].join("\n");

		await this.vault.modify(file, content);
	}

	async deleteSession(path: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (file && file instanceof TFile) {
			await this.vault.trash(file, true);
		}
	}

	// --------------- Programs ---------------

	async getAllPrograms(): Promise<ProgramNote[]> {
		const folder = this.settings.programsFolder;
		const files = this.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));
		const programs: ProgramNote[] = [];
		for (const file of files) {
			try {
				const content = await this.vault.read(file);
				const note = this.parseProgramNote(file, content);
				if (note) programs.push(note);
			} catch { /* skip */ }
		}
		return programs;
	}

	async getActiveProgram(): Promise<ProgramNote | null> {
		const programs = await this.getAllPrograms();
		return programs.find(p => p.active) ?? null;
	}

	async getNextProgramDay(): Promise<{ program: ProgramNote; day: ProgramDay } | null> {
		const program = await this.getActiveProgram();
		if (!program || program.days.length === 0) return null;

		const today = new Date();
		const dayAbbrevs = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const todayAbbrev = dayAbbrevs[today.getDay()];

		if (!program.schedule.includes(todayAbbrev)) return null;

		if (program.rotation === "weekday-mapped") {
			const dayIdx = program.schedule.indexOf(todayAbbrev);
			const day = program.days[dayIdx % program.days.length];
			return day ? { program, day } : null;
		}

		const sessions = await this.getAllSessions(program.days.length * 2);
		const programSessions = sessions.filter(s => s.frontmatter.program === program.name);
		if (programSessions.length === 0) return { program, day: program.days[0] };

		const lastDayName = programSessions[0].frontmatter.programDay;
		const lastIdx = program.days.findIndex(d => d.name === lastDayName);
		const nextIdx = (lastIdx + 1) % program.days.length;
		return { program, day: program.days[nextIdx] };
	}

	async createProgram(data: NewProgramData): Promise<TFile> {
		const folder = this.settings.programsFolder;
		await this.ensureFolder(folder);
		const sanitized = data.name.replace(/[<>:"/\\|?*]/g, "-");
		let path = normalizePath(`${folder}/${sanitized}.md`);

		let counter = 2;
		while (this.vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folder}/${sanitized} ${counter}.md`);
			counter++;
		}

		const content = this.buildProgramContent(data);
		return await this.vault.create(path, content);
	}

	async saveProgram(path: string, data: NewProgramData): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return;
		const content = this.buildProgramContent(data);
		await this.vault.modify(file, content);
	}

	private buildProgramContent(data: NewProgramData): string {
		const schedStr = data.schedule.length > 0
			? `[${data.schedule.join(", ")}]`
			: "[]";

		const programData = { days: data.days };

		return [
			"---",
			"pulse-type: program",
			`name: ${data.name}`,
			`schedule: ${schedStr}`,
			`rotation: ${data.rotation}`,
			`active: ${data.active}`,
			"---",
			"",
			`# ${data.name}`,
			"",
			"```pulse-program",
			JSON.stringify(programData, null, 2),
			"```",
			"",
		].join("\n");
	}

	// --------------- Stats / derived ---------------

	async getExerciseHistory(exercisePath: string): Promise<ExerciseLogEntry[]> {
		const note = await this.getExercise(exercisePath);
		return note?.log ?? [];
	}

	async getPersonalRecord(exercisePath: string): Promise<PRRecord | null> {
		const note = await this.getExercise(exercisePath);
		if (!note) return null;
		if (note.frontmatter["pr-weight"] && note.frontmatter["pr-date"]) {
			return {
				weight: note.frontmatter["pr-weight"],
				date: note.frontmatter["pr-date"],
				reps: 1,
			};
		}
		return this.computePR(note.log);
	}

	async updatePersonalRecord(exercisePath: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(exercisePath);
		if (!file || !(file instanceof TFile)) return;
		const content = await this.vault.read(file);
		const note = this.parseExerciseNote(file, content);
		if (!note) return;

		const pr = this.computePR(note.log);
		if (!pr) return;

		const currentPR = note.frontmatter["pr-weight"];
		if (currentPR != null && currentPR >= pr.weight) return;

		let newContent = content;
		if (newContent.includes("pr-weight:")) {
			newContent = newContent.replace(/pr-weight:.*/, `pr-weight: ${pr.weight}`);
		} else {
			newContent = newContent.replace(/---\n/, `---\npr-weight: ${pr.weight}\n`);
		}
		if (newContent.includes("pr-date:")) {
			newContent = newContent.replace(/pr-date:.*/, `pr-date: ${pr.date}`);
		} else {
			newContent = newContent.replace(/(pr-weight:.*\n)/, `$1pr-date: ${pr.date}\n`);
		}

		await this.vault.modify(file, newContent);
	}

	// --------------- Import matching (§15) ---------------

	async findMatchingSession(
		date: string,
		startTime: Date,
		endTime: Date,
		activityType: string
	): Promise<SessionNote[]> {
		const sessions = await this.getAllSessions();
		const candidates: SessionNote[] = [];
		for (const session of sessions) {
			if (session.frontmatter.date !== date) continue;

			const compatibleCategories = ACTIVITY_TYPE_MAP[activityType];
			if (compatibleCategories) {
				const sessionCategory = session.frontmatter.programDay ?? "";
				const isCompatible = compatibleCategories.some(cat =>
					sessionCategory.toLowerCase().includes(cat.toLowerCase())
				);
				if (!isCompatible && sessionCategory) continue;
			}

			candidates.push(session);
		}
		return candidates;
	}

	async mergeImportData(sessionPath: string, importData: ImportedWorkoutData): Promise<void> {
		const session = await this.getSession(sessionPath);
		if (!session) return;

		session.frontmatter.importedActivityType = importData.activityType;
		session.frontmatter.importedStart = importData.startDate;
		session.frontmatter.importedEnd = importData.endDate;
		session.frontmatter.importedDuration = importData.duration;
		if (importData.hrAvg) session.frontmatter.hrAvg = importData.hrAvg;
		if (importData.hrMax) session.frontmatter.hrMax = importData.hrMax;
		session.frontmatter.importedAt = importData.importedAt;

		await this.saveSession(sessionPath, session);
	}

	async getUnmatchedImports(): Promise<SessionNote[]> {
		const sessions = await this.getAllSessions();
		return sessions.filter(s =>
			s.frontmatter.importedActivityType &&
			s.session.exercises.length === 0
		);
	}

	// --------------- Parsing helpers ---------------

	private parseExerciseNote(file: TFile, content: string, lenient = false): ExerciseNote | null {
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		const fm = fmMatch ? this.parseYamlFrontmatter(fmMatch[1]) : {};

		// In strict mode, require pulse-type. In lenient mode (file is in exercises folder),
		// accept any markdown file — use filename and defaults for missing fields.
		if (!lenient && fm["pulse-type"] !== "exercise") return null;

		let log: ExerciseLogEntry[] = [];
		const logMatch = content.match(/```pulse-log\n([\s\S]*?)```/);
		if (logMatch) {
			try { log = JSON.parse(logMatch[1]); } catch { log = []; }
		}

		const tags = fm.tags;
		let parsedTags: string[] | undefined;
		if (typeof tags === "string") {
			const tagMatch = tags.match(/\[([^\]]*)\]/);
			parsedTags = tagMatch ? tagMatch[1].split(",").map((t: string) => t.trim()).filter(Boolean) : [tags];
		} else if (Array.isArray(tags)) {
			parsedTags = tags;
		}

		const distU = parseDistanceUnit(fm["distance-unit"] ?? fm.distanceUnit);

		return {
			file,
			frontmatter: {
				"pulse-type": "exercise",
				name: String(fm.name ?? file.basename),
				movement: String(fm.movement ?? fm.category ?? ""),
				equipment: String(fm.equipment ?? ""),
				unit: (fm.unit === "kg" ? "kg" : this.settings.weightUnit) as "lb" | "kg",
				...(distU ? { "distance-unit": distU } : {}),
				tags: parsedTags,
				"pr-weight": fm["pr-weight"] != null ? Number(fm["pr-weight"]) : undefined,
				"pr-date": fm["pr-date"] != null ? String(fm["pr-date"]) : undefined,
			},
			log,
		};
	}

	private parseSessionNote(file: TFile, content: string): SessionNote | null {
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;
		const fm = this.parseYamlFrontmatter(fmMatch[1]);
		if (fm["pulse-type"] !== "session") return null;

		let sessionData: SessionData = { exercises: [] };
		const sessionMatch = content.match(/```pulse-session\n([\s\S]*?)```/);
		if (sessionMatch) {
			try { sessionData = JSON.parse(sessionMatch[1]); } catch { /* empty */ }
		}

		return {
			file,
			frontmatter: {
				"pulse-type": "session",
				date: String(fm.date ?? ""),
				program: fm.program != null ? String(fm.program) : undefined,
				programDay: fm.programDay != null ? String(fm.programDay) : undefined,
				duration: fm.duration != null ? Number(fm.duration) : undefined,
				bodyweight: fm.bodyweight != null ? Number(fm.bodyweight) : undefined,
				notes: fm.notes != null ? String(fm.notes) : undefined,
				startTime: fm.startTime != null ? String(fm.startTime) : undefined,
				importedActivityType: fm.importedActivityType != null ? String(fm.importedActivityType) : undefined,
				importedStart: fm.importedStart != null ? String(fm.importedStart) : undefined,
				importedEnd: fm.importedEnd != null ? String(fm.importedEnd) : undefined,
				importedDuration: fm.importedDuration != null ? Number(fm.importedDuration) : undefined,
				hrAvg: fm.hrAvg != null ? Number(fm.hrAvg) : undefined,
				hrMax: fm.hrMax != null ? Number(fm.hrMax) : undefined,
				importedAt: fm.importedAt != null ? String(fm.importedAt) : undefined,
			},
			session: sessionData,
		};
	}

	private parseProgramNote(file: TFile, content: string): ProgramNote | null {
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;
		const fm = this.parseYamlFrontmatter(fmMatch[1]);
		if (fm["pulse-type"] !== "program") return null;

		let programData: { days: ProgramDay[] } = { days: [] };
		const blockMatch = content.match(/```pulse-program\n([\s\S]*?)```/);
		if (blockMatch) {
			try { programData = JSON.parse(blockMatch[1]); } catch { /* empty */ }
		}

		let schedule: string[] = [];
		if (typeof fm.schedule === "string") {
			const schedMatch = fm.schedule.match(/\[([^\]]*)\]/);
			schedule = schedMatch ? schedMatch[1].split(",").map((s: string) => s.trim()) : [];
		} else if (Array.isArray(fm.schedule)) {
			schedule = fm.schedule;
		}

		return {
			file,
			name: String(fm.name ?? file.basename),
			schedule,
			rotation: fm.rotation === "weekday-mapped" ? "weekday-mapped" : "sequential",
			active: fm.active === true || fm.active === "true",
			days: programData.days,
		};
	}

	private parseYamlFrontmatter(fmText: string): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const line of fmText.split(/\r?\n/)) {
			const colon = line.indexOf(":");
			if (colon === -1) continue;
			const key = line.slice(0, colon).trim();
			const raw = line.slice(colon + 1).trim();
			if (raw === "" || raw === '""' || raw === "''") {
				result[key] = "";
				continue;
			}
			if (raw === "true") { result[key] = true; continue; }
			if (raw === "false") { result[key] = false; continue; }
			if (raw.startsWith("[") && raw.endsWith("]")) {
				result[key] = raw;
				continue;
			}
			const num = parseFloat(raw);
			if (!isNaN(num) && raw === num.toString()) {
				result[key] = num;
			} else {
				result[key] = raw.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
			}
		}
		return result;
	}

	private computePR(log: ExerciseLogEntry[]): PRRecord | null {
		let best: PRRecord | null = null;
		for (const entry of log) {
			for (const set of entry.sets) {
				if (set.weight != null && set.reps != null && set.weight > 0) {
					if (!best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)) {
						best = { weight: set.weight, date: entry.date, reps: set.reps };
					}
				}
			}
		}
		return best;
	}

	private formatDate(date: Date): string {
		const y = date.getFullYear();
		const m = (date.getMonth() + 1).toString().padStart(2, "0");
		const d = date.getDate().toString().padStart(2, "0");
		return `${y}-${m}-${d}`;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const parts = folderPath.split("/");
		for (let i = 1; i <= parts.length; i++) {
			const sub = parts.slice(0, i).join("/");
			if (!this.vault.getAbstractFileByPath(sub)) {
				await this.vault.createFolder(sub);
			}
		}
	}
}

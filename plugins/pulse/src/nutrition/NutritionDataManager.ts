import { TFile, normalizePath, type Vault } from "obsidian";
import type { PulseSettings } from "../settings";
import { monthPrefixFromFileName, parseNutritionLogContent } from "./parseNutritionLog";
import type { NutritionMealEntry } from "./types";

export const NUTRITION_CALENDAR_MONTH_KEY = "pulse-nutrition-calendar-month";

export function formatNutritionMonthKey(year: number, month: number): string {
	return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function parseNutritionMonthKey(key: string): { year: number; month: number } | null {
	const m = key.match(/^(\d{4})-(\d{2})$/);
	if (!m) return null;
	return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

export function getStoredNutritionMonth(): { year: number; month: number } {
	try {
		const stored = localStorage.getItem(NUTRITION_CALENDAR_MONTH_KEY);
		if (stored) {
			const parsed = parseNutritionMonthKey(stored);
			if (parsed) return parsed;
		}
	} catch {
		/* ignore */
	}
	const n = new Date();
	return { year: n.getFullYear(), month: n.getMonth() };
}

export function setStoredNutritionMonth(year: number, month: number): void {
	try {
		localStorage.setItem(NUTRITION_CALENDAR_MONTH_KEY, formatNutritionMonthKey(year, month));
	} catch {
		/* ignore */
	}
}

export class NutritionDataManager {
	constructor(
		private readonly vault: Vault,
		private readonly settings: PulseSettings
	) {}

	resolveMonthNotePath(year: number, month: number): string {
		const y = String(year);
		const mm = String(month + 1).padStart(2, "0");
		const ym = `${y}-${mm}`;
		return normalizePath(
			this.settings.nutritionNotePathTemplate
				.replace(/\{year\}/g, y)
				.replace(/\{month\}/g, mm)
				.replace(/\{YYYY\}/g, y)
				.replace(/\{MM\}/g, mm)
				.replace(/\{YYYY-MM\}/g, ym)
		);
	}

	async readMonthFile(year: number, month: number): Promise<{ path: string; content: string } | null> {
		const path = this.resolveMonthNotePath(year, month);
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		const content = await this.vault.read(file);
		return { path, content };
	}

	async loadMonthEntries(year: number, month: number): Promise<NutritionMealEntry[]> {
		const file = await this.readMonthFile(year, month);
		if (!file) return [];
		const monthPrefix = formatNutritionMonthKey(year, month);
		return parseNutritionLogContent(file.content, monthPrefix);
	}

	async loadDayEntries(date: string): Promise<{ meals: NutritionMealEntry[]; monthPath: string | null }> {
		const m = date.match(/^(\d{4})-(\d{2})/);
		if (!m) return { meals: [], monthPath: null };
		const year = Number(m[1]);
		const month = Number(m[2]) - 1;
		const file = await this.readMonthFile(year, month);
		if (!file) return { meals: [], monthPath: null };
		const meals = parseNutritionLogContent(file.content, `${m[1]}-${m[2]}`).filter((e) => e.date === date);
		return { meals, monthPath: file.path };
	}

	async listMonthFiles(): Promise<TFile[]> {
		const folderPrefix = this.settings.nutritionNotePathTemplate
			.replace(/\{year\}/g, "")
			.replace(/\{month\}/g, "")
			.replace(/\{YYYY\}/g, "")
			.replace(/\{MM\}/g, "")
			.replace(/\{YYYY-MM\}/g, "")
			.replace(/\/[^/]*$/, "");
		const normalized = normalizePath(folderPrefix.replace(/\/+/g, "/").replace(/^\/|\/$/g, ""));

		return this.vault.getMarkdownFiles().filter((f) => {
			if (normalized && !f.path.startsWith(normalized)) return false;
			return /^\d{4}-\d{2}\.md$/i.test(f.name) && monthPrefixFromFileName(f.basename) != null;
		});
	}
}

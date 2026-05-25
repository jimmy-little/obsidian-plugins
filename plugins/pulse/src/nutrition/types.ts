export interface NutritionFoodItem {
	name: string;
	calories: number;
	protein: number;
	fat: number;
	netCarbs: number;
}

export interface NutritionMealEntry {
	date: string;
	meal: string;
	time: string;
	protein: number;
	fat: number;
	netCarbs: number;
	calories: number;
	items: NutritionFoodItem[];
	summary: string;
	sourceLine: string;
}

export interface MacroTotals {
	protein: number;
	fat: number;
	netCarbs: number;
	calories: number;
}

export interface MacroCalories {
	protein: number;
	fat: number;
	netCarbs: number;
}

export function macroCaloriesFromGrams(t: Pick<MacroTotals, "protein" | "fat" | "netCarbs">): MacroCalories {
	return {
		protein: t.protein * 4,
		fat: t.fat * 9,
		netCarbs: t.netCarbs * 4,
	};
}

export function sumMealMacros(meals: NutritionMealEntry[]): MacroTotals {
	const t: MacroTotals = { protein: 0, fat: 0, netCarbs: 0, calories: 0 };
	for (const m of meals) {
		t.protein += m.protein;
		t.fat += m.fat;
		t.netCarbs += m.netCarbs;
		t.calories += m.calories;
	}
	return t;
}

export function groupMealsByDate(meals: NutritionMealEntry[]): Map<string, NutritionMealEntry[]> {
	const map = new Map<string, NutritionMealEntry[]>();
	for (const m of meals) {
		if (!map.has(m.date)) map.set(m.date, []);
		map.get(m.date)!.push(m);
	}
	for (const [, list] of map) {
		list.sort((a, b) => a.time.localeCompare(b.time) || a.meal.localeCompare(b.meal));
	}
	return map;
}

/** YAML keys written by FITINDEX/RENPHO import and Health Auto Export metrics (subset used for body comp UI). */
export type BodyMetricKey =
	| "weight"
	| "bmi"
	| "bfp"
	| "lbm"
	| "subcutaneousFat"
	| "visceralFat"
	| "bodyWater"
	| "skeletalMuscle"
	| "muscleMass"
	| "boneMass"
	| "protein"
	| "bmr"
	| "metabolicAge"
	| "bodyFatMass"
	| "musclePct"
	| "proteinMass"
	| "bodyWaterMass"
	| "whr"
	| "optimalWeight";

export interface BodyMetricDef {
	key: BodyMetricKey;
	label: string;
	unit: string;
	decimals: number;
}

export const BODY_METRIC_DEFS: BodyMetricDef[] = [
	{ key: "weight", label: "Weight", unit: "lb", decimals: 1 },
	{ key: "bmi", label: "BMI", unit: "", decimals: 1 },
	{ key: "bfp", label: "Body fat", unit: "%", decimals: 1 },
	{ key: "lbm", label: "Lean mass", unit: "lb", decimals: 1 },
	{ key: "subcutaneousFat", label: "Subcutaneous fat", unit: "%", decimals: 1 },
	{ key: "visceralFat", label: "Visceral fat", unit: "", decimals: 1 },
	{ key: "bodyWater", label: "Body water", unit: "%", decimals: 1 },
	{ key: "skeletalMuscle", label: "Skeletal muscle", unit: "%", decimals: 1 },
	{ key: "muscleMass", label: "Muscle mass", unit: "lb", decimals: 1 },
	{ key: "boneMass", label: "Bone mass", unit: "lb", decimals: 2 },
	{ key: "protein", label: "Protein", unit: "%", decimals: 1 },
	{ key: "bmr", label: "BMR", unit: "kcal", decimals: 0 },
	{ key: "metabolicAge", label: "Metabolic age", unit: "yrs", decimals: 0 },
	{ key: "bodyFatMass", label: "Body fat mass", unit: "lb", decimals: 1 },
	{ key: "musclePct", label: "Muscle %", unit: "%", decimals: 1 },
	{ key: "proteinMass", label: "Protein mass", unit: "lb", decimals: 1 },
	{ key: "bodyWaterMass", label: "Body water mass", unit: "lb", decimals: 1 },
	{ key: "whr", label: "WHR", unit: "", decimals: 2 },
	{ key: "optimalWeight", label: "Optimal weight", unit: "lb", decimals: 1 },
];

export type BodyCompDay = {
	date: string;
} & Partial<Record<BodyMetricKey, number>>;

export type BodyTimeRange = "week" | "month" | "3month" | "year" | "all";

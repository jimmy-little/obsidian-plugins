export interface KeyMapping {
	jsonKey: string;
	yamlKey: string;
	rounding?: number;
}

export interface WorkoutTemplate {
	workoutType: string;
	templatePath: string;
}

export interface AdditionalFrontMatter {
	key: string;
	value: string;
}

export interface AutoExportParsed {
	workouts: Record<string, unknown>[];
	metrics?: Record<string, unknown>[];
	sleepAnalysis?: Record<string, unknown>[];
}

export interface FITINDEXRow {
	date: string;
	time: string;
	weightKg?: number;
	weightLb?: number;
	bmi?: number;
	bodyFatPct?: number;
	bodyFatMassLb?: number;
	fatFreeWeightKg?: number;
	fatFreeWeightLb?: number;
	subcutaneousFatPct?: number;
	visceralFat?: number;
	bodyWaterPct?: number;
	bodyWaterMassLb?: number;
	musclePct?: number;
	skeletalMusclePct?: number;
	muscleMassKg?: number;
	muscleMassLb?: number;
	boneMassKg?: number;
	boneMassLb?: number;
	proteinPct?: number;
	proteinMassLb?: number;
	bmrKcal?: number;
	metabolicAge?: number;
	whr?: number;
	optimalWeightLb?: number;
	weightLevel?: string;
	bodyType?: string;
	[key: string]: string | number | undefined;
}

export interface RoutePoint {
	lat: number;
	lon: number;
	speed: number;
}

export interface ImportedWorkoutData {
	activityType: string;
	startDate: string;
	endDate: string;
	duration: number;
	hrAvg?: number;
	hrMax?: number;
	hrMin?: number;
	importedAt: string;
	sourceFile: string;
}

export const ACTIVITY_TYPE_MAP: Record<string, string[]> = {
	HKWorkoutActivityTypeTraditionalStrengthTraining: ["Push", "Pull", "Legs", "Full Body", "Upper", "Lower"],
	HKWorkoutActivityTypeRunning: ["Cardio", "Run"],
	HKWorkoutActivityTypeCycling: ["Cardio", "Cycle"],
	HKWorkoutActivityTypeYoga: ["Yoga", "Mobility"],
	HKWorkoutActivityTypeCoreTraining: ["Core"],
	HKWorkoutActivityTypeHIIT: ["Cardio", "HIIT"],
};

export const WORKOUT_TYPE_TO_ICON: Record<string, string> = {
	"traditional strength training": "strength",
	"core training": "core",
	"indoor run": "running",
	"outdoor run": "running",
	"running": "running",
	"run": "running",
	"walking": "walking",
	"outdoor walk": "walking",
	"walk": "walking",
	"indoor cycling": "cycling",
	"outdoor cycling": "cycling",
	"cycling": "cycling",
	"spin": "spin",
	"hiit": "hiit",
	"high intensity interval training": "hiit",
	"yoga": "yoga",
	"rowing": "rowing",
	"swimming": "swim",
	"swim": "swim",
	"elliptical": "elliptical",
	"stair": "stair",
	"stairs": "stair",
	"stair climbing": "stair",
	"dance": "dance",
	"hiking": "hiking",
	"hike": "hiking",
	"mind & body": "mindbody",
	"mind and body": "mindbody",
	"cooldown": "cooldown",
	"sauna": "sauna",
	"functional strength": "functionalstrength",
	"functional strength training": "functionalstrength",
	"body fit": "bodyfit",
	"body fitness": "bodyfit",
	"asana": "asana",
	"freeletics": "freeletics",
	"fitbod": "fitbod",
	"other": "other",
	"bodyfit": "bodyfit",
};

export const AUTOEXPORT_METRIC_TO_FRONTMATTER: Record<string, string> = {
	step_count: "steps",
	active_energy: "activeCalories",
	apple_exercise_time: "exerciseMinutes",
	walking_running_distance: "distance",
	flights_climbed: "flights",
	vo2_max: "vo2Max",
	blood_oxygen_saturation: "bloodOxygen",
	weight_body_mass: "weight",
	body_mass_index: "bmi",
	body_fat_percentage: "bfp",
	lean_body_mass: "lbm",
	apple_sleeping_wrist_temperature: "wristTemp",
	heart_rate_variability: "hrv",
	resting_heart_rate: "restingHr",
	respiratory_rate: "respiratoryRate",
	heart_rate: "hr",
};

export const ACTIVITY_ICONS_FOLDER = "98 Assets/images/activityIcons";

export const KG_TO_LB = 2.20462;

/** Movement value that switches logging UI to time + distance (e.g. run, bike, row). */
export function isCardioMovement(movement: string): boolean {
	return movement.trim().toLowerCase() === "cardio";
}

export type DistanceUnit = "mi" | "km" | "m";

export function parseDistanceUnit(raw: unknown): DistanceUnit | undefined {
	if (raw == null) return undefined;
	const d = String(raw).toLowerCase();
	if (d === "km") return "km";
	if (d === "m") return "m";
	if (d === "mi" || d === "mile" || d === "miles") return "mi";
	return undefined;
}

export function defaultDistanceUnit(): DistanceUnit {
	return "mi";
}

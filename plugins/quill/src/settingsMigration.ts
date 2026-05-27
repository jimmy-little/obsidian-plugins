import type { EntryOpenIn, UserEntryType } from "./settings";

const OPEN_IN_BY_NAME: Record<string, EntryOpenIn> = {
	Workout: "pulse-workout",
	Location: "markdown",
	Trip: "markdown",
	Meeting: "fulcrum-meeting",
	Food: "pulse-nutrition-day",
};

/** Apply default openIn targets for known entry type names when missing. */
export function migrateEntryTypesOpenIn(types: UserEntryType[]): UserEntryType[] {
	return types.map((t) => ({
		...t,
		openIn: t.openIn ?? OPEN_IN_BY_NAME[t.name.trim()] ?? "markdown",
	}));
}

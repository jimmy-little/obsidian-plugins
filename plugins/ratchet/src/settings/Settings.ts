export interface RatchetSettings {
	dataFolder: string;
	firstDayOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
	defaultIncrementButtons: number[];
}

export const DEFAULT_SETTINGS: RatchetSettings = {
	dataFolder: ".ratchet",
	firstDayOfWeek: 0,
	defaultIncrementButtons: [1],
};

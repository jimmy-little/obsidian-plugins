export type AvatarStyle = "circle" | "cover" | "thumbnail";

export interface OrbitSettings {
	/** Vault-relative directory paths (e.g. `People`, `Contacts/Team`). */
	peopleDirs: string[];
	avatarFrontmatterField: string;
	avatarStyle: AvatarStyle;
	/** CSS color when person has no `color` frontmatter. */
	defaultBannerColor: string;
	dateField: string;
	startTimeField: string;
	/** Inline-field key stripped from activity previews (Fulcrum/Lapse `entry` convention). */
	activityPreviewEntryField: string;
	/** Max content lines per activity preview card. */
	activityPreviewMaxLines: number;
	/**
	 * First column / top row of the yearly heatmap (`0` = Sunday … `6` = Saturday).
	 * Matches local calendar convention; align with Obsidian locale if desired.
	 */
	firstDayOfWeek: number;
}

export const DEFAULT_SETTINGS: OrbitSettings = {
	peopleDirs: ["People"],
	avatarFrontmatterField: "avatar",
	avatarStyle: "circle",
	defaultBannerColor: "#2a2a2a",
	dateField: "date",
	startTimeField: "startTime",
	activityPreviewEntryField: "entry",
	activityPreviewMaxLines: 10,
	firstDayOfWeek: 0,
};

export function normalizeSettings(raw: Partial<OrbitSettings> | undefined): OrbitSettings {
	return {
		...DEFAULT_SETTINGS,
		...raw,
		peopleDirs:
			Array.isArray(raw?.peopleDirs) && raw.peopleDirs.length > 0
				? raw.peopleDirs.map((d) => String(d).trim()).filter(Boolean)
				: DEFAULT_SETTINGS.peopleDirs,
		activityPreviewEntryField:
			(typeof raw?.activityPreviewEntryField === "string" && raw.activityPreviewEntryField.trim()
				? raw.activityPreviewEntryField.trim()
				: DEFAULT_SETTINGS.activityPreviewEntryField),
		activityPreviewMaxLines:
			typeof raw?.activityPreviewMaxLines === "number" && raw.activityPreviewMaxLines >= 1
				? Math.min(30, Math.floor(raw.activityPreviewMaxLines))
				: DEFAULT_SETTINGS.activityPreviewMaxLines,
		firstDayOfWeek:
			typeof raw?.firstDayOfWeek === "number" &&
			raw.firstDayOfWeek >= 0 &&
			raw.firstDayOfWeek <= 6
				? Math.floor(raw.firstDayOfWeek)
				: DEFAULT_SETTINGS.firstDayOfWeek,
	};
}

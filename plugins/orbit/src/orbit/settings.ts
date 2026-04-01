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
}

export const DEFAULT_SETTINGS: OrbitSettings = {
	peopleDirs: ["People"],
	avatarFrontmatterField: "avatar",
	avatarStyle: "circle",
	defaultBannerColor: "#2a2a2a",
	dateField: "date",
	startTimeField: "startTime",
};

export function normalizeSettings(raw: Partial<OrbitSettings> | undefined): OrbitSettings {
	return {
		...DEFAULT_SETTINGS,
		...raw,
		peopleDirs:
			Array.isArray(raw?.peopleDirs) && raw.peopleDirs.length > 0
				? raw.peopleDirs.map((d) => String(d).trim()).filter(Boolean)
				: DEFAULT_SETTINGS.peopleDirs,
	};
}

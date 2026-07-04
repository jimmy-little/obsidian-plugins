import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import type {OrbitSettings} from "./settings";

/** Live view of Fulcrum settings for Orbit Svelte components (field-name compatible). */
export function createOrbitSettingsProxy(target: FulcrumSettings): OrbitSettings {
	return new Proxy({} as OrbitSettings, {
		get(_t, prop: string) {
			if (prop === "avatarFrontmatterField") return target.peopleAvatarField;
			if (prop === "dateField") return target.orbitDateField;
			if (prop === "startTimeField") return target.orbitStartTimeField;
			if (prop === "activityPreviewEntryField") return target.orbitActivityPreviewEntryField;
			if (prop === "activityPreviewMaxLines") return target.orbitActivityPreviewMaxLines;
			if (prop === "firstDayOfWeek") return target.orbitFirstDayOfWeek;
			return (target as unknown as Record<string, unknown>)[prop];
		},
		set(_t, prop: string, value: unknown) {
			if (prop === "avatarFrontmatterField") {
				target.peopleAvatarField = String(value);
				return true;
			}
			if (prop === "dateField") {
				target.orbitDateField = String(value);
				return true;
			}
			if (prop === "startTimeField") {
				target.orbitStartTimeField = String(value);
				return true;
			}
			if (prop === "activityPreviewEntryField") {
				target.orbitActivityPreviewEntryField = String(value);
				return true;
			}
			if (prop === "activityPreviewMaxLines") {
				target.orbitActivityPreviewMaxLines = value as number;
				return true;
			}
			if (prop === "firstDayOfWeek") {
				target.orbitFirstDayOfWeek = value as number;
				return true;
			}
			(target as unknown as Record<string, unknown>)[prop] = value;
			return true;
		},
	});
}

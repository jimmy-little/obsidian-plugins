import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (p: string) => p.replace(/\/+/g, "/").replace(/\/$/, ""),
	TFolder: class TFolder {},
	TFile: class TFile {},
}));

import {DEFAULT_SETTINGS} from "../settingsDefaults";
import {resolveNewProjectPaths} from "../createProject";

/** No existing files/folders — exercises the "status folder doesn't exist yet" fallback path. */
function emptyVault() {
	return {getAbstractFileByPath: () => null} as unknown as import("obsidian").Vault;
}

describe("resolveNewProjectPaths", () => {
	it("preserves the configured status casing (e.g. 'ONGOING') instead of lowercasing it", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			projectActiveStatuses: "ONGOING, INTAKE",
		};
		const paths = resolveNewProjectPaths(emptyVault(), settings, "My New Project");
		expect(paths?.initialStatus).toBe("ONGOING");
	});

	it("still works for already-lowercase settings (no behavior change there)", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			projectActiveStatuses: "intake, in progress, ongoing, simmering",
		};
		const paths = resolveNewProjectPaths(emptyVault(), settings, "My New Project");
		expect(paths?.initialStatus).toBe("intake");
	});
});

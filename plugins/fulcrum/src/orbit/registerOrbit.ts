import {
	MarkdownRenderer,
	MarkdownView,
	Notice,
	TFile,
	normalizePath,
	type ObsidianProtocolData,
	type WorkspaceLeaf,
} from "obsidian";
import {openNotePropertiesModal, revealOrCreateView} from "@obsidian-suite/core";
import type FulcrumPlugin from "../main";
import {VIEW_ORBIT_ORG_CHART, VIEW_ORBIT_PERSON, isOrbitPersonViewType, ORBIT_PLUGIN_ID} from "./orbit/constants";
import {isFileInPeopleDirs} from "../fulcrum/people/pathUtils";
import {formatQuickNoteLine} from "./orbit/quickNoteFormat";
import {
	buildFullOrbitSnapshotBlock,
	buildPersonSnapshotMarkdown,
	gatherPersonSnapshotData,
	insertOrReplacePersonSnapshot,
} from "./orbit/personSnapshot";
import {createOrbitHost} from "./orbitHostBridge";
import {ConfirmDeletePersonModal} from "./modals/ConfirmDeletePersonModal";
import {OrgChartView} from "./views/OrgChartView";
import {PersonView} from "./views/PersonView";
import {transformActivityPreviewDom} from "../fulcrum/activityPreviewDom";
import {revealOrCreateOrbit} from "../fulcrum/openViews";

export function initOrbitHost(plugin: FulcrumPlugin): void {
	plugin.orbitHost = createOrbitHost(plugin);
}

export function registerOrbitViews(plugin: FulcrumPlugin): void {
	const standalone = (
		plugin.app as unknown as {plugins?: {plugins?: Record<string, {enabled?: boolean}>}}
	).plugins?.plugins?.[ORBIT_PLUGIN_ID];
	if (standalone?.enabled) {
		new Notice(
			"Orbit is now built into Fulcrum — disable the standalone Orbit plugin in Settings → Community plugins.",
			10_000,
		);
	}
	plugin.registerView(VIEW_ORBIT_PERSON, (leaf) => new PersonView(leaf, plugin.orbitHost));
	plugin.registerView(VIEW_ORBIT_ORG_CHART, (leaf) => new OrgChartView(leaf, plugin.orbitHost));
}

export function registerOrbitEvents(plugin: FulcrumPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", (file) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			if (!isFileInPeopleDirs(file.path, plugin.settings.peopleDirs)) return;
			scheduleRoutePersonFile(plugin, file);
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", (leaf) => {
			maybeRouteLeafForPerson(plugin, leaf);
		}),
	);
}

export function registerOrbitCommands(plugin: FulcrumPlugin): void {
	plugin.addCommand({
		id: "open-orbit",
		name: "Open Orbit",
		callback: () => {
			void revealOrCreateOrbit(plugin.app, plugin.settings);
		},
	});
}

export async function applyOrbitDeepLink(
	plugin: FulcrumPlugin,
	params: ObsidianProtocolData,
): Promise<void> {
	const screenRaw = String(params.screen ?? params.leaf ?? "").trim().toLowerCase();
	const route = String(params.route ?? "")
		.trim()
		.replace(/^\/+/, "");
	let screen = screenRaw;
	if (!screen && route) {
		const tail = route.replace(/^orbit\//i, "").replace(/^fulcrum\//i, "");
		screen = (tail.split("/")[0] ?? "").toLowerCase();
	}
	if (!screen) screen = "home";

	const personPath = String(params.path ?? params.personPath ?? "").trim();
	const anchorPath = String(params.anchorPath ?? "").trim();

	switch (screen) {
		case "home":
		case "main":
		case "orbit":
			await revealOrCreateOrbit(plugin.app, plugin.settings);
			return;
		case "org-chart":
		case "orgchart":
			await revealOrCreateView(
				plugin.app,
				VIEW_ORBIT_ORG_CHART,
				"sidebar",
				anchorPath ? {anchorPath: normalizePath(anchorPath)} : undefined,
			);
			return;
		case "person":
		case "profile":
			if (!personPath) {
				new Notice("Orbit: add path= or personPath= (vault path to the person note).");
				return;
			}
			await revealOrCreateOrbit(plugin.app, plugin.settings, {
				personPath: normalizePath(personPath),
			});
			return;
		default:
			new Notice(`Orbit: unknown screen "${screen}".`);
	}
}

export async function openPersonMarkdownFile(plugin: FulcrumPlugin, file: TFile): Promise<void> {
	plugin.personMarkdownPreferred.add(normalizePath(file.path));
	const leaf = plugin.app.workspace.getLeaf("split", "vertical");
	await leaf.openFile(file, {active: true, state: {mode: "source"}});
}

export async function appendPersonQuickNote(
	plugin: FulcrumPlugin,
	personFile: TFile,
	text: string,
): Promise<void> {
	const line = formatQuickNoteLine(text.trim());
	await plugin.app.vault.append(personFile, `\n${line}\n`);
}

export async function capturePersonSnapshot(plugin: FulcrumPlugin, personFile: TFile): Promise<void> {
	try {
		const data = await gatherPersonSnapshotData(
			plugin.app,
			personFile,
			plugin.orbitHost.settings,
		);
		if (!data) {
			new Notice("Could not build snapshot.");
			return;
		}
		const md = buildPersonSnapshotMarkdown(plugin.app, personFile.path, data);
		const full = buildFullOrbitSnapshotBlock(md);
		await insertOrReplacePersonSnapshot(plugin.app, personFile, full);
		new Notice("Person snapshot saved.");
	} catch (e) {
		console.error(e);
		new Notice("Could not save snapshot.");
	}
}

export async function renderOrbitActivityPreview(
	plugin: FulcrumPlugin,
	el: HTMLElement,
	sourcePath: string,
	markdown: string,
): Promise<void> {
	el.empty();
	await MarkdownRenderer.render(plugin.app, markdown, el, sourcePath, plugin);
	transformActivityPreviewDom(plugin.app, el, sourcePath, plugin.settings, plugin.vaultIndex);
}

export async function openOrgChartForAnchor(
	plugin: FulcrumPlugin,
	anchorPath: string,
): Promise<void> {
	await revealOrCreateView(plugin.app, VIEW_ORBIT_ORG_CHART, "sidebar", {anchorPath});
}

export async function openPersonInOrbitMode(
	plugin: FulcrumPlugin,
	personPath: string,
): Promise<void> {
	await revealOrCreateOrbit(plugin.app, plugin.settings, {personPath: normalizePath(personPath)});
}

export async function openPersonFile(plugin: FulcrumPlugin, file: TFile): Promise<void> {
	plugin.personMarkdownPreferred.delete(normalizePath(file.path));
	if (file.extension !== "md") {
		await plugin.app.workspace.getLeaf("tab").openFile(file);
		return;
	}
	if (!isFileInPeopleDirs(file.path, plugin.settings.peopleDirs)) {
		await plugin.app.workspace.getLeaf("tab").openFile(file);
		return;
	}
	const pmLeaf = plugin.app.workspace.getLeavesOfType("fulcrum-project-manager")[0];
	if (pmLeaf) {
		await revealOrCreateOrbit(plugin.app, plugin.settings, {personPath: normalizePath(file.path)});
		return;
	}
	const leaf = plugin.app.workspace.getLeaf("split", "vertical");
	await leaf.setViewState({
		type: VIEW_ORBIT_PERSON,
		active: true,
		state: {path: normalizePath(file.path)},
	});
	await plugin.app.workspace.revealLeaf(leaf);
}

export function openPersonProperties(plugin: FulcrumPlugin, file: TFile): void {
	const modal = openNotePropertiesModal(plugin.app, file, {
		onDeletePage: () => {
			modal.close();
			new ConfirmDeletePersonModal(plugin.app, file, async () => {
				await deletePersonNotePermanently(plugin, file);
			}).open();
		},
	});
}

async function deletePersonNotePermanently(plugin: FulcrumPlugin, file: TFile): Promise<void> {
	const pathNorm = normalizePath(file.path);
	try {
		await plugin.app.vault.delete(file);
	} catch (e) {
		console.error(e);
		new Notice("Could not delete the file.");
		return;
	}
	plugin.personMarkdownPreferred.delete(pathNorm);
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const vs = leaf.getViewState();
		if (!isOrbitPersonViewType(vs.type)) return;
		const p = (vs.state as {path?: string} | undefined)?.path;
		if (p && normalizePath(p) === pathNorm) leaf.detach();
	});
	new Notice("Note deleted.");
}

function scheduleRoutePersonFile(plugin: FulcrumPlugin, file: TFile): void {
	const target = normalizePath(file.path);
	if (plugin.personMarkdownPreferred.has(target)) return;

	const run = (): void => {
		const leaf = findMarkdownLeafForNormalizedPath(plugin, target);
		if (!leaf) return;
		const af = plugin.app.vault.getAbstractFileByPath(target);
		if (af instanceof TFile) void routeMarkdownLeafToOrbit(plugin, leaf, af);
	};
	queueMicrotask(run);
	for (const ms of [0, 16, 50, 120, 250, 450]) {
		window.setTimeout(run, ms);
	}
}

function findMarkdownLeafForNormalizedPath(
	plugin: FulcrumPlugin,
	normalizedPath: string,
): WorkspaceLeaf | null {
	let found: WorkspaceLeaf | null = null;
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const v = leaf.view;
		if (v instanceof MarkdownView && v.file && normalizePath(v.file.path) === normalizedPath) {
			found = leaf;
		}
	});
	return found;
}

function maybeRouteLeafForPerson(plugin: FulcrumPlugin, leaf: WorkspaceLeaf | null): void {
	if (!leaf) return;
	const v = leaf.view;
	if (!(v instanceof MarkdownView) || !v.file) return;
	if (!(v.file instanceof TFile) || v.file.extension !== "md") return;
	if (!isFileInPeopleDirs(v.file.path, plugin.settings.peopleDirs)) return;
	void routeMarkdownLeafToOrbit(plugin, leaf, v.file);
}

async function routeMarkdownLeafToOrbit(
	plugin: FulcrumPlugin,
	leaf: WorkspaceLeaf,
	file: TFile,
): Promise<void> {
	const pathNorm = normalizePath(file.path);
	if (plugin.personMarkdownPreferred.has(pathNorm)) return;
	const vs = leaf.getViewState();
	const stPath =
		typeof (vs.state as {path?: string} | undefined)?.path === "string"
			? normalizePath((vs.state as {path: string}).path)
			: "";
	if (isOrbitPersonViewType(vs.type) && stPath === pathNorm) {
		return;
	}
	await leaf.setViewState({
		type: VIEW_ORBIT_PERSON,
		active: true,
		state: {path: pathNorm},
	});
}

export function migrateOrbitSettings(
	merged: import("../fulcrum/settingsDefaults").FulcrumSettings,
	loaded: Record<string, unknown>,
): void {
	const legacyFolder =
		typeof loaded.peopleFolder === "string" ? loaded.peopleFolder.trim() : "";
	if (
		(!Array.isArray(merged.peopleDirs) || merged.peopleDirs.length === 0) &&
		legacyFolder
	) {
		merged.peopleDirs = [legacyFolder];
	}
	if (!Array.isArray(merged.peopleDirs)) {
		merged.peopleDirs = DEFAULT_PEOPLE_DIRS(merged);
	}
	merged.peopleDirs = merged.peopleDirs.map((d) => String(d).trim()).filter(Boolean);

	if (merged.avatarStyle !== "circle" && merged.avatarStyle !== "cover" && merged.avatarStyle !== "thumbnail") {
		merged.avatarStyle = "circle";
	}
	if (typeof merged.defaultBannerColor !== "string" || !merged.defaultBannerColor.trim()) {
		merged.defaultBannerColor = "#2a2a2a";
	}
	if (typeof merged.orbitDateField !== "string" || !merged.orbitDateField.trim()) {
		merged.orbitDateField = "date";
	}
	if (typeof merged.orbitStartTimeField !== "string" || !merged.orbitStartTimeField.trim()) {
		merged.orbitStartTimeField = "startTime";
	}
	if (
		typeof merged.orbitActivityPreviewEntryField !== "string" ||
		!merged.orbitActivityPreviewEntryField.trim()
	) {
		merged.orbitActivityPreviewEntryField = "entry";
	}
	if (
		typeof merged.orbitActivityPreviewMaxLines !== "number" ||
		merged.orbitActivityPreviewMaxLines < 1
	) {
		merged.orbitActivityPreviewMaxLines = 10;
	}
	if (
		typeof merged.orbitFirstDayOfWeek !== "number" ||
		merged.orbitFirstDayOfWeek < 0 ||
		merged.orbitFirstDayOfWeek > 6
	) {
		merged.orbitFirstDayOfWeek = 0;
	}

	delete (loaded as Record<string, unknown>).peopleFolder;
}

function DEFAULT_PEOPLE_DIRS(merged: import("../fulcrum/settingsDefaults").FulcrumSettings): string[] {
	return merged.peopleDirs?.length ? merged.peopleDirs : ["People"];
}

export function mergeStandaloneOrbitPluginData(
	plugin: FulcrumPlugin,
	merged: import("../fulcrum/settingsDefaults").FulcrumSettings,
): void {
	const orbitInst = (
		plugin.app as unknown as {plugins?: {plugins?: Record<string, {settings?: Record<string, unknown>}>}}
	).plugins?.plugins?.orbit;
	const orbitRaw = orbitInst?.settings;
	if (!orbitRaw || typeof orbitRaw !== "object") return;

	const map: [keyof typeof merged, string][] = [
		["peopleDirs", "peopleDirs"],
		["peopleAvatarField", "avatarFrontmatterField"],
		["avatarStyle", "avatarStyle"],
		["defaultBannerColor", "defaultBannerColor"],
		["orbitDateField", "dateField"],
		["orbitStartTimeField", "startTimeField"],
		["orbitActivityPreviewEntryField", "activityPreviewEntryField"],
		["orbitActivityPreviewMaxLines", "activityPreviewMaxLines"],
		["orbitFirstDayOfWeek", "firstDayOfWeek"],
	];
	for (const [fulcrumKey, orbitKey] of map) {
		const current = merged[fulcrumKey];
		const fromOrbit = orbitRaw[orbitKey];
		if (
			(fulcrumKey === "peopleDirs" && Array.isArray(current) && current.length > 0) ||
			(fulcrumKey !== "peopleDirs" && current !== undefined && current !== "" && current !== 0)
		) {
			continue;
		}
		if (fromOrbit !== undefined) {
			(merged as unknown as Record<string, unknown>)[fulcrumKey as string] = fromOrbit;
		}
	}
}

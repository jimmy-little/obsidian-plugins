import {
	MarkdownRenderer,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	normalizePath,
	type ObsidianProtocolData,
	type WorkspaceLeaf,
} from "obsidian";
import {revealOrCreateView} from "@obsidian-suite/core";
import {OrbitSettingTab} from "./OrbitSettingTab";
import {VIEW_ORBIT_MAIN, VIEW_ORBIT_ORG_CHART, VIEW_ORBIT_PERSON} from "./orbit/constants";
import type {OrbitHost} from "./orbit/pluginHost";
import {
	buildFullOrbitSnapshotBlock,
	buildPersonSnapshotMarkdown,
	gatherPersonSnapshotData,
	insertOrReplacePersonSnapshot,
} from "./orbit/personSnapshot";
import {isFileInPeopleDirs} from "./orbit/pathUtils";
import {formatQuickNoteLine} from "./orbit/quickNoteFormat";
import {DEFAULT_SETTINGS, normalizeSettings, type OrbitSettings} from "./orbit/settings";
import {OrbitMainView} from "./views/OrbitMainView";
import {ConfirmDeletePersonModal} from "./modals/ConfirmDeletePersonModal";
import {PersonPropertiesModal} from "./modals/PersonPropertiesModal";
import {OrgChartView} from "./views/OrgChartView";
import {PersonView} from "./views/PersonView";

export default class OrbitPlugin extends Plugin implements OrbitHost {
	settings: OrbitSettings = DEFAULT_SETTINGS;

	/**
	 * Paths opened via "Open note" in the person header: keep the standard Markdown
	 * editor (source) so frontmatter/metadata is reachable; skip auto Person view routing
	 * until `openPersonFile` explicitly opens Orbit again.
	 */
	private readonly personMarkdownPreferred = new Set<string>();

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async openMarkdownFile(file: TFile): Promise<void> {
		this.personMarkdownPreferred.add(normalizePath(file.path));
		const leaf = this.app.workspace.getLeaf("split", "vertical");
		await leaf.openFile(file, {active: true, state: {mode: "source"}});
	}

	async appendQuickNote(personFile: TFile, text: string): Promise<void> {
		const line = formatQuickNoteLine(text.trim());
		await this.app.vault.append(personFile, `\n${line}\n`);
	}

	async capturePersonSnapshot(personFile: TFile): Promise<void> {
		try {
			const data = await gatherPersonSnapshotData(this.app, personFile, this.settings);
			if (!data) {
				new Notice("Could not build snapshot.");
				return;
			}
			const md = buildPersonSnapshotMarkdown(this.app, personFile.path, data);
			const full = buildFullOrbitSnapshotBlock(md);
			await insertOrReplacePersonSnapshot(this.app, personFile, full);
			new Notice("Person snapshot saved.");
		} catch (e) {
			console.error(e);
			new Notice("Could not save snapshot.");
		}
	}

	async renderActivityPreview(el: HTMLElement, sourcePath: string, markdown: string): Promise<void> {
		el.empty();
		await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this);
	}

	async openOrgChartForAnchor(anchorPath: string): Promise<void> {
		await revealOrCreateView(this.app, VIEW_ORBIT_ORG_CHART, "sidebar", {anchorPath});
	}

	async openPersonProfileInMain(personPath: string): Promise<void> {
		const mainLeaf =
			this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit) ??
			this.app.workspace.getLeaf(false);
		if (!mainLeaf) return;
		await this.app.workspace.revealLeaf(mainLeaf);
		await mainLeaf.setViewState({
			type: VIEW_ORBIT_PERSON,
			active: true,
			state: {path: normalizePath(personPath)},
		});
	}

	/** Fulcrum / suite: open a person in the Orbit profile (split leaf). */
	async openPersonFile(file: TFile): Promise<void> {
		this.personMarkdownPreferred.delete(normalizePath(file.path));
		if (file.extension !== "md") {
			await this.app.workspace.getLeaf("tab").openFile(file);
			return;
		}
		if (!isFileInPeopleDirs(file.path, this.settings.peopleDirs)) {
			await this.app.workspace.getLeaf("tab").openFile(file);
			return;
		}
		const leaf = this.app.workspace.getLeaf("split", "vertical");
		await leaf.setViewState({
			type: VIEW_ORBIT_PERSON,
			active: true,
			state: {path: normalizePath(file.path)},
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_ORBIT_MAIN, (leaf) => new OrbitMainView(leaf, this));
		this.registerView(VIEW_ORBIT_PERSON, (leaf) => new PersonView(leaf, this));
		this.registerView(VIEW_ORBIT_ORG_CHART, (leaf) => new OrgChartView(leaf, this));

		this.addSettingTab(new OrbitSettingTab(this.app, this));

		/* `file-open` often fires before the target leaf is a MarkdownView — defer and scan leaves. */
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				if (!isFileInPeopleDirs(file.path, this.settings.peopleDirs)) return;
				this.scheduleRoutePersonFile(file);
			}),
		);
		/* Opening from some panes / quick switcher: ensure we catch the leaf once it’s markdown. */
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.maybeRouteLeafForPerson(leaf);
			}),
		);

		this.addRibbonIcon("orbit", "Orbit", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open Orbit",
			callback: () => void this.activateMainView(),
		});

		this.registerObsidianProtocolHandler(this.manifest.id, (params) => {
			this.handleOrbitOpenUri(params);
		});
	}

	private handleOrbitOpenUri(params: ObsidianProtocolData): void {
		void this.applyOrbitDeepLink(params).catch((err) => {
			console.error(err);
			new Notice("Orbit could not open that link.");
		});
	}

	private async applyOrbitDeepLink(params: ObsidianProtocolData): Promise<void> {
		const screenRaw = String(params.screen ?? params.leaf ?? "").trim().toLowerCase();
		const route = String(params.route ?? "")
			.trim()
			.replace(/^\/+/, "");
		let screen = screenRaw;
		if (!screen && route) {
			const tail = route.replace(/^orbit\//i, "");
			screen = (tail.split("/")[0] ?? "").toLowerCase();
		}
		if (!screen) screen = "home";

		const personPath = String(params.path ?? params.personPath ?? "").trim();
		const anchorPath = String(params.anchorPath ?? "").trim();

		switch (screen) {
			case "home":
			case "main":
				await this.activateMainView();
				return;
			case "org-chart":
			case "orgchart":
				await revealOrCreateView(
					this.app,
					VIEW_ORBIT_ORG_CHART,
					"sidebar",
					anchorPath ? { anchorPath: normalizePath(anchorPath) } : undefined,
				);
				return;
			case "person":
			case "profile":
				if (!personPath) {
					new Notice("Orbit: add path= or personPath= (vault path to the person note).");
					return;
				}
				await revealOrCreateView(this.app, VIEW_ORBIT_PERSON, "main", {
					path: normalizePath(personPath),
				});
				return;
			default:
				new Notice(`Orbit: unknown screen "${screen}".`);
		}
	}

	private async loadSettings(): Promise<void> {
		const raw = await this.loadData();
		this.settings = normalizeSettings(raw as Partial<OrbitSettings>);
	}

	/** Run after layout catches up: `file-open` is too early for `getActiveViewOfType(MarkdownView)`. */
	private scheduleRoutePersonFile(file: TFile): void {
		const target = normalizePath(file.path);
		if (this.personMarkdownPreferred.has(target)) return;

		const run = (): void => {
			const leaf = this.findMarkdownLeafForNormalizedPath(target);
			if (!leaf) return;
			const af = this.app.vault.getAbstractFileByPath(target);
			if (af instanceof TFile) void this.routeMarkdownLeafToOrbit(leaf, af);
		};
		queueMicrotask(run);
		for (const ms of [0, 16, 50, 120, 250, 450]) {
			window.setTimeout(run, ms);
		}
	}

	private findMarkdownLeafForNormalizedPath(normalizedPath: string): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view;
			if (v instanceof MarkdownView && v.file && normalizePath(v.file.path) === normalizedPath) found = leaf;
		});
		return found;
	}

	private maybeRouteLeafForPerson(leaf: WorkspaceLeaf | null): void {
		if (!leaf) return;
		const v = leaf.view;
		if (!(v instanceof MarkdownView) || !v.file) return;
		if (!(v.file instanceof TFile) || v.file.extension !== "md") return;
		if (!isFileInPeopleDirs(v.file.path, this.settings.peopleDirs)) return;
		void this.routeMarkdownLeafToOrbit(leaf, v.file);
	}

	private async routeMarkdownLeafToOrbit(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		const pathNorm = normalizePath(file.path);
		if (this.personMarkdownPreferred.has(pathNorm)) return;
		const vs = leaf.getViewState();
		const stPath =
			typeof (vs.state as {path?: string} | undefined)?.path === "string"
				? normalizePath((vs.state as {path: string}).path)
				: "";
		if (vs.type === VIEW_ORBIT_PERSON && stPath === pathNorm) {
			return;
		}
		await leaf.setViewState({
			type: VIEW_ORBIT_PERSON,
			active: true,
			state: {path: pathNorm},
		});
	}

	openPersonProperties(file: TFile): void {
		let modal!: PersonPropertiesModal;
		modal = new PersonPropertiesModal(this.app, file, {
			onDeletePage: () => {
				modal.close();
				new ConfirmDeletePersonModal(this.app, file, async () => {
					await this.deletePersonNotePermanently(file);
				}).open();
			},
		});
		modal.open();
	}

	private async deletePersonNotePermanently(file: TFile): Promise<void> {
		const pathNorm = normalizePath(file.path);
		try {
			await this.app.vault.delete(file);
		} catch (e) {
			console.error(e);
			new Notice("Could not delete the file.");
			return;
		}
		this.personMarkdownPreferred.delete(pathNorm);
		this.app.workspace.iterateAllLeaves((leaf) => {
			const vs = leaf.getViewState();
			if (vs.type !== VIEW_ORBIT_PERSON) return;
			const p = (vs.state as {path?: string} | undefined)?.path;
			if (p && normalizePath(p) === pathNorm) leaf.detach();
		});
		new Notice("Note deleted.");
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_ORBIT_MAIN, "main");
	}
}

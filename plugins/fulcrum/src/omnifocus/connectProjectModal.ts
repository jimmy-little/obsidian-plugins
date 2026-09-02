import {FuzzySuggestModal, Notice} from "obsidian";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import type {IndexedProject} from "../fulcrum/types";
import type {OmniFocusProject} from "./types";
import {writeProjectOmniId} from "./mapping";
import type {OmniFocusClient} from "./client";

type Choice =
	| {kind: "create"}
	| {kind: "project"; row: OmniFocusProject};

export class ConnectOmniFocusProjectModal extends FuzzySuggestModal<Choice> {
	private readonly choices: Choice[];

	constructor(
		private readonly host: FulcrumHost,
		private readonly project: IndexedProject,
		private readonly client: OmniFocusClient,
		projects: OmniFocusProject[],
	) {
		super(host.app);
		this.setPlaceholder("Link this Fulcrum project to OmniFocus…");
		this.choices = [{kind: "create"}, ...projects.map((row) => ({kind: "project" as const, row}))];
	}

	getItems(): Choice[] {
		return this.choices;
	}

	getItemText(item: Choice): string {
		if (item.kind === "create") {
			const name = this.project.name.trim() || this.project.file.basename.replace(/\.md$/i, "");
			return `Create new OmniFocus project "${name}"`;
		}
		const folder = item.row.folder ? ` · ${item.row.folder}` : "";
		return `${item.row.name}${folder}`;
	}

	onChooseItem(item: Choice): void {
		void this.apply(item);
	}

	private async apply(item: Choice): Promise<void> {
		try {
			let id: string;
			if (item.kind === "create") {
				const name = this.project.name.trim() || this.project.file.basename.replace(/\.md$/i, "");
				id = await this.client.createProject(name);
			} else {
				id = item.row.id;
			}
			await writeProjectOmniId(this.host.app, this.project, this.host.settings, id);
			await this.host.vaultIndex.rebuild();
			new Notice(`OmniFocus project linked for "${this.project.name}".`);
			await this.host.omnifocusSyncNow({
				projectPath: this.project.file.path,
				projectOmniId: id,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not link OmniFocus project: ${msg}`);
		}
	}
}

export function openConnectOmniFocusProjectModal(
	host: FulcrumHost,
	project: IndexedProject,
	client: OmniFocusClient,
	projects: OmniFocusProject[],
): void {
	new ConnectOmniFocusProjectModal(host, project, client, projects).open();
}

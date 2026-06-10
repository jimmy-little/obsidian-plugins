import {App, FuzzySuggestModal, Notice} from "obsidian";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import type {IndexedProject} from "../fulcrum/types";
import {connectProjectToReminderList, createReminderListForProject} from "./mappingRegistry";
import {RemctlClient} from "./remctlClient";
import {indexLists} from "./projectListSync";
import type {RemctlListRow} from "./types";

type ConnectListChoice =
	| {kind: "list"; row: RemctlListRow}
	| {kind: "create"};

export class ConnectRemindersListModal extends FuzzySuggestModal<ConnectListChoice> {
	private readonly choices: ConnectListChoice[];

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly project: IndexedProject,
		lists: RemctlListRow[],
	) {
		super(app);
		this.choices = [
			{kind: "create"},
			...lists.map((row) => ({kind: "list" as const, row})),
		];
	}

	getItems(): ConnectListChoice[] {
		return this.choices;
	}

	getItemText(item: ConnectListChoice): string {
		if (item.kind === "create") {
			const name = this.project.name.trim() || this.project.file.basename.replace(/\.md$/i, "");
			return `Create new list "${name}"`;
		}
		return item.row.name;
	}

	onChooseItem(item: ConnectListChoice, _evt: MouseEvent | KeyboardEvent): void {
		void this.apply(item);
	}

	private async apply(item: ConnectListChoice): Promise<void> {
		try {
			const remctl = new RemctlClient(this.host.settings.conduitRemctlPath);
			const lists = await remctl.lists();
			const listIndex = indexLists(lists);
			if (item.kind === "create") {
				await createReminderListForProject(
					this.app,
					remctl,
					this.project,
					this.host.settings,
					listIndex,
				);
			} else {
				await connectProjectToReminderList(
					this.app,
					remctl,
					this.project,
					item.row.id,
					this.host.settings,
					listIndex,
				);
			}
			await this.host.vaultIndex.rebuild();
			new Notice(`"${this.project.name}" syncs with Reminders.`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not connect to Reminders: ${msg}`);
		}
	}
}

export function openConnectRemindersListModal(
	host: FulcrumHost,
	project: IndexedProject,
	lists: RemctlListRow[],
): void {
	new ConnectRemindersListModal(host.app, host, project, lists).open();
}

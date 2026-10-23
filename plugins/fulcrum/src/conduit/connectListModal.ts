import {App, FuzzySuggestModal, Notice} from "obsidian";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import type {IndexedProject} from "../fulcrum/types";
import {
	clearProjectReminderList,
	connectProjectToReminderList,
	createReminderListForProject,
} from "./mappingRegistry";
import {indexLists} from "./projectListSync";
import type {ReminderListRow} from "./types";

type ConnectListChoice =
	| {kind: "list"; row: ReminderListRow}
	| {kind: "create"};

export class ConnectRemindersListModal extends FuzzySuggestModal<ConnectListChoice> {
	private readonly choices: ConnectListChoice[];

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly project: IndexedProject,
		lists: ReminderListRow[],
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
			const bridge = await this.host.getRemindersBridge();
			const lists = await bridge.lists();
			const listIndex = indexLists(lists);
			let listId: string;
			if (item.kind === "create") {
				listId = await createReminderListForProject(
					this.app,
					bridge,
					this.project,
					this.host.settings,
					listIndex,
				);
			} else {
				listId = item.row.id;
				await connectProjectToReminderList(
					this.app,
					bridge,
					this.project,
					listId,
					this.host.settings,
					listIndex,
				);
			}
			await this.host.vaultIndex.rebuild();
			new Notice(`Reminders list set for "${this.project.name}".`);
			await this.host.remindersSyncNow({
				projectPath: this.project.file.path,
				listId,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Could not set Reminders list: ${msg}`);
		}
	}
}

export function openConnectRemindersListModal(
	host: FulcrumHost,
	project: IndexedProject,
	lists: ReminderListRow[],
): void {
	new ConnectRemindersListModal(host.app, host, project, lists).open();
}

export {clearProjectReminderList};

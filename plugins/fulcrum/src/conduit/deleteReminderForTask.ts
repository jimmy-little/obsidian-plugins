import type {App} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedTask} from "../fulcrum/types";
import {readTaskReminderIdAsync, writeTaskReminderId} from "../conduit/mapping";
import {RemctlClient} from "../conduit/remctlClient";
import {ConduitService} from "../conduit/conduitService";

export async function deleteConduitReminderForTask(
	app: App,
	settings: FulcrumSettings,
	task: IndexedTask,
): Promise<void> {
	if (!settings.conduitDeleteReminderWhenTaskDeleted) return;
	if (!ConduitService.canRun(settings)) return;
	const id = await readTaskReminderIdAsync(app, task, settings);
	if (id == null) return;
	try {
		const remctl = new RemctlClient(settings.conduitRemctlPath);
		await remctl.deleteReminder(id);
		await writeTaskReminderId(app, task, settings, null);
	} catch (e) {
		console.error("Fulcrum Conduit: could not delete linked reminder", e);
	}
}

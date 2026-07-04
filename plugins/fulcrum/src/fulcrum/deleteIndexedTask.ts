import type {App} from "obsidian";
import type {IndexedTask} from "./types";

export async function deleteIndexedTask(app: App, task: IndexedTask): Promise<void> {
	if (task.source === "taskNote") {
		await app.vault.delete(task.file);
		return;
	}
	if (task.line == null) throw new Error("Inline task has no line");
	const lines = (await app.vault.read(task.file)).split("\n");
	if (lines[task.line] === undefined) throw new Error("Task line not found");
	lines.splice(task.line, 1);
	const next = lines.join("\n");
	await app.vault.modify(task.file, next.endsWith("\n") || next.length === 0 ? next : next + "\n");
}

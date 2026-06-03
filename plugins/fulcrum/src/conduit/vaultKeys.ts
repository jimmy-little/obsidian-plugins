import type {IndexedTask} from "../fulcrum/types";

export function taskVaultKey(task: IndexedTask): string {
	if (task.source === "inline" && task.line != null) {
		return `task:${task.file.path}:${task.line}`;
	}
	return `task:${task.file.path}`;
}

export function projectVaultKey(projectPath: string): string {
	return `project:${projectPath}`;
}

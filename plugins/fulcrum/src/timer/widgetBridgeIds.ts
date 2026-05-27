import type {QuickStartItemPublic} from "./types";

/** Stable id for bridge quick-start rows (companion widgets reference this). */
export function quickStartBridgeId(item: QuickStartItemPublic): string {
	if (item.kind === "template" && item.templatePath) {
		return `template:${item.templatePath}`;
	}
	if (item.kind === "project" && item.projectSourcePath) {
		return `project:${item.projectSourcePath}`;
	}
	if (item.kind === "template" && item.templateName) {
		return `template-name:${item.templateName}`;
	}
	if (item.project) {
		return `project-name:${item.project.replace(/\[\[|\]\]/g, "").trim()}`;
	}
	return `quickstart:${item.kind}`;
}

export function quickStartBridgeLabel(item: QuickStartItemPublic): string {
	const desc = item.timerDescription?.trim();
	if (desc) return desc;
	const name = item.templateName?.trim();
	if (name) return name;
	const project = item.project?.replace(/\[\[|\]\]/g, "").trim();
	if (project) return project;
	return item.kind === "template" ? "Quick start" : "Project";
}

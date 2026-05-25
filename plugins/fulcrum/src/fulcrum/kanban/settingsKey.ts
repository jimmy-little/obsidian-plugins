import type {
	FulcrumSettings,
	KanbanDimension,
	KanbanView,
} from "../settingsDefaults";

export function kanbanConfigKey(view: KanbanView, dimension: KanbanDimension): string {
	return `${view}:${dimension}`;
}

export function getKanbanHiddenColumns(
	settings: FulcrumSettings,
	view: KanbanView,
	dimension: KanbanDimension,
): string[] {
	return settings.kanbanHiddenColumns[kanbanConfigKey(view, dimension)] ?? [];
}

export function getKanbanColumnOrder(
	settings: FulcrumSettings,
	view: KanbanView,
	dimension: KanbanDimension,
): string[] {
	return settings.kanbanColumnOrder[kanbanConfigKey(view, dimension)] ?? [];
}

/** One-time migration from legacy kanbanHiddenStatus/Area arrays. */
export function migrateKanbanSettings(settings: FulcrumSettings): void {
	if (!settings.kanbanHiddenColumns || typeof settings.kanbanHiddenColumns !== "object") {
		settings.kanbanHiddenColumns = {};
	}
	if (!settings.kanbanColumnOrder || typeof settings.kanbanColumnOrder !== "object") {
		settings.kanbanColumnOrder = {};
	}

	const hidden = settings.kanbanHiddenColumns;
	const order = settings.kanbanColumnOrder;

	if (
		settings.kanbanHiddenStatus?.length &&
		!hidden["projects:status"]?.length
	) {
		hidden["projects:status"] = [...settings.kanbanHiddenStatus];
	}
	if (settings.kanbanHiddenArea?.length && !hidden["projects:area"]?.length) {
		hidden["projects:area"] = [...settings.kanbanHiddenArea];
	}
	if (settings.kanbanOrderStatus?.length && !order["projects:status"]?.length) {
		order["projects:status"] = [...settings.kanbanOrderStatus];
	}
	if (settings.kanbanOrderArea?.length && !order["projects:area"]?.length) {
		order["projects:area"] = [...settings.kanbanOrderArea];
	}
}

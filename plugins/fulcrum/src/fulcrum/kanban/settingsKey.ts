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

/** One-time migration from legacy kanbanHiddenStatus/Area arrays (read from raw loaded data). */
export function migrateKanbanSettings(
	settings: FulcrumSettings,
	raw?: Record<string, unknown>,
): void {
	if (!settings.kanbanHiddenColumns || typeof settings.kanbanHiddenColumns !== "object") {
		settings.kanbanHiddenColumns = {};
	}
	if (!settings.kanbanColumnOrder || typeof settings.kanbanColumnOrder !== "object") {
		settings.kanbanColumnOrder = {};
	}

	const hidden = settings.kanbanHiddenColumns;
	const order = settings.kanbanColumnOrder;

	const legacyHiddenStatus = raw?.kanbanHiddenStatus;
	if (
		Array.isArray(legacyHiddenStatus) &&
		legacyHiddenStatus.length &&
		!hidden["projects:status"]?.length
	) {
		hidden["projects:status"] = [...legacyHiddenStatus];
	}
	const legacyHiddenArea = raw?.kanbanHiddenArea;
	if (
		Array.isArray(legacyHiddenArea) &&
		legacyHiddenArea.length &&
		!hidden["projects:area"]?.length
	) {
		hidden["projects:area"] = [...legacyHiddenArea];
	}
	const legacyOrderStatus = raw?.kanbanOrderStatus;
	if (
		Array.isArray(legacyOrderStatus) &&
		legacyOrderStatus.length &&
		!order["projects:status"]?.length
	) {
		order["projects:status"] = [...legacyOrderStatus];
	}
	const legacyOrderArea = raw?.kanbanOrderArea;
	if (
		Array.isArray(legacyOrderArea) &&
		legacyOrderArea.length &&
		!order["projects:area"]?.length
	) {
		order["projects:area"] = [...legacyOrderArea];
	}
}

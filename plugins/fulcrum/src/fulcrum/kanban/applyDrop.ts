import type {App} from "obsidian";
import {Notice} from "obsidian";
import type {FulcrumHost} from "../pluginBridge";
import type {FulcrumSettings, KanbanDimension, KanbanSwimlaneDimension} from "../settingsDefaults";
import type {IndexSnapshot} from "../types";
import {
	applyProjectStatusChange,
	defaultApplyStatusOptions,
} from "../projectStatusApply";
import type {KanbanCard} from "./types";
import {applyKanbanProjectDrop, applyKanbanTaskDrop} from "./taskFieldUpdate";

export type KanbanAxisTarget = {
	dimension: KanbanDimension;
	id: string;
};

async function applyAxisChange(
	host: FulcrumHost,
	settings: FulcrumSettings,
	snapshot: IndexSnapshot,
	card: KanbanCard,
	target: KanbanAxisTarget,
): Promise<void> {
	const ctx = {dimension: target.dimension, columnId: target.id};
	if (card.kind === "task") {
		await applyKanbanTaskDrop(host.app, settings, card.task, ctx, snapshot);
	} else {
		await applyKanbanProjectDrop(
			host.app,
			settings,
			card.project,
			ctx,
			snapshot,
			async (projectPath, status) => {
				await applyProjectStatusChange(
					host.app,
					host,
					projectPath,
					status,
					{...defaultApplyStatusOptions(host), quiet: true, skipRebuild: true},
				);
			},
		);
	}
}

export async function applyKanbanDrop(
	host: FulcrumHost,
	settings: FulcrumSettings,
	snapshot: IndexSnapshot,
	card: KanbanCard,
	fromLaneId: string,
	fromColumnId: string,
	toLaneId: string,
	toColumnId: string,
): Promise<void> {
	const laneDim = settings.kanbanSwimlaneBy;
	const colDim = settings.kanbanColumnBy;

	try {
		if (laneDim !== "none" && fromLaneId !== toLaneId) {
			await applyAxisChange(host, settings, snapshot, card, {
				dimension: laneDim,
				id: toLaneId,
			});
		}
		if (fromColumnId !== toColumnId) {
			await applyAxisChange(host, settings, snapshot, card, {
				dimension: colDim,
				id: toColumnId,
			});
		}
		await host.vaultIndex.rebuild();
	} catch (e) {
		console.error(e);
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(msg.length < 120 ? msg : "Could not update item.");
		throw e;
	}
}

export function kanbanDimensionsForSettings(settings: FulcrumSettings): {
	column: KanbanDimension;
	lane: KanbanSwimlaneDimension;
} {
	return {
		column: settings.kanbanColumnBy,
		lane: settings.kanbanSwimlaneBy,
	};
}

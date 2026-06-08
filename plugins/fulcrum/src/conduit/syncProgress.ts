import {writable, get} from "svelte/store";
import type {ConduitSyncForce} from "./types";

export type ConduitSyncPhase =
	| "idle"
	| "waiting"
	| "lists"
	| "fetching"
	| "pulling"
	| "pushing"
	| "saving"
	| "done"
	| "error";

export type ConduitActiveAction = "sync" | "pull" | "push";

export interface ConduitSyncProgress {
	active: boolean;
	phase: ConduitSyncPhase;
	label: string;
	current?: number;
	total?: number;
	force?: ConduitSyncForce;
	activeAction?: ConduitActiveAction;
}

const THROTTLE_MS = 200;

export const IDLE_CONDUIT_SYNC_PROGRESS: ConduitSyncProgress = {
	active: false,
	phase: "idle",
	label: "",
};

export const conduitSyncProgress = writable<ConduitSyncProgress>(IDLE_CONDUIT_SYNC_PROGRESS);

let lastReportAt = 0;

export function forceToActiveAction(force: ConduitSyncForce): ConduitActiveAction {
	if (force === "pull") return "pull";
	if (force === "push") return "push";
	return "sync";
}

export function phaseToActiveAction(
	phase: ConduitSyncPhase,
	fallback: ConduitActiveAction,
): ConduitActiveAction {
	if (phase === "pulling") return "pull";
	if (phase === "pushing") return "push";
	return fallback;
}

export function reportConduitProgress(
	partial: Partial<ConduitSyncProgress>,
	opts?: {force?: boolean},
): void {
	const now = Date.now();
	if (!opts?.force && partial.active !== false && now - lastReportAt < THROTTLE_MS) {
		return;
	}
	lastReportAt = now;
	conduitSyncProgress.update((s) => ({...s, ...partial}));
}

export function resetConduitSyncProgress(): void {
	lastReportAt = 0;
	conduitSyncProgress.set(IDLE_CONDUIT_SYNC_PROGRESS);
}

export function formatConduitProgressCount(current?: number, total?: number): string | null {
	if (current == null || total == null || total <= 0) return null;
	if (total > 999) {
		const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
		return `${fmt(current)}/${fmt(total)}`;
	}
	return `${current}/${total}`;
}

export function formatConduitToolbarBadge(p: ConduitSyncProgress): string {
	const count = formatConduitProgressCount(p.current, p.total);
	if (count) return count;
	switch (p.phase) {
		case "waiting":
			return "Wait…";
		case "lists":
			return "Lists…";
		case "fetching":
			return "Read…";
		case "pulling":
			return "Pull…";
		case "pushing":
			return "Push…";
		case "saving":
			return "Save…";
		default:
			return "Sync…";
	}
}

export function formatConduitStatusBarText(p: ConduitSyncProgress): string {
	const count = formatConduitProgressCount(p.current, p.total);
	if (count) return `Conduit: ${p.label} ${count}`;
	return `Conduit: ${p.label}`;
}

export function getConduitSyncProgress(): ConduitSyncProgress {
	return get(conduitSyncProgress);
}

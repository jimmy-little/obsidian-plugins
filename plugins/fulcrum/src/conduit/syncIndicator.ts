import type FulcrumPlugin from "../main";
import type {ConduitSyncForce, ConduitSyncResult} from "./types";
import {
	conduitSyncProgress,
	formatConduitStatusBarText,
	forceToActiveAction,
	reportConduitProgress,
	resetConduitSyncProgress,
	type ConduitSyncProgress,
} from "./syncProgress";

export class ConduitSyncIndicator {
	private statusEl: HTMLElement | null = null;
	private hideTimer: number | undefined;
	private unsubscribe: (() => void) | null = null;

	constructor(private readonly plugin: FulcrumPlugin) {
		this.unsubscribe = conduitSyncProgress.subscribe((p) => this.render(p));
	}

	dispose(): void {
		if (this.hideTimer != null) window.clearTimeout(this.hideTimer);
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.statusEl?.hide();
		this.statusEl = null;
		resetConduitSyncProgress();
	}

	private ensureStatusEl(): HTMLElement | null {
		if (!this.plugin.settings.conduitShowSyncProgress) return null;
		if (!this.statusEl) {
			this.statusEl = this.plugin.addStatusBarItem();
			this.statusEl.addClass("fulcrum-conduit-status");
		}
		return this.statusEl;
	}

	private render(p: ConduitSyncProgress): void {
		const el = this.ensureStatusEl();
		if (!el) return;
		if (!p.active) {
			el.hide();
			return;
		}
		el.setText(formatConduitStatusBarText(p));
		el.show();
	}

	start(force: ConduitSyncForce): void {
		if (this.hideTimer != null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = undefined;
		}
		reportConduitProgress(
			{
				active: true,
				phase: "waiting",
				label: "Preparing…",
				force,
				activeAction: forceToActiveAction(force),
				current: undefined,
				total: undefined,
			},
			{force: true},
		);
	}

	finish(result: ConduitSyncResult): void {
		if (this.hideTimer != null) window.clearTimeout(this.hideTimer);
		if (result.deferred) {
			resetConduitSyncProgress();
			return;
		}
		const label = result.ok
			? (result.message ?? "Sync complete").replace(/^Conduit sync[^:]*:\s*/i, "")
			: (result.message ?? "Sync failed");
		reportConduitProgress(
			{
				active: true,
				phase: result.ok ? "done" : "error",
				label,
				current: undefined,
				total: undefined,
			},
			{force: true},
		);
		this.hideTimer = window.setTimeout(() => resetConduitSyncProgress(), 2500);
	}
}

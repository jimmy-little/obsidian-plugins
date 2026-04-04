import { Menu, Notice, setIcon } from "obsidian";
import type RatchetPlugin from "../main";
import type { TrackerConfig } from "../data/TrackerConfig";
import type { DataManager } from "../data/DataManager";
import { DEFAULT_TRACKER_COLOR } from "../data/TrackerConfig";
import {
	type QuickLogScope,
	QUICK_SCOPE_LABELS,
	effectiveGoalForScope,
	getScopeBounds,
	isScopeGoalMet,
	loadStoredQuickLogScope,
	persistQuickLogScope,
	progressFillPercent,
} from "./quickLogScope";

export interface QuickLogSectionOptions {
	onRefresh: () => void;
	openEditTracker: (id: string) => void;
	openNewTracker: () => void;
}

export function renderQuickLogSection(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	options: QuickLogSectionOptions,
): void {
	mount.empty();
	mount.addClass("ratchet-ql");

	const scopeRow = mount.createDiv({ cls: "ratchet-ql-scope" });
	scopeRow.setAttribute("role", "tablist");
	scopeRow.setAttribute("aria-label", "Quick log period");

	let scope = plugin.ratchetViewState.quickLogScope ?? loadStoredQuickLogScope();
	plugin.ratchetViewState.quickLogScope = scope;

	const setScope = (s: QuickLogScope): void => {
		scope = s;
		plugin.ratchetViewState.quickLogScope = s;
		persistQuickLogScope(s);
		options.onRefresh();
	};

	const scopes: QuickLogScope[] = ["day", "week", "month"];
	for (const s of scopes) {
		const btn = scopeRow.createEl("button", {
			cls: `ratchet-ql-scope-btn ${scope === s ? "ratchet-ql-scope-btn--active" : ""}`,
			type: "button",
			text: s === "day" ? "Day" : s === "week" ? "Week" : "Month",
			attr: { role: "tab", "aria-selected": scope === s ? "true" : "false" },
		});
		btn.addEventListener("click", () => setScope(s));
	}

	const list = mount.createDiv({ cls: "ratchet-ql-list" });

	void (async () => {
		const dm = plugin.getDataManager();
		const trackers = (await dm.getAllTrackers()).slice().sort((a, b) => a.name.localeCompare(b.name));
		const firstDow = plugin.settings.firstDayOfWeek;
		const now = new Date();
		const bounds = getScopeBounds(scope, now, firstDow);

		if (trackers.length === 0) {
			list.createDiv({ cls: "ratchet-ql-empty", text: "No trackers yet. Create one below." });
		}

		for (const tracker of trackers) {
			await appendQuickLogCard(list, {
				tracker,
				dm,
				scope,
				bounds,
				now,
				onRefresh: options.onRefresh,
				openEdit: () => options.openEditTracker(tracker.id),
			});
		}

		const newRow = mount.createDiv({ cls: "ratchet-ql-new" });
		const newBtn = newRow.createEl("button", {
			cls: "ratchet-ql-new-btn",
			type: "button",
			text: "+ New tracker",
		});
		newBtn.addEventListener("click", () => options.openNewTracker());
	})();
}

async function appendQuickLogCard(
	list: HTMLElement,
	ctx: {
		tracker: TrackerConfig;
		dm: DataManager;
		scope: QuickLogScope;
		bounds: { start: Date; end: Date };
		now: Date;
		onRefresh: () => void;
		openEdit: () => void;
	},
): Promise<void> {
	const { tracker, dm, scope, bounds, now, onRefresh, openEdit } = ctx;
	const wrap = list.createDiv({ cls: "ratchet-ql-card-wrap" });

	const showMenu = (ev: MouseEvent | PointerEvent): void => {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("Reset today").setIcon("rotate-ccw").onClick(() => {
				void (async () => {
					await dm.clearEventsForTrackerOnDay(tracker.id, new Date());
					new Notice(`Reset “${tracker.name}” for today.`);
					onRefresh();
				})();
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Edit tracker").setIcon("pencil").onClick(() => {
				openEdit();
			}),
		);
		menu.showAtPosition({ x: ev.clientX, y: ev.clientY });
	};

	const effGoal = effectiveGoalForScope(tracker, scope, now);
	const count = await dm.sumEventsInRange(tracker.id, bounds.start, bounds.end);
	const pct = progressFillPercent(tracker, count, effGoal);
	const met = isScopeGoalMet(tracker, count, effGoal);
	const accent = tracker.color || DEFAULT_TRACKER_COLOR;
	const unitSuffix = tracker.unit ? ` ${tracker.unit}` : "";
	const goalRounded =
		effGoal != null ? (Number.isInteger(effGoal) ? String(effGoal) : effGoal.toFixed(1)) : "";
	const sub =
		effGoal != null
			? `${QUICK_SCOPE_LABELS[scope]}: ${count} / ${goalRounded}${unitSuffix}`
			: `${QUICK_SCOPE_LABELS[scope]}: ${count}${unitSuffix}`;

	wrap.empty();
	const card = wrap.createDiv({
		cls: `ratchet-ql-card ${met ? "ratchet-ql-card--met" : ""}`,
		attr: {
			role: "button",
			tabindex: "0",
			"aria-label": `${tracker.name}. ${sub}. Tap to add 1.`,
		},
	});
	card.style.setProperty("--ratchet-ql-accent", accent);
	card.style.setProperty("--ratchet-ql-fill", `${pct}%`);

	card.createDiv({ cls: "ratchet-ql-card-fill" });

	const inner = card.createDiv({ cls: "ratchet-ql-card-inner" });
	const iconBox = inner.createDiv({ cls: "ratchet-ql-icon-box" });
	iconBox.createSpan({ cls: "ratchet-ql-icon", text: tracker.icon || "📌" });

	const textCol = inner.createDiv({ cls: "ratchet-ql-text" });
	textCol.createDiv({ cls: "ratchet-ql-name", text: tracker.name });
	textCol.createDiv({ cls: "ratchet-ql-sub", text: sub });

	const right = inner.createDiv({ cls: "ratchet-ql-right" });
	if (met) {
		right.createDiv({ cls: "ratchet-ql-val", text: String(count) });
		const check = right.createDiv({ cls: "ratchet-ql-check" });
		setIcon(check, "check");
	} else if (effGoal != null && effGoal > 0) {
		right.createDiv({ cls: "ratchet-ql-val", text: String(count) });
		right.createDiv({ cls: "ratchet-ql-pct", text: `${Math.round(pct)}%` });
	} else {
		right.createDiv({ cls: "ratchet-ql-val", text: String(count) });
	}

	let longPressTimer: number | null = null;
	let longPressConsumed = false;

	const clearTimer = (): void => {
		if (longPressTimer != null) {
			window.clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	};

	const onIncrement = (): void => {
		void (async () => {
			await dm.increment(tracker.id, 1);
			onRefresh();
		})();
	};

	card.addEventListener("click", (e) => {
		if (longPressConsumed) {
			longPressConsumed = false;
			return;
		}
		e.preventDefault();
		onIncrement();
	});

	card.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onIncrement();
		}
	});

	card.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		showMenu(e);
	});

	card.addEventListener("pointerdown", (e: PointerEvent) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		longPressConsumed = false;
		clearTimer();
		longPressTimer = window.setTimeout(() => {
			longPressTimer = null;
			longPressConsumed = true;
			showMenu(e);
		}, 480);
	});

	card.addEventListener("pointerup", clearTimer);
	card.addEventListener("pointercancel", clearTimer);
	card.addEventListener("pointerleave", clearTimer);
}

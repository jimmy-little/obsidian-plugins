import type { DataManager } from "../data/DataManager";
import type { TrackerConfig } from "../data/TrackerConfig";
import { hasGoal, isGoalMet, RESET_PERIOD_LABELS } from "../data/TrackerConfig";

export interface RenderTrackerCardOptions {
	tracker: TrackerConfig;
	dataManager: DataManager;
	onIncrement: () => void;
	onOpenDetail?: (t: TrackerConfig) => void;
}

export function renderTrackerCard(container: HTMLElement, options: RenderTrackerCardOptions): void {
	container.empty();
	const { tracker, dataManager, onIncrement, onOpenDetail } = options;
	const card = container.createDiv("ratchet-card");
	card.style.setProperty("--ratchet-card-accent", tracker.color || "var(--background-modifier-border)");

	const header = card.createDiv("ratchet-card-header");
	header.createSpan({ cls: "ratchet-card-icon", text: tracker.icon });
	header.createSpan({ cls: "ratchet-card-name", text: tracker.name });
	if (onOpenDetail) {
		header.addClass("ratchet-card-header-clickable");
		header.addEventListener("click", () => onOpenDetail!(tracker));
	}

	const valueEl = card.createDiv("ratchet-card-value");
	const unitSuffix = tracker.unit ? ` ${tracker.unit}` : "";

	let progressBar: HTMLDivElement | null = null;
	let progressFill: HTMLDivElement | null = null;
	let goalEl: HTMLDivElement | null = null;

	const updateUI = (): void => {
		void dataManager.getCurrentCount(tracker.id).then((count) => {
			valueEl.empty();
			valueEl.createSpan({ text: String(count) });
			if (tracker.unit) valueEl.createSpan({ cls: "ratchet-card-unit", text: unitSuffix });

			if (progressFill) {
				let pct: number;
				if (tracker.goalType === "at most") {
					// Bar = how much of the cap you've used (fills as you increment)
					if (tracker.goal === 0) pct = count === 0 ? 0 : 100;
					else pct = Math.min(100, Math.max(0, (count / tracker.goal) * 100));
				} else {
					const denom = Math.max(tracker.goal, 1);
					pct = Math.min(100, (count / denom) * 100);
				}
				progressFill.style.width = `${pct}%`;
			}
			if (goalEl && tracker.goalType !== "none") {
				goalEl.empty();
				const met = isGoalMet(tracker, count);
				const periodLabel = RESET_PERIOD_LABELS[tracker.resetPeriod];
				goalEl.createSpan({
					text: `${periodLabel}: ${count}/${tracker.goal}${met ? " ✓" : ""}`,
					cls: met ? "ratchet-card-goal-met" : "",
				});
			}
		});
	};
	updateUI();

	const btnRow = card.createDiv("ratchet-card-buttons");
	const minusBtn = btnRow.createEl("button", { text: "-1" });
	minusBtn.addEventListener("click", async (e) => {
		e.stopPropagation();
		await dataManager.increment(tracker.id, -1);
		updateUI();
		onIncrement();
	});
	for (const v of tracker.incrementButtons) {
		const btn = btnRow.createEl("button", { text: `+${v}` });
		btn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await dataManager.increment(tracker.id, v);
			updateUI();
			onIncrement();
		});
	}

	if (hasGoal(tracker)) {
		const progressWrap = card.createDiv("ratchet-card-progress-wrap");
		progressBar = progressWrap.createDiv("ratchet-card-progress");
		progressFill = progressBar.createDiv("ratchet-card-progress-fill");
		progressFill.style.backgroundColor = tracker.color || "var(--interactive-accent)";
		goalEl = card.createDiv("ratchet-card-goal");
		updateUI();
	}
}

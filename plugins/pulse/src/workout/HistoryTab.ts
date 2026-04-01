import type PulsePlugin from "../main";
import type { SessionNote, SetEntry } from "./types";

export class HistoryTab {
	private plugin: PulsePlugin;
	private container: HTMLElement | null = null;

	constructor(plugin: PulsePlugin) {
		this.plugin = plugin;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.createDiv({ cls: "pulse-workout-loading", text: "Loading sessions..." });

		const dm = this.plugin.workoutDataManager;
		const sessions = await dm.getAllSessions();

		container.empty();
		const wrapper = container.createDiv({ cls: "pulse-workout-history" });

		if (sessions.length === 0) {
			wrapper.createEl("p", { text: "No sessions yet. Start your first workout!", cls: "pulse-workout-muted" });
			return;
		}

		for (const session of sessions) {
			const row = wrapper.createDiv({ cls: "pulse-workout-history-row" });
			row.addEventListener("click", () => this.showSessionDetail(session));

			const info = row.createDiv({ cls: "pulse-workout-history-info" });
			info.createSpan({ text: session.frontmatter.date, cls: "pulse-workout-history-date" });
			const dayName = session.frontmatter.programDay ?? "Workout";
			info.createSpan({ text: dayName, cls: "pulse-workout-history-name" });

			const meta = row.createDiv({ cls: "pulse-workout-history-meta" });
			if (session.frontmatter.duration) {
				meta.createSpan({ text: `${session.frontmatter.duration} min` });
			}
			const volume = this.computeVolume(session);
			if (volume > 0) {
				meta.createSpan({ text: `${volume.toLocaleString()} ${this.plugin.settings.weightUnit}` });
			}
		}
	}

	private showSessionDetail(session: SessionNote): void {
		if (!this.container) return;
		this.container.empty();

		const detail = this.container.createDiv({ cls: "pulse-workout-session-detail" });

		const header = detail.createDiv({ cls: "pulse-workout-detail-header" });
		const backBtn = header.createEl("button", { text: "← Back", cls: "pulse-workout-btn pulse-workout-btn-link" });
		backBtn.addEventListener("click", () => this.render(this.container!));

		header.createEl("h3", {
			text: `${session.frontmatter.date} — ${session.frontmatter.programDay ?? "Workout"}`,
		});

		if (session.frontmatter.duration) {
			detail.createEl("p", { text: `Duration: ${session.frontmatter.duration} min`, cls: "pulse-workout-muted" });
		}

		if (session.session.exercises.length === 0) {
			detail.createEl("p", { text: "No exercises recorded.", cls: "pulse-workout-muted" });
			return;
		}

		for (const exercise of session.session.exercises) {
			const exDiv = detail.createDiv({ cls: "pulse-workout-detail-exercise" });
			const name = exercise.exercisePath.split("/").pop()?.replace(".md", "") ?? exercise.exercisePath;
			exDiv.createEl("h4", { text: name });

			const table = exDiv.createEl("table", { cls: "pulse-workout-detail-table" });
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			["Set", "Weight", "Reps", "Note"].forEach(h => headerRow.createEl("th", { text: h }));

			const tbody = table.createEl("tbody");
			for (const set of exercise.sets) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: String(set.set) });
				row.createEl("td", { text: set.weight != null ? `${set.weight} ${this.plugin.settings.weightUnit}` : "—" });
				row.createEl("td", { text: set.reps != null ? String(set.reps) : "—" });
				row.createEl("td", { text: set.note ?? "" });
			}
		}
	}

	private computeVolume(session: SessionNote): number {
		return session.session.exercises.reduce((total, ex) =>
			total + ex.sets.reduce((sum, s) => sum + ((s.weight ?? 0) * (s.reps ?? 0)), 0), 0);
	}

	destroy(): void {
		this.container = null;
	}
}

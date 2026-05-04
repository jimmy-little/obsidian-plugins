import { Component, MarkdownRenderer, normalizePath } from "obsidian";
import type PulsePlugin from "../main";
import type { SessionNote } from "../workout/types";

/**
 * Renders structured sets + suffix markdown for a session or imported workout note.
 * Shared by Pulse main view and the standalone workout document leaf.
 */
export async function renderSessionWorkoutBody(
	plugin: PulsePlugin,
	body: HTMLElement,
	session: SessionNote,
	sourcePath: string
): Promise<void> {
	if (session.session.exercises.length === 0) {
		body.createEl("p", {
			text: "No structured exercises in this note. Imported details may appear below.",
			cls: "pulse-workout-muted",
		});
	} else {
		for (const exercise of session.session.exercises) {
			const exSection = body.createDiv({ cls: "pulse-pm__exercise-block" });

			const exHeader = exSection.createDiv({ cls: "pulse-pm__exercise-block-head" });
			const titleEl = exHeader.createEl("h4", { cls: "pulse-pm__exercise-block-title" });
			const resolvedPath = normalizePath(
				plugin.workoutDataManager.resolveExerciseVaultPath(exercise.exercisePath)
			);
			const exNote = await plugin.workoutDataManager.getExercise(exercise.exercisePath);
			const displayName =
				exNote?.frontmatter.name?.trim() ||
				resolvedPath.split("/").pop()?.replace(/\.md$/i, "") ||
				"Exercise";
			const label = titleEl.createSpan({
				text: displayName,
				cls: "pulse-pm__link pulse-pm__exercise-name-link",
			});
			label.addEventListener("click", () => {
				void plugin.openPulseView("exercise", resolvedPath);
			});

			const table = exSection.createEl("table", { cls: "pulse-pm__table" });
			const thead = table.createEl("thead");
			const hRow = thead.createEl("tr");
			["Set", "Weight", "Reps", "Note"].forEach((h) => hRow.createEl("th", { text: h }));

			const tbody = table.createEl("tbody");
			for (const set of exercise.sets) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: String(set.set) });
				row.createEl("td", {
					text: set.weight != null ? `${set.weight} ${plugin.settings.weightUnit}` : "—",
				});
				row.createEl("td", { text: set.reps != null ? String(set.reps) : "—" });
				row.createEl("td", { text: set.note ?? "" });
			}
		}
	}

	if (session.bodySuffix?.trim()) {
		const suffixHost = body.createDiv({ cls: "pulse-pm__session-suffix" });
		const mdComp2 = new Component();
		plugin.addChild(mdComp2);
		await MarkdownRenderer.render(
			plugin.app,
			session.bodySuffix.trim(),
			suffixHost,
			sourcePath,
			mdComp2
		);
	}
}

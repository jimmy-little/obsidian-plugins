import { Component, MarkdownRenderer, normalizePath } from "obsidian";
import type PulsePlugin from "../main";
import type { SessionNote } from "../workout/types";
import { buildWorkoutSessionStats, renderWorkoutStatCards } from "../workout/workoutSessionStats";

function exerciseDisplayName(plugin: PulsePlugin, storedPath: string): string {
	const resolvedPath = normalizePath(
		plugin.workoutDataManager.resolveExerciseVaultPath(storedPath),
	);
	const cached = plugin.app.metadataCache.getCache(resolvedPath)?.frontmatter;
	const fromFm = cached?.name;
	if (typeof fromFm === "string" && fromFm.trim()) return fromFm.trim();
	return resolvedPath.split("/").pop()?.replace(/\.md$/i, "") || "Exercise";
}

/**
 * Renders structured sets + suffix markdown for a session or imported workout note.
 * Shared by Pulse main view and the standalone workout document leaf.
 */
export async function renderSessionWorkoutBody(
	plugin: PulsePlugin,
	body: HTMLElement,
	session: SessionNote,
	sourcePath: string,
	rawFrontmatter: Record<string, unknown> = {}
): Promise<void> {
	const stats = buildWorkoutSessionStats(
		rawFrontmatter,
		session.session,
		plugin.settings.weightUnit
	);
	renderWorkoutStatCards(body, stats);

	const setsHost = body.createDiv({ cls: "pulse-workout-session-sets" });
	if (session.session.exercises.length === 0) {
		setsHost.createEl("p", {
			text: "No structured exercises in this note. Imported details may appear below.",
			cls: "pulse-workout-muted",
		});
	} else {
		for (const exercise of session.session.exercises) {
			const exSection = setsHost.createDiv({ cls: "pulse-pm__exercise-block" });

			const exHeader = exSection.createDiv({ cls: "pulse-pm__exercise-block-head" });
			const titleEl = exHeader.createEl("h4", { cls: "pulse-pm__exercise-block-title" });
			const resolvedPath = normalizePath(
				plugin.workoutDataManager.resolveExerciseVaultPath(exercise.exercisePath),
			);
			const displayName = exerciseDisplayName(plugin, exercise.exercisePath);
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
		const suffixHost = body.createDiv({ cls: "pulse-pm__session-suffix pulse-workout-session-charts" });
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

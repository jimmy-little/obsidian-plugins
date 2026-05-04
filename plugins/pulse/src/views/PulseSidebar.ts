import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import type { ExerciseNote, SessionNote } from "../workout/types";
import { exerciseMatchesFilter } from "../workout/exerciseListUi";

const SIDEBAR_SEGMENT_KEY = "pulse-sidebar-segment";

export type PulseSidebarSegment = "workouts" | "exercises";

function getSidebarSegment(): PulseSidebarSegment {
	try {
		const v = localStorage.getItem(SIDEBAR_SEGMENT_KEY);
		if (v === "exercises") return "exercises";
	} catch {
		/* ignore */
	}
	return "workouts";
}

function setSidebarSegment(s: PulseSidebarSegment): void {
	try {
		localStorage.setItem(SIDEBAR_SEGMENT_KEY, s);
	} catch {
		/* ignore */
	}
}

export class PulseSidebar {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;

	constructor(plugin: PulsePlugin, view: PulseView) {
		this.plugin = plugin;
		this.view = view;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();

		const panel = container.createDiv({ cls: "pulse-sidebar-panel" });
		const dm = this.plugin.workoutDataManager;

		const segment = getSidebarSegment();

		const segWrap = panel.createDiv({ cls: "pulse-sidebar__segment-wrap" });
		const seg = segWrap.createDiv({
			cls: "pulse-sidebar__segment",
			attr: { role: "tablist", "aria-label": "Sidebar list" },
		});

		const mkSegBtn = (id: PulseSidebarSegment, label: string) => {
			const btn = seg.createEl("button", {
				type: "button",
				cls: `pulse-sidebar__segment-btn ${segment === id ? "pulse-sidebar__segment-btn--active" : ""}`,
				text: label,
				attr: { role: "tab", "aria-selected": segment === id ? "true" : "false" },
			});
			btn.addEventListener("click", async () => {
				if (getSidebarSegment() === id) return;
				setSidebarSegment(id);
				if (this.container) await this.render(this.container);
			});
			return btn;
		};
		mkSegBtn("workouts", "Workouts");
		mkSegBtn("exercises", "Exercises");

		const scrollArea = panel.createDiv({ cls: "pulse-sidebar__segment-scroll" });

		if (segment === "workouts") {
			const entries = await dm.getAllWorkoutSidebarEntries();
			this.renderWorkoutsList(scrollArea, entries);
		} else {
			const exercises = await dm.getAllExercises();
			this.renderExercisesList(scrollArea, exercises);
		}
	}

	private renderWorkoutsList(
		parent: HTMLElement,
		entries: { session: SessionNote; headline: string; meta: string }[]
	): void {
		if (entries.length === 0) {
			parent.createDiv({
				text: "No workouts yet. Import from Health / Gravl or add session notes under your Sessions folder.",
				cls: "pulse-sidebar__empty",
			});
			return;
		}

		const list = parent.createEl("ul", { cls: "pulse-sidebar__list" });
		for (const { session, headline, meta } of entries) {
			const li = list.createEl("li", { cls: "pulse-sidebar__workout-item" });
			const row = li.createDiv({
				cls: `pulse-sidebar__row ${
					(this.view.mode === "session" || this.view.mode === "workout-edit") &&
					this.view.activePath === session.file.path
						? "pulse-sidebar__row--active"
						: ""
				}`,
			});
			row.setAttribute("role", "button");
			row.setAttribute("tabindex", "0");

			const inner = row.createDiv({ cls: "pulse-sidebar__row-inner" });
			inner.createSpan({ text: headline, cls: "pulse-sidebar__row-name" });
			inner.createSpan({ text: meta, cls: "pulse-sidebar__row-meta" });

			const go = () => this.view.navigate("session", session.file.path, true);
			row.addEventListener("click", go);
			row.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					go();
				}
			});
		}
	}

	private renderExercisesList(parent: HTMLElement, exercises: ExerciseNote[]): void {
		const searchWrap = parent.createDiv({ cls: "pulse-sidebar__search-wrap" });
		const listId = "pulse-sidebar-exercise-name-hints";
		const dataList = searchWrap.createEl("datalist", { attr: { id: listId } });
		const seen = new Set<string>();
		for (const e of exercises) {
			const n = e.frontmatter.name.trim();
			if (n && !seen.has(n)) {
				seen.add(n);
				dataList.createEl("option", { attr: { value: n } });
			}
		}

		const searchInput = searchWrap.createEl("input", {
			type: "search",
			cls: "pulse-sidebar__search",
			placeholder: "Filter exercises…",
			attr: { list: listId, autocomplete: "off" },
		});

		const listContainer = parent.createDiv({ cls: "pulse-sidebar__exercise-container" });

		const renderList = (filter: string) => {
			listContainer.empty();
			const filtered = exercises
				.filter((e) => exerciseMatchesFilter(e, filter))
				.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));

			if (filtered.length === 0) {
				listContainer.createDiv({
					text: filter.trim() ? "No matches" : "No exercises yet",
					cls: "pulse-sidebar__empty",
				});
				return;
			}

			const list = listContainer.createEl("ul", { cls: "pulse-sidebar__list" });
			for (const ex of filtered) {
				const li = list.createEl("li");
				const row = li.createDiv({
					cls: `pulse-sidebar__row ${
						this.view.mode === "exercise" && this.view.activePath === ex.file.path
							? "pulse-sidebar__row--active"
							: ""
					}`,
				});
				row.setAttribute("role", "button");
				row.setAttribute("tabindex", "0");

				const inner = row.createDiv({ cls: "pulse-sidebar__row-inner" });
				inner.createSpan({ text: ex.frontmatter.name, cls: "pulse-sidebar__row-name" });

				const details: string[] = [];
				if (ex.frontmatter.body_part) details.push(ex.frontmatter.body_part);
				if (ex.frontmatter.equipment) details.push(ex.frontmatter.equipment);
				if (ex.frontmatter["pr-weight"]) {
					details.push(`PR: ${ex.frontmatter["pr-weight"]} ${ex.frontmatter.unit}`);
				}
				if (details.length > 0) {
					inner.createSpan({ text: details.join(" · "), cls: "pulse-sidebar__row-meta" });
				}

				const path = ex.file.path;
				row.addEventListener("click", () => this.view.navigate("exercise", path, true));
				row.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						this.view.navigate("exercise", path, true);
					}
				});
			}
		};

		renderList("");
		searchInput.addEventListener("input", () => renderList(searchInput.value));
	}
}

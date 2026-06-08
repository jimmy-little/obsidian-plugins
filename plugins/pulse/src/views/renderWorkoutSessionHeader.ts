import { Notice, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { SessionNote } from "../workout/types";
import { appendWorkoutQuickNote } from "../workout/workoutQuickNote";
import {
	resolveWorkoutDisplayTitle,
	resolveWorkoutRenameValue,
} from "../workout/workoutSessionTitle";
import {
	renameWorkoutDisplayName,
	WorkoutDeleteConfirmModal,
	WorkoutRenameModal,
} from "../workout/workoutSessionModals";
import { renderWorkoutBanner, resolveWorkoutBannerSrc } from "../workout/workoutBanner";

export interface RenderWorkoutSessionHeaderOptions {
	onRefresh: () => void | Promise<void>;
	onRenamed?: () => void | Promise<void>;
	onDeleted?: () => void | Promise<void>;
	/** Return to Pulse home (timeline / dashboard). */
	onGoHome?: () => void;
	bannerWrapClass?: string;
}

export function renderWorkoutSessionHeader(
	plugin: PulsePlugin,
	mount: HTMLElement,
	session: SessionNote,
	rawFrontmatter: Record<string, unknown>,
	options: RenderWorkoutSessionHeaderOptions,
): void {
	const title = resolveWorkoutDisplayTitle(session, rawFrontmatter);
	const goHome = options.onGoHome;

	const bannerSrc = resolveWorkoutBannerSrc(
		plugin.app,
		rawFrontmatter.banner,
		session.file.path,
	);
	if (bannerSrc) {
		renderWorkoutBanner(mount, bannerSrc, {
			wrapClass: options.bannerWrapClass,
			footActions: goHome
				? [{ icon: "layout-dashboard", label: "Home", onClick: goHome }]
				: undefined,
		});
	}

	const header = mount.createDiv({ cls: "pulse-pm__main-head pulse-workout-session-head" });
	header.createEl("h2", { text: title, cls: "pulse-pm__main-title" });

	const actions = header.createDiv({ cls: "pulse-pm__main-head-actions" });
	const mkHeadBtn = (icon: string, label: string, onClick: () => void, danger = false) => {
		const btn = actions.createEl("button", {
			type: "button",
			cls: `pulse-pm__head-btn pulse-pm__head-btn--icon-only clickable-icon${
				danger ? " pulse-pm__head-btn--danger" : ""
			}`,
			attr: { "aria-label": label, title: label },
		});
		setIcon(btn.createSpan({ cls: "pulse-pm__head-btn__icon" }), icon);
		btn.addEventListener("click", onClick);
	};

	if (goHome && !bannerSrc) {
		mkHeadBtn("layout-dashboard", "Home", goHome);
	}

	mkHeadBtn("refresh-cw", "Scan for Health and Workout Imports", () => {
		void plugin.importManager.scanAndImport();
	});

	mkHeadBtn("pencil", "Rename workout", () => {
		new WorkoutRenameModal(
			plugin.app,
			resolveWorkoutRenameValue(session, rawFrontmatter),
			async (name) => {
				await renameWorkoutDisplayName(
					plugin,
					session.file.path,
					name,
					Boolean(session.frontmatter.programDay?.trim()),
				);
				new Notice("Workout renamed.");
				await options.onRenamed?.();
			},
		).open();
	});

	mkHeadBtn("square-arrow-out-up-right", "Open note", () => {
		void plugin.app.workspace.getLeaf("tab").openFile(session.file);
	});

	mkHeadBtn("trash-2", "Delete workout", () => {
		new WorkoutDeleteConfirmModal(plugin.app, title, async () => {
			await plugin.workoutDataManager.deleteSession(session.file.path);
			new Notice("Workout moved to trash.");
			await options.onDeleted?.();
		}).open();
	}, true);

	const quickSection = mount.createDiv({
		cls: "pulse-workout-section pulse-workout-section--quick-notes",
		attr: { "aria-label": "Quick notes" },
	});
	const quickRow = quickSection.createDiv({ cls: "pulse-quick-notes-row" });
	const quickInput = quickRow.createEl("textarea", {
		cls: "pulse-quick-note-input",
		attr: {
			rows: "1",
			placeholder: "Add a quick note…",
			"aria-label": "Quick note",
		},
	});

	let quickBusy = false;
	const quickBtn = quickRow.createEl("button", {
		type: "button",
		cls: "pulse-quick-note-btn",
		text: "Add Quick Note",
	});

	const setQuickBusy = (busy: boolean) => {
		quickBusy = busy;
		quickInput.disabled = busy;
		quickBtn.disabled = busy;
	};

	const submitQuickNote = async () => {
		if (quickBusy) return;
		const draft = quickInput.value;
		if (!draft.trim()) return;
		setQuickBusy(true);
		try {
			const ok = await appendWorkoutQuickNote(plugin.app.vault, session.file, draft);
			if (ok) {
				quickInput.value = "";
				await options.onRefresh();
			}
		} finally {
			setQuickBusy(false);
		}
	};

	quickBtn.addEventListener("click", () => void submitQuickNote());
	quickInput.addEventListener("keydown", (ev) => {
		if (ev.key !== "Enter" || ev.shiftKey) return;
		ev.preventDefault();
		void submitQuickNote();
	});
}

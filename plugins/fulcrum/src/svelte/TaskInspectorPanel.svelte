<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask, TaskReminderSpec} from "../fulcrum/types";
	import {
		isDoneStatus,
		normalizeStatusKey,
		parseDoneStatusSet,
		parseTaskStatusChoices,
	} from "../fulcrum/settingsDefaults";
	import {
		applyTaskCompletedDateChange,
		applyTaskDueChange,
		applyTaskProjectChange,
		applyTaskRecurrenceChange,
		applyTaskRecurrencePreset,
		applyTaskRemindersChange,
		applyTaskScheduledOnlyChange,
		applyTaskStatusChange,
		applyTaskTagsChange,
		applyTaskTitleChange,
	} from "../fulcrum/kanban/taskFieldUpdate";
	import {waitForNextFileResolved} from "../fulcrum/calendar/calendarTaskSchedule";
	import {taskFromViewItemKey} from "../fulcrum/tasks/tasksViewModel";
	import {tasksViewSelectedKey} from "../fulcrum/tasks/tasksViewStore";
	import {indexRevision} from "../fulcrum/stores";
	import {TaskRecurrenceModal} from "../fulcrum/modals";
	import {resolveInProgressStatus} from "../fulcrum/utils/taskStatusDisplay";
	import TaskInspectorDateField from "./TaskInspectorDateField.svelte";

	export let plugin: FulcrumHost;

	const REMINDER_PRESETS: {label: string; spec: TaskReminderSpec}[] = [
		{
			label: "At scheduled time",
			spec: {type: "relative", anchor: "scheduled", offset: 0, unit: "minutes", direction: "before"},
		},
		{
			label: "1 day before due",
			spec: {type: "relative", anchor: "due", offset: 1, unit: "days", direction: "before"},
		},
		{
			label: "1 hour before scheduled",
			spec: {type: "relative", anchor: "scheduled", offset: 1, unit: "hours", direction: "before"},
		},
	];

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}

	$: selectedKey = $tasksViewSelectedKey;
	$: task = selectedKey ? taskFromViewItemKey(snapshot.tasks, selectedKey) ?? null : null;

	let titleDraft = "";
	let tagsDraft = "";
	let dueDate = "";
	let dueTime = "";
	let schedDate = "";
	let schedTime = "";
	let completedDate = "";
	let completedTime = "";

	$: if (task) {
		syncDrafts(task);
	}

	function splitDt(iso: string | undefined): {date: string; time: string} {
		const init = iso?.trim() ?? "";
		const date = init.slice(0, 10);
		const tMatch = init.match(/T(\d{2}:\d{2})/);
		return {
			date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
			time: tMatch?.[1] ?? "",
		};
	}

	function combineDt(date: string, time: string): string | null {
		const d = date.trim();
		if (!d) return null;
		const t = time.trim();
		return /^\d{2}:\d{2}$/.test(t) ? `${d}T${t}` : d;
	}

	function syncDrafts(t: IndexedTask): void {
		titleDraft = t.title?.trim() || t.file.basename.replace(/\.md$/i, "");
		const due = splitDt(t.dueDate);
		dueDate = due.date;
		dueTime = due.time;
		const sched = splitDt(t.scheduledDate);
		schedDate = sched.date;
		schedTime = sched.time;
		const completed = splitDt(t.completedDate);
		completedDate = completed.date;
		completedTime = completed.time;
		const tags =
			t.source === "inline" && t.inlineTags?.length ? t.inlineTags : t.tags;
		tagsDraft = tags.join(", ");
	}

	async function withSave(fn: () => Promise<void>): Promise<void> {
		if (!task) return;
		const resolved = waitForNextFileResolved(plugin.app, task.file);
		try {
			await fn();
		} finally {
			await resolved;
			plugin.vaultIndex.scheduleRebuild();
		}
	}

	async function saveTitle(): Promise<void> {
		if (!task) return;
		await withSave(() => applyTaskTitleChange(plugin.app, task!, plugin.settings, titleDraft));
	}

	$: doneSet = parseDoneStatusSet(plugin.settings.taskDoneStatuses);
	$: inProgressStatus = resolveInProgressStatus(plugin.settings);
	$: openStatus = (() => {
		for (const st of parseTaskStatusChoices(plugin.settings)) {
			if (isDoneStatus(st, doneSet)) continue;
			if (inProgressStatus && normalizeStatusKey(st) === normalizeStatusKey(inProgressStatus)) continue;
			return st;
		}
		return parseTaskStatusChoices(plugin.settings)[0] ?? "todo";
	})();
	$: doneStatus = (() => {
		for (const st of parseTaskStatusChoices(plugin.settings)) {
			if (isDoneStatus(st, doneSet)) return st;
		}
		return "done";
	})();

	type StatusSegment = "open" | "in-progress" | "done";

	function statusSegmentFor(taskStatus: string): StatusSegment {
		if (isDoneStatus(taskStatus, doneSet)) return "done";
		if (inProgressStatus && normalizeStatusKey(taskStatus) === normalizeStatusKey(inProgressStatus)) {
			return "in-progress";
		}
		return "open";
	}

	$: activeStatusSegment = task ? statusSegmentFor(task.status) : "open";
	$: statusDisplayLabel =
		activeStatusSegment === "done"
			? "Done"
			: activeStatusSegment === "in-progress"
				? "In Progress"
				: "Open";

	async function setStatusSegment(segment: StatusSegment): Promise<void> {
		if (!task) return;
		const target =
			segment === "done"
				? doneStatus
				: segment === "in-progress"
					? (inProgressStatus ?? openStatus)
					: openStatus;
		await withSave(() => applyTaskStatusChange(plugin.app, task!, plugin.settings, target));
	}

	async function saveDue(d: string, t: string): Promise<void> {
		if (!task) return;
		dueDate = d;
		dueTime = t;
		const v = combineDt(d, t);
		await withSave(() => applyTaskDueChange(plugin.app, task!, plugin.settings, v));
	}

	async function saveScheduled(d: string, t: string): Promise<void> {
		if (!task) return;
		schedDate = d;
		schedTime = t;
		const v = combineDt(d, t);
		await withSave(() =>
			applyTaskScheduledOnlyChange(plugin.app, task!, plugin.settings, v),
		);
	}

	async function saveCompleted(d: string, t: string): Promise<void> {
		if (!task) return;
		completedDate = d;
		completedTime = t;
		const v = combineDt(d, t);
		await withSave(() =>
			applyTaskCompletedDateChange(plugin.app, task!, plugin.settings, v),
		);
	}

	async function saveTags(): Promise<void> {
		if (!task) return;
		const tags = tagsDraft
			.split(/[,\n]/)
			.map((t) => t.trim().replace(/^#/, ""))
			.filter(Boolean);
		await withSave(() => applyTaskTagsChange(plugin.app, task!, plugin.settings, tags));
	}

	async function onProjectChange(ev: Event): Promise<void> {
		if (!task) return;
		const path = (ev.currentTarget as HTMLSelectElement).value;
		await withSave(() =>
			applyTaskProjectChange(
				plugin.app,
				task!,
				plugin.settings,
				path,
				snapshot.projects,
			),
		);
	}

	async function addReminder(spec: TaskReminderSpec): Promise<void> {
		if (!task) return;
		const existing = [...(task.reminders ?? []), spec];
		await withSave(() =>
			applyTaskRemindersChange(plugin.app, task!, plugin.settings, existing),
		);
	}

	async function clearReminders(): Promise<void> {
		if (!task) return;
		await withSave(() =>
			applyTaskRemindersChange(plugin.app, task!, plugin.settings, null),
		);
	}

	async function setRecurrencePreset(preset: "daily" | "weekly" | "monthly"): Promise<void> {
		if (!task) return;
		await withSave(() =>
			applyTaskRecurrencePreset(plugin.app, task!, plugin.settings, preset),
		);
	}

	async function clearRecurrence(): Promise<void> {
		if (!task) return;
		await withSave(() =>
			applyTaskRecurrenceChange(plugin.app, task!, plugin.settings, null),
		);
	}

	function openRecurrenceModal(freq?: "weekly" | "monthly"): void {
		if (!task) return;
		new TaskRecurrenceModal(
			plugin.app,
			task,
			plugin.settings,
			(rule, anchor) =>
				withSave(() =>
					applyTaskRecurrenceChange(plugin.app, task!, plugin.settings, rule, anchor),
				),
			freq,
		).open();
	}

	function onReminderSelect(ev: Event): void {
		const sel = ev.currentTarget as HTMLSelectElement;
		const idx = Number(sel.value);
		if (Number.isFinite(idx) && REMINDER_PRESETS[idx]) {
			void addReminder(REMINDER_PRESETS[idx]!.spec);
		}
		sel.value = "";
	}

	function onRecurrenceSelect(ev: Event): void {
		const sel = ev.currentTarget as HTMLSelectElement;
		const v = sel.value;
		sel.value = "";
		if (v === "daily") void setRecurrencePreset("daily");
		else if (v === "weekly") openRecurrenceModal("weekly");
		else if (v === "monthly") openRecurrenceModal("monthly");
		else if (v === "custom") openRecurrenceModal();
		else if (v === "clear") void clearRecurrence();
	}

	function reminderLabel(spec: TaskReminderSpec): string {
		if (spec.type === "absolute") {
			return spec.time ? `${spec.date}, ${spec.time}` : spec.date;
		}
		const preset = REMINDER_PRESETS.find(
			(p) => JSON.stringify(p.spec) === JSON.stringify(spec),
		);
		return preset?.label ?? `${spec.offset} ${spec.unit} ${spec.direction} ${spec.anchor}`;
	}

	$: activeProjects = snapshot.projects.filter((p) => p.status !== "archived");
	$: selectedProjectPath = task?.projectFile?.path ?? "__none__";
</script>

<aside class="fulcrum-tasks-inspector">
	<div class="fulcrum-tasks-inspector__scroll">
		{#if !task}
			<p class="fulcrum-muted fulcrum-tasks-inspector__empty">Select a task to edit its properties.</p>
		{:else}
			<div class="fulcrum-tasks-inspector__fields">
				<label class="fulcrum-tasks-inspector__field fulcrum-tasks-inspector__field--title">
					<textarea
						class="fulcrum-tasks-inspector__title-input"
						rows="2"
						bind:value={titleDraft}
						on:change={() => void saveTitle()}
					></textarea>
				</label>

				<div class="fulcrum-tasks-inspector__section">
					<div class="fulcrum-tasks-inspector__section-head">
						<span class="fulcrum-tasks-inspector__label">Status</span>
						<span class="fulcrum-tasks-inspector__value-hint">{statusDisplayLabel}</span>
					</div>
					<div class="fulcrum-tasks-inspector__seg-bar" role="group" aria-label="Task status">
						<button
							type="button"
							class="fulcrum-tasks-inspector__seg-btn"
							class:fulcrum-tasks-inspector__seg-btn--active={activeStatusSegment === "open"}
							aria-pressed={activeStatusSegment === "open"}
							on:click={() => void setStatusSegment("open")}
						>Open</button>
						<button
							type="button"
							class="fulcrum-tasks-inspector__seg-btn"
							class:fulcrum-tasks-inspector__seg-btn--active={activeStatusSegment === "in-progress"}
							aria-pressed={activeStatusSegment === "in-progress"}
							disabled={!inProgressStatus}
							on:click={() => void setStatusSegment("in-progress")}
						>In Progress</button>
						<button
							type="button"
							class="fulcrum-tasks-inspector__seg-btn"
							class:fulcrum-tasks-inspector__seg-btn--active={activeStatusSegment === "done"}
							aria-pressed={activeStatusSegment === "done"}
							on:click={() => void setStatusSegment("done")}
						>Done</button>
					</div>
				</div>

				<label class="fulcrum-tasks-inspector__field">
					<span class="fulcrum-tasks-inspector__label">Project</span>
					<select
						class="dropdown fulcrum-tasks-inspector__input"
						value={selectedProjectPath}
						on:change={onProjectChange}
					>
						<option value="__none__">No project</option>
						{#each activeProjects as project (project.file.path)}
							<option value={project.file.path}>{project.name}</option>
						{/each}
					</select>
				</label>

				<label class="fulcrum-tasks-inspector__field">
					<span class="fulcrum-tasks-inspector__label">Tags</span>
					<textarea
						class="fulcrum-tasks-inspector__input fulcrum-tasks-inspector__tags-input"
						rows="2"
						placeholder="Add tags…"
						bind:value={tagsDraft}
						on:change={() => void saveTags()}
					></textarea>
				</label>

				<TaskInspectorDateField
					label="Scheduled"
					bind:date={schedDate}
					bind:time={schedTime}
					existingIso={task.scheduledDate}
					onChange={saveScheduled}
				/>

				<TaskInspectorDateField
					label="Due"
					bind:date={dueDate}
					bind:time={dueTime}
					existingIso={task.dueDate}
					onChange={saveDue}
				/>

				{#if task.source === "taskNote"}
					<TaskInspectorDateField
						label="Completed"
						bind:date={completedDate}
						bind:time={completedTime}
						existingIso={task.completedDate}
						onChange={saveCompleted}
					/>
				{/if}

				{#if task.source === "taskNote"}
					<div class="fulcrum-tasks-inspector__section">
						<span class="fulcrum-tasks-inspector__label">Notifications</span>
						{#if task.reminders?.length}
							<ul class="fulcrum-tasks-inspector__pill-list">
								{#each task.reminders as spec, i (i)}
									<li class="fulcrum-tasks-inspector__pill">{reminderLabel(spec)}</li>
								{/each}
							</ul>
						{/if}
						<div class="fulcrum-tasks-inspector__action-row">
							<select
								class="dropdown fulcrum-tasks-inspector__input"
								on:change={onReminderSelect}
							>
								<option value="">Add Notification</option>
								{#each REMINDER_PRESETS as preset, i}
									<option value={i}>{preset.label}</option>
								{/each}
							</select>
							{#if task.reminders?.length}
								<button
									type="button"
									class="fulcrum-tasks-inspector__link-btn"
									on:click={() => void clearReminders()}
								>Clear</button>
							{/if}
						</div>
					</div>

					<div class="fulcrum-tasks-inspector__section">
						<span class="fulcrum-tasks-inspector__label">Repeat</span>
						{#if task.recurrence?.trim()}
							<p class="fulcrum-tasks-inspector__recurrence-summary">{task.recurrence}</p>
						{/if}
						<div class="fulcrum-tasks-inspector__action-row">
							<select
								class="dropdown fulcrum-tasks-inspector__input"
								on:change={onRecurrenceSelect}
							>
								<option value="">{task.recurrence?.trim() ? "Change Repetition" : "Add Repetition"}</option>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly…</option>
								<option value="monthly">Monthly…</option>
								<option value="custom">Custom…</option>
								{#if task.recurrence?.trim()}
									<option value="clear">Clear repetition</option>
								{/if}
							</select>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</aside>

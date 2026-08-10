<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask} from "../fulcrum/types";
	import {
		parseList,
		parseTaskStatusChoices,
	} from "../fulcrum/settingsDefaults";
	import {
		applyTaskDueChange,
		applyTaskPriorityChange,
		applyTaskProjectChange,
		applyTaskScheduledOnlyChange,
		applyTaskStatusChange,
		applyTaskTagsChange,
		applyTaskTitleChange,
	} from "../fulcrum/kanban/taskFieldUpdate";
	import {waitForNextFileResolved} from "../fulcrum/calendar/calendarTaskSchedule";
	import {taskFromViewItemKey} from "../fulcrum/tasks/tasksViewModel";
	import {tasksViewSelectedKey} from "../fulcrum/tasks/tasksViewStore";
	import {indexRevision} from "../fulcrum/stores";
	import {ProjectPickerModal} from "../fulcrum/modals";

	export let plugin: FulcrumHost;

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
			await plugin.refreshIndex();
		}
	}

	async function saveTitle(): Promise<void> {
		if (!task) return;
		await withSave(() => applyTaskTitleChange(plugin.app, task!, plugin.settings, titleDraft));
	}

	async function saveStatus(ev: Event): Promise<void> {
		if (!task) return;
		const v = (ev.currentTarget as HTMLSelectElement).value;
		await withSave(() => applyTaskStatusChange(plugin.app, task!, plugin.settings, v));
	}

	async function savePriority(ev: Event): Promise<void> {
		if (!task || task.source !== "taskNote") return;
		const v = (ev.currentTarget as HTMLSelectElement).value;
		await withSave(() => applyTaskPriorityChange(plugin.app, task!, plugin.settings, v || null));
	}

	async function saveDue(): Promise<void> {
		if (!task) return;
		const v = combineDt(dueDate, dueTime);
		await withSave(() => applyTaskDueChange(plugin.app, task!, plugin.settings, v));
	}

	async function saveScheduled(): Promise<void> {
		if (!task) return;
		const v = combineDt(schedDate, schedTime);
		await withSave(() =>
			applyTaskScheduledOnlyChange(plugin.app, task!, plugin.settings, v),
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

	function openProjectPicker(): void {
		if (!task) return;
		new ProjectPickerModal(plugin.app, snapshot.projects, (p) => {
			void withSave(() =>
				applyTaskProjectChange(
					plugin.app,
					task!,
					plugin.settings,
					p.file.path,
					snapshot.projects,
				),
			);
		}).open();
	}

	$: statusChoices = parseTaskStatusChoices(plugin.settings);
	$: priorities = parseList(plugin.settings.priorities);
	$: projectLabel = task?.projectFile
		? (snapshot.projects.find((p) => p.file.path === task!.projectFile!.path)?.name ??
			task.projectFile.basename.replace(/\.md$/i, ""))
		: "No project";
</script>

<aside class="fulcrum-tasks-inspector">
	<div class="fulcrum-tasks-inspector__scroll">
		{#if !task}
			<p class="fulcrum-muted fulcrum-tasks-inspector__empty">Select a task to edit its properties.</p>
		{:else}
			<div class="fulcrum-tasks-inspector__fields">
			<label class="fulcrum-tasks-inspector__field">
				<span class="fulcrum-tasks-inspector__label">Title</span>
				<input
					type="text"
					class="fulcrum-tasks-inspector__input"
					bind:value={titleDraft}
					on:change={() => void saveTitle()}
				/>
			</label>

			<label class="fulcrum-tasks-inspector__field">
				<span class="fulcrum-tasks-inspector__label">Status</span>
				<select class="dropdown fulcrum-tasks-inspector__input" value={task.status} on:change={saveStatus}>
					{#each statusChoices as st}
						<option value={st}>{st}</option>
					{/each}
				</select>
			</label>

			{#if task.source === "taskNote"}
				<label class="fulcrum-tasks-inspector__field">
					<span class="fulcrum-tasks-inspector__label">Priority</span>
					<select
						class="dropdown fulcrum-tasks-inspector__input"
						value={task.priority ?? ""}
						on:change={savePriority}
					>
						<option value="">(none)</option>
						{#each priorities as p}
							<option value={p}>{p}</option>
						{/each}
					</select>
				</label>
			{/if}

			<div class="fulcrum-tasks-inspector__field">
				<span class="fulcrum-tasks-inspector__label">Project</span>
				<button
					type="button"
					class="fulcrum-tasks-inspector__link-btn"
					on:click={openProjectPicker}
				>
					{projectLabel}
				</button>
			</div>

			<label class="fulcrum-tasks-inspector__field">
				<span class="fulcrum-tasks-inspector__label">Due</span>
				<div class="fulcrum-tasks-inspector__datetime">
					<input type="date" class="fulcrum-tasks-inspector__input" bind:value={dueDate} on:change={saveDue} />
					<input type="time" class="fulcrum-tasks-inspector__input" bind:value={dueTime} on:change={saveDue} />
				</div>
			</label>

			<label class="fulcrum-tasks-inspector__field">
				<span class="fulcrum-tasks-inspector__label">Scheduled</span>
				<div class="fulcrum-tasks-inspector__datetime">
					<input type="date" class="fulcrum-tasks-inspector__input" bind:value={schedDate} on:change={saveScheduled} />
					<input type="time" class="fulcrum-tasks-inspector__input" bind:value={schedTime} on:change={saveScheduled} />
				</div>
			</label>

			<label class="fulcrum-tasks-inspector__field">
				<span class="fulcrum-tasks-inspector__label">Tags</span>
				<input
					type="text"
					class="fulcrum-tasks-inspector__input"
					placeholder="comma-separated"
					bind:value={tagsDraft}
					on:change={() => void saveTags()}
				/>
			</label>
			</div>
		{/if}
	</div>
</aside>

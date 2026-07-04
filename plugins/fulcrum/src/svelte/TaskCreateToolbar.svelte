<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";

	export let plugin: FulcrumHost;
	/** When set, create actions target this project (no picker). */
	export let projectPath: string | undefined = undefined;

	$: taskSourceMode = plugin.settings.taskSourceMode;
	$: showInlineTask = taskSourceMode === "obsidianTasks" || taskSourceMode === "both";
	$: showTaskNote = taskSourceMode === "taskNotes" || taskSourceMode === "both";
	$: visible = showInlineTask || showTaskNote;

	function addInlineTask(): void {
		if (projectPath) plugin.openNewInlineTaskForProject(projectPath);
		else plugin.promptNewInlineTaskForProject();
	}

	function addTaskNote(): void {
		if (projectPath) plugin.openTaskNoteCreateForProject(projectPath);
		else plugin.promptCreateTaskNoteForProject();
	}
</script>

{#if visible}
	<div class="fulcrum-task-toolbar" role="group" aria-label="Create tasks">
		{#if showInlineTask}
			<button
				type="button"
				class="fulcrum-task-toolbar__btn"
				title="Add a checkbox task to a project note"
				on:click={addInlineTask}
			>
				Add task
			</button>
		{/if}
		{#if showTaskNote}
			<button
				type="button"
				class="fulcrum-task-toolbar__btn"
				title="Create a new task note linked to a project"
				on:click={addTaskNote}
			>
				Add task note
			</button>
		{/if}
	</div>
{/if}

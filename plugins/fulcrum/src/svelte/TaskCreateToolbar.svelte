<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";

	export let plugin: FulcrumHost;

	$: taskSourceMode = plugin.settings.taskSourceMode;
	$: showInlineTask = taskSourceMode === "obsidianTasks" || taskSourceMode === "both";
	$: showTaskNote = taskSourceMode === "taskNotes" || taskSourceMode === "both";
	$: visible = showInlineTask || showTaskNote;
</script>

{#if visible}
	<div class="fulcrum-task-toolbar" role="group" aria-label="Create tasks">
		{#if showInlineTask}
			<button
				type="button"
				class="fulcrum-task-toolbar__btn"
				title="Add a checkbox task to a project note"
				on:click={() => plugin.promptNewInlineTaskForProject()}
			>
				Add task
			</button>
		{/if}
		{#if showTaskNote}
			<button
				type="button"
				class="fulcrum-task-toolbar__btn"
				title="Create a new task note linked to a project"
				on:click={() => plugin.promptCreateTaskNoteForProject()}
			>
				Add task note
			</button>
		{/if}
	</div>
{/if}

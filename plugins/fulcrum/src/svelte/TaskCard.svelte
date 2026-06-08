<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {IndexedTask} from "../fulcrum/types";
	import TaskCardNote from "./TaskCardNote.svelte";

	export let plugin: FulcrumHost;
	export let task: IndexedTask;
	export let done: boolean;
	export let anchorLeaf: WorkspaceLeaf | undefined = undefined;
	/** Project / area views: show count-up + stop when a timer is running on this note. */
	export let showInlineTimer = false;
</script>

<TaskCardNote {plugin} {task} {done} {anchorLeaf} {showInlineTimer} />

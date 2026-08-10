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
	/** Tighter padding / wrapping for multi-column dashboard grids. */
	export let compact = false;
	/** Enable HTML5 drag for calendar / week-grid drops (due date). */
	export let enableDrag = false;
</script>

<TaskCardNote {plugin} {task} {done} {anchorLeaf} {showInlineTimer} {compact} {enableDrag} />

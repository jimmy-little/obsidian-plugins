<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import ConduitSyncToolbar from "./ConduitSyncToolbar.svelte";
	import TaskCreateToolbar from "./TaskCreateToolbar.svelte";

	export let plugin: FulcrumHost;
</script>

<div class="fulcrum-task-toolbar-actions">
	<TaskCreateToolbar {plugin} />
	<ConduitSyncToolbar {plugin} />
</div>

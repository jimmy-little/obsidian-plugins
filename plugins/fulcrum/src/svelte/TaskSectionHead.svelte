<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import TaskToolbarActions from "./TaskToolbarActions.svelte";

	export let title: string;
	export let plugin: FulcrumHost;
</script>

<div class="fulcrum-section-head">
	<h2 class="fulcrum-section-head__title">{title}</h2>
	<div class="fulcrum-section-head__actions">
		<TaskToolbarActions {plugin} />
	</div>
</div>

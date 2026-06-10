<script lang="ts">
	import type {FulcrumHost} from "../../fulcrum/pluginBridge";
	import AreaFilterPanel from "../AreaFilterPanel.svelte";

	export let plugin: FulcrumHost;
</script>

<aside class="fulcrum-global-filter-strip" aria-label="Global area filter">
	<AreaFilterPanel {plugin} variant="sidebar-footer" />
</aside>

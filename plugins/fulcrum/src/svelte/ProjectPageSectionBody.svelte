<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";

	export let plugin: FulcrumHost;
	export let sourcePath: string;
	export let markdown: string;
	export let accentColorCss: string | undefined = undefined;

	let host: HTMLElement | undefined;
	let renderChain: Promise<void> = Promise.resolve();

	$: if (host && markdown.trim()) {
		const el = host;
		const md = markdown;
		const path = sourcePath;
		renderChain = renderChain.then(async () => {
			if (!el.isConnected) return;
			el.empty();
			await plugin.renderActivityBodyPreview(el, path, md);
		});
	} else if (host) {
		host.empty();
	}
</script>

<div
	bind:this={host}
	class="fulcrum-activity-row__preview markdown-preview-view fulcrum-project-page-section__body"
	style={accentColorCss ? `--fulcrum-preview-accent: ${accentColorCss}` : undefined}
></div>

<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";

	export let plugin: FulcrumHost;
	export let sourcePath: string;
	export let markdown: string;

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
	class="markdown-preview-view fulcrum-project-page-section__body"
></div>

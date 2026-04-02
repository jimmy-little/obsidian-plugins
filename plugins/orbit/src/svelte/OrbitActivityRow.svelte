<script lang="ts">
	import type {OrbitHost} from "../orbit/pluginHost";
	import type {InteractionEntry} from "../orbit/interactions";
	import {leadingTimelineEmojiFromType} from "../orbit/activityDisplay";

	export let plugin: OrbitHost;
	export let row: InteractionEntry;
	export let bodyPreview: string | undefined = undefined;
	export let whenLabel: string;

	let previewHost: HTMLElement | undefined;
	let previewRenderChain: Promise<void> = Promise.resolve();

	$: timelineEmoji = leadingTimelineEmojiFromType(row.typeRaw);

	function openFile(): void {
		void plugin.app.workspace.getLeaf("tab").openFile(row.file);
	}

	function onRowKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		openFile();
	}

	$: if (previewHost && bodyPreview && row.file.path) {
		const host = previewHost;
		const path = row.file.path;
		const md = bodyPreview;
		previewRenderChain = previewRenderChain.then(async () => {
			if (!host.isConnected) return;
			host.empty();
			await plugin.renderActivityPreview(host, path, md);
		});
	}
</script>

<div
	class="orbit-activity-row"
	data-orbit-activity-kind={row.kind}
	role="button"
	tabindex="0"
	on:click={openFile}
	on:keydown={onRowKeydown}
>
	<div class="orbit-activity-timeline__track" aria-hidden="true">
		<div class="orbit-activity-timeline__stem orbit-activity-timeline__stem--before"></div>
		<div
			class="orbit-activity-timeline__node"
			class:orbit-activity-timeline__node--emoji={!!timelineEmoji}
		>
			{#if timelineEmoji}
				<span class="orbit-activity-timeline__emoji">{timelineEmoji}</span>
			{:else if row.kind === "meeting"}
				<svg class="orbit-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
					<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
				</svg>
			{:else if row.kind === "call"}
				<svg class="orbit-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M22 16.92v2.5a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.63A2 2 0 0 1 7.11 3h2.5a2 2 0 0 1 2 1.72c.12.9.33 1.77.64 2.6a2 2 0 0 1-.45 2.11L12.1 10.9a16 16 0 0 0 6 6l1.47-1.09a2 2 0 0 1 2.11-.45c.83.31 1.7.52 2.6.64A2 2 0 0 1 22 16.92Z"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
				</svg>
			{:else if row.kind === "quick"}
				<svg class="orbit-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{:else}
				<svg class="orbit-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
					<path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="2" />
					<path d="M8 13h8M8 17h8M8 9h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			{/if}
		</div>
		<div class="orbit-activity-timeline__stem orbit-activity-timeline__stem--after"></div>
	</div>
	<div class="orbit-activity-row__body">
		<div class="orbit-activity-row__title">{row.title}</div>
		<span class="orbit-activity-row__when orbit-muted">{whenLabel}</span>
		{#if row.kind === "quick" && row.quickBody}
			<p class="orbit-activity-row__quick">{row.quickBody}</p>
		{/if}
		{#if bodyPreview}
			<div class="orbit-activity-row__preview" bind:this={previewHost}></div>
		{/if}
	</div>
</div>

<style>
	/* Match Fulcrum timeline row: grid track + full-height stems so the node centers vertically. */
	.orbit-activity-row {
		display: grid;
		grid-template-columns: 2.65rem minmax(0, 1fr);
		gap: 0 0.55rem;
		align-items: stretch;
		width: 100%;
		box-sizing: border-box;
		padding: 0 0.35rem 0 0.1rem;
		cursor: pointer;
		border-radius: 0;
		background: transparent;
		font: inherit;
		color: var(--text-normal);
	}
	.orbit-activity-row:hover {
		background: color-mix(in srgb, var(--background-modifier-hover) 55%, transparent);
	}
	.orbit-activity-row:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}
	.orbit-activity-timeline__track {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: stretch;
		width: 100%;
		min-height: 100%;
		box-sizing: border-box;
		color: var(--text-muted);
	}
	.orbit-activity-timeline__stem {
		flex: 1 1 0;
		width: 2px;
		min-height: 0.35rem;
		background: var(--background-modifier-border);
	}
	.orbit-activity-timeline__node {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 50%;
		border: 2px solid var(--background-modifier-border);
		background: var(--background-primary);
		color: var(--text-muted);
		box-sizing: border-box;
		z-index: 1;
	}
	.orbit-activity-row:hover .orbit-activity-timeline__node {
		border-color: color-mix(in srgb, var(--interactive-accent) 35%, var(--background-modifier-border));
		color: var(--text-accent);
	}
	.orbit-activity-timeline__node--emoji {
		background: color-mix(in srgb, var(--background-secondary) 38%, var(--background-primary));
	}
	.orbit-activity-timeline__icon {
		display: block;
		width: 0.92rem;
		height: 0.92rem;
	}
	.orbit-activity-timeline__emoji {
		font-size: 1rem;
		line-height: 1;
	}
	.orbit-activity-row__body {
		min-width: 0;
		padding: 0.55rem 0 0.6rem;
	}
	.orbit-activity-row__title {
		font-weight: 600;
		font-size: var(--font-ui-small);
		color: var(--text-normal);
		word-break: break-word;
	}
	.orbit-activity-row__when {
		display: block;
		margin-top: 0.15rem;
		font-size: calc(var(--font-ui-smaller) - 1px);
	}
	.orbit-activity-row__quick {
		margin: 0.35rem 0 0;
		font-size: var(--font-ui-small);
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--text-normal);
	}
	.orbit-activity-row__preview {
		margin-top: 0.45rem;
		padding: 0.45rem 0.5rem;
		border-radius: var(--radius-s, 6px);
		border: 1px solid var(--background-modifier-border);
		background: color-mix(in srgb, var(--background-secondary) 55%, var(--background-primary));
		font-size: calc(var(--font-ui-smaller));
		line-height: 1.45;
		max-height: 12rem;
		overflow: auto;
	}
	.orbit-activity-row__preview :global(p) {
		margin: 0.25rem 0;
	}
	.orbit-activity-row__preview :global(p:first-child) {
		margin-top: 0;
	}
	.orbit-activity-row__preview :global(p:last-child) {
		margin-bottom: 0;
	}
</style>

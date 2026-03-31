<script lang="ts">
	import type {WorkspaceLeaf} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {ActivityChip} from "../fulcrum/utils/projectActivity";

	export let title: string;
	export let chips: ActivityChip[] = [];
	export let kind: "note" | "task" | "log" | "meeting";
	export let whenClick: () => void;
	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let hoverPath: string | undefined = undefined;
	export let variant: "default" | "timeline" | "icon" = "default";
	/** Optional CSS color for timeline node/stem (e.g. project color in aggregated feed). */
	export let accentColorCss: string | undefined = undefined;
	/** When set on a note row, replaces the file icon inside the timeline circle. */
	export let timelineEmoji: string | undefined = undefined;

	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

	function onHover(ev: MouseEvent): void {
		if (!hoverPath || !hoverParentLeaf) return;
		const delay = plugin.settings.hoverPreviewDelayMs ?? 0;
		if (delay <= 0) {
			plugin.triggerFulcrumHoverLink(
				ev,
				hoverParentLeaf,
				ev.currentTarget as HTMLElement,
				hoverPath,
			);
			return;
		}
		hoverTimeout = window.setTimeout(() => {
			hoverTimeout = null;
			plugin.triggerFulcrumHoverLink(
				ev,
				hoverParentLeaf,
				ev.currentTarget as HTMLElement,
				hoverPath,
			);
		}, delay);
	}

	function onHoverCancel(): void {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
	}

	function onRowKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		whenClick();
	}
</script>

<div
	role="button"
	tabindex="0"
	class="fulcrum-activity-row"
	class:fulcrum-activity-row--timeline={variant === "timeline"}
	class:fulcrum-activity-row--icon={variant === "icon"}
	data-fulcrum-activity-kind={kind}
	on:click={whenClick}
	on:keydown={onRowKeydown}
	on:mouseenter={onHover}
	on:mouseleave={onHoverCancel}
>
	{#if variant === "timeline" || variant === "icon"}
		<div
			class="fulcrum-activity-timeline__track"
			class:fulcrum-activity-timeline__track--icon-only={variant === "icon"}
			class:fulcrum-activity-timeline__track--accent={!!accentColorCss}
			aria-hidden="true"
			style={accentColorCss ? `--fulcrum-row-accent: ${accentColorCss};` : undefined}
		>
			<div class="fulcrum-activity-timeline__stem fulcrum-activity-timeline__stem--before"></div>
			<div
				class="fulcrum-activity-timeline__node"
				class:fulcrum-activity-timeline__node--emoji={kind === "note" && !!timelineEmoji}
			>
				{#if kind === "task"}
					<svg class="fulcrum-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M20 6 9 17l-5-5"
							fill="none"
							stroke="currentColor"
							stroke-width="2.25"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{:else if kind === "meeting"}
					<svg class="fulcrum-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
						<rect
							x="3"
							y="4"
							width="18"
							height="18"
							rx="2"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						/>
						<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
					</svg>
				{:else if kind === "log"}
					<svg class="fulcrum-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
						<rect
							x="3"
							y="4"
							width="12"
							height="16"
							rx="2"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						/>
						<path d="M6 9h6M6 13h6M6 17h5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
						<path
							d="m16 3 5 5-7 7H9v-4l7-7Z"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
						/>
					</svg>
				{:else if kind === "note" && timelineEmoji}
					<span class="fulcrum-activity-timeline__emoji" aria-hidden="true">{timelineEmoji}</span>
				{:else}
					<svg class="fulcrum-activity-timeline__icon" viewBox="0 0 24 24" aria-hidden="true">
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
			<div class="fulcrum-activity-timeline__stem fulcrum-activity-timeline__stem--after"></div>
		</div>
	{/if}
	<div class="fulcrum-activity-row__body">
		<div class="fulcrum-activity-row__title">{title}</div>
		{#if chips.length > 0}
			<div class="fulcrum-activity-row__meta">
				{#each chips as c}
					{#if c.kind === "date"}
						<span class="fulcrum-activity-chip fulcrum-activity-chip--date">
							<svg class="fulcrum-activity-chip__icon" viewBox="0 0 24 24" aria-hidden="true">
								<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
								<path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" />
							</svg>
							{c.label}
						</span>
					{:else if c.kind === "type"}
						<span class="fulcrum-activity-chip fulcrum-activity-chip--type">{c.label}</span>
					{:else if c.kind === "tag"}
						<span class="fulcrum-activity-chip fulcrum-activity-chip--tag" data-tag-value={c.label.replace(/^#/, "")}>{c.label}</span>
					{:else if c.kind === "tracked"}
						<span class="fulcrum-activity-chip fulcrum-activity-chip--tracked">
							<svg class="fulcrum-activity-chip__icon" viewBox="0 0 24 24" aria-hidden="true">
								<path d="M5 3h14M6 3v3a7 7 0 0 0 6 6.92A7 7 0 0 0 18 6V3M6 21v-3a7 7 0 0 1 6-6.92A7 7 0 0 1 18 18v3M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							{c.label}
						</span>
					{:else if c.kind === "status"}
						<span class="fulcrum-activity-chip fulcrum-activity-chip--status">{c.label}</span>
					{:else if c.kind === "project"}
						<span class="fulcrum-activity-chip fulcrum-activity-chip--project">{c.label}</span>
					{:else}
						<span class="fulcrum-activity-chip">{c.label}</span>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

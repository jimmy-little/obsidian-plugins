<script lang="ts">
	export let open = false;
	export let sections: {
		title: string;
		options: { key: string; label: string }[];
		isChecked: (key: string) => boolean;
		onToggle: (key: string) => void | Promise<void>;
	}[] = [];
	export let panelClass = "";
</script>

{#if open}
	<div
		class="fulcrum-project-list-panel__filter-panel {panelClass}"
		role="menu"
		aria-label="Filter options"
	>
		{#each sections as section}
			<div class="fulcrum-project-list-panel__filter-section">
				<div class="fulcrum-project-list-panel__filter-section-title">{section.title}</div>
				{#each section.options as opt (opt.key)}
					<label class="fulcrum-project-list-panel__filter-check">
						<input
							type="checkbox"
							checked={section.isChecked(opt.key)}
							on:change={() => void section.onToggle(opt.key)}
						/>
						<span>{opt.label}</span>
					</label>
				{/each}
			</div>
		{/each}
	</div>
{/if}

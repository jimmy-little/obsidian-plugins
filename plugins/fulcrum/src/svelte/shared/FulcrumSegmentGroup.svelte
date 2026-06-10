<script lang="ts">
	export type SegmentOption = {
		id: string;
		label: string;
	};

	export let options: SegmentOption[] = [];
	export let value: string;
	export let ariaLabel = "";
	export let role: "tablist" | "group" = "group";
	export let multi = false;
	export let wrapperClass = "";
	export let buttonClass = "";
	/** Suffix for active state class, e.g. `active` → `btn--active`, or `on` → `preset--on`. */
	export let activeModifier = "active";
	export let onSelect: (id: string) => void;

	function buttonClasses(optId: string): string {
		const base = buttonClass || "fulcrum-segment-group__btn";
		if (value !== optId) return base;
		if (buttonClass && activeModifier) return `${base} ${base}--${activeModifier}`;
		return `${base} fulcrum-segment-group__btn--active`;
	}
</script>

<div
	class="fulcrum-segment-group {wrapperClass}"
	role={role}
	aria-label={ariaLabel}
>
	{#each options as opt (opt.id)}
		<button
			type="button"
			role={role === "tablist" ? "tab" : undefined}
			class={buttonClasses(opt.id)}
			aria-selected={role === "tablist" ? value === opt.id : undefined}
			aria-pressed={role === "group" ? value === opt.id : undefined}
			on:click={() => onSelect(opt.id)}
		>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.fulcrum-segment-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
</style>

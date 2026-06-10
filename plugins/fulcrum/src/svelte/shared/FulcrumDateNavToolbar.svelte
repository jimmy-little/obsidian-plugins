<script lang="ts">
	export let title = "";
	export let onPrev: () => void;
	export let onNext: () => void;
	export let onToday: (() => void) | undefined = undefined;
	export let todayLabel = "Today";
	export let showToday = true;
	/** `label` = text button; `dot` = • button (e.g. dashboard week grid). */
	export let todayVariant: "label" | "dot" = "label";
	export let prevAriaLabel = "Previous";
	export let nextAriaLabel = "Next";
	export let todayAriaLabel = "Today";
	export let todayTitle = "Today";
	export let className = "";
	export let titleClass = "";
</script>

<div
	class="fulcrum-date-nav fulcrum-calendar__toolbar {className}"
	role="toolbar"
	aria-label="Date navigation"
>
	<slot name="leading" />
	<button type="button" class="fulcrum-calendar__nav-btn fulcrum-date-nav__prev" aria-label={prevAriaLabel} on:click={onPrev}>
		‹
	</button>
	<button type="button" class="fulcrum-calendar__nav-btn fulcrum-date-nav__next" aria-label={nextAriaLabel} on:click={onNext}>
		›
	</button>
	{#if title}
		<h2 class="fulcrum-calendar__title fulcrum-date-nav__title {titleClass}">{title}</h2>
	{/if}
	{#if showToday && onToday}
		{#if todayVariant === "dot"}
			<button
				type="button"
				class="fulcrum-dashboard-meetings-nav__btn fulcrum-dashboard-meetings-nav__btn--dot fulcrum-date-nav__today-dot"
				on:click={onToday}
				aria-label={todayAriaLabel}
				title={todayTitle}
			>
				•
			</button>
		{:else}
			<button type="button" class="fulcrum-calendar__today fulcrum-date-nav__today" on:click={onToday}>
				{todayLabel}
			</button>
		{/if}
	{/if}
	<slot name="trailing" />
</div>

<script lang="ts">
	import {setIcon} from "obsidian";

	export let href: string;
	export let label = "OmniFocus";
	export let icon = "list-checks";
	export let title: string | undefined = undefined;

	function bindIcon(el: HTMLElement, name: string) {
		setIcon(el, name);
		return {
			update(next: string) {
				el.empty();
				setIcon(el, next);
			},
			destroy() {
				el.empty();
			},
		};
	}
</script>

<a
	{href}
	target="_blank"
	rel="noopener noreferrer"
	class="fulcrum-project-related-pill"
	title={title ?? label}
>
	<span class="fulcrum-project-related-pill__icon" use:bindIcon={icon} aria-hidden="true"></span>
	<span class="fulcrum-project-related-pill__label">{label}</span>
</a>

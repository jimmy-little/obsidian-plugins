<script lang="ts">
	import {setIcon} from "obsidian";

	export let href: string;
	export let label = "OmniFocus";
	export let title: string | undefined = undefined;

	function bindIcon(el: HTMLElement) {
		setIcon(el, "list-checks");
		return {
			update() {
				el.empty();
				setIcon(el, "list-checks");
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
	<span class="fulcrum-project-related-pill__icon" use:bindIcon aria-hidden="true"></span>
	<span class="fulcrum-project-related-pill__label">{label}</span>
</a>

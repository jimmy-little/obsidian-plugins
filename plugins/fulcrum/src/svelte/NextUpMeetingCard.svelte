<script lang="ts">
	import type {IndexedMeeting} from "../fulcrum/types";
	import {formatNextUpMeetingWhen} from "../fulcrum/utils/projectActivity";

	export let meeting: IndexedMeeting;
	export let onOpen: (path: string) => void;

	$: title = meeting.title?.trim() || meeting.file.basename.replace(/\.md$/i, "");
	$: whenLine = formatNextUpMeetingWhen(meeting);

	function activate(): void {
		onOpen(meeting.file.path);
	}

	function onKeydown(ev: KeyboardEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		activate();
	}
</script>

<div
	role="button"
	tabindex="0"
	class="fulcrum-next-up-meeting-card"
	on:click={activate}
	on:keydown={onKeydown}
>
	<div class="fulcrum-next-up-meeting-card__icon" aria-hidden="true">
		<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
			<line x1="16" x2="16" y1="2" y2="6"/>
			<line x1="8" x2="8" y1="2" y2="6"/>
			<line x1="3" x2="21" y1="10" y2="10"/>
		</svg>
	</div>
	<div class="fulcrum-next-up-meeting-card__body">
		<div class="fulcrum-next-up-meeting-card__title">{title}</div>
		{#if whenLine}
			<div class="fulcrum-next-up-meeting-card__when">{whenLine}</div>
		{/if}
	</div>
</div>

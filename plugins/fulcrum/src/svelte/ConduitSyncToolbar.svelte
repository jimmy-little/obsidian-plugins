<script lang="ts">
	import {Platform, setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {
		conduitSyncProgress,
		formatConduitStatusBarText,
		formatConduitToolbarBadge,
	} from "../conduit/syncProgress";

	export let plugin: FulcrumHost;

	let syncBtn: HTMLButtonElement | null = null;
	let pullBtn: HTMLButtonElement | null = null;
	let pushBtn: HTMLButtonElement | null = null;

	$: visible = Platform.isMacOS && plugin.conduitCanSync();
	$: progress = $conduitSyncProgress;
	$: busy = progress.active;
	$: badge = busy ? formatConduitToolbarBadge(progress) : "";
	$: badgeTitle = busy ? formatConduitStatusBarText(progress) : "";

	$: if (syncBtn) setIcon(syncBtn, "refresh-cw");
	$: if (pullBtn) setIcon(pullBtn, "download");
	$: if (pushBtn) setIcon(pushBtn, "upload");
</script>

{#if visible}
	<div
		class="fulcrum-conduit-toolbar"
		class:fulcrum-conduit-toolbar--busy={busy}
		role="toolbar"
		aria-label="Reminders sync"
	>
		<button
			type="button"
			class="fulcrum-conduit-toolbar__btn clickable-icon"
			class:fulcrum-conduit-toolbar__btn--active={busy && progress.activeAction === "sync"}
			title="Sync now (pull and push)"
			aria-label="Sync now (pull and push)"
			disabled={busy}
			aria-busy={busy && progress.activeAction === "sync"}
			bind:this={syncBtn}
			on:click={() => plugin.conduitRunAction("sync")}
		></button>
		<button
			type="button"
			class="fulcrum-conduit-toolbar__btn clickable-icon"
			class:fulcrum-conduit-toolbar__btn--active={busy && progress.activeAction === "pull"}
			title="Pull from Reminders"
			aria-label="Pull from Reminders"
			disabled={busy}
			aria-busy={busy && progress.activeAction === "pull"}
			bind:this={pullBtn}
			on:click={() => plugin.conduitRunAction("pull")}
		></button>
		<button
			type="button"
			class="fulcrum-conduit-toolbar__btn clickable-icon"
			class:fulcrum-conduit-toolbar__btn--active={busy && progress.activeAction === "push"}
			title="Push to Reminders"
			aria-label="Push to Reminders"
			disabled={busy}
			aria-busy={busy && progress.activeAction === "push"}
			bind:this={pushBtn}
			on:click={() => plugin.conduitRunAction("push")}
		></button>
		{#if busy && badge}
			<span
				class="fulcrum-conduit-toolbar__badge"
				title={badgeTitle}
				aria-live="polite"
			>{badge}</span>
		{/if}
	</div>
{/if}

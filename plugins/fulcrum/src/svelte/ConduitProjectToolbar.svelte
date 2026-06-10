<script lang="ts">
	import {Platform, setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {indexRevision} from "../fulcrum/stores";
	import {
		conduitSyncProgress,
		formatConduitStatusBarText,
		formatConduitToolbarBadge,
	} from "../conduit/syncProgress";

	export let plugin: FulcrumHost;
	export let projectPath: string;

	let tasksIconEl: HTMLElement | null = null;
	let syncBtn: HTMLButtonElement | null = null;
	let pullBtn: HTMLButtonElement | null = null;
	let pushBtn: HTMLButtonElement | null = null;

	$: visible =
		(void $indexRevision,
		Platform.isMacOS && plugin.conduitCanSync() && plugin.conduitIsProjectSyncEnabled(projectPath));
	$: progress = $conduitSyncProgress;
	$: busy = progress.active;
	$: badge = busy ? formatConduitToolbarBadge(progress) : "";
	$: badgeTitle = busy ? formatConduitStatusBarText(progress) : "";

	$: if (tasksIconEl) setIcon(tasksIconEl, "list-checks");
	$: if (syncBtn) setIcon(syncBtn, "refresh-cw");
	$: if (pullBtn) setIcon(pullBtn, "download");
	$: if (pushBtn) setIcon(pushBtn, "upload");

	function run(action: "sync" | "pull" | "push"): void {
		plugin.conduitRunProjectAction(projectPath, action);
	}
</script>

{#if visible}
	<div
		class="fulcrum-conduit-toolbar fulcrum-conduit-toolbar--project"
		class:fulcrum-conduit-toolbar--busy={busy}
		role="toolbar"
		aria-label="Project task Reminders sync"
	>
		<span
			class="fulcrum-conduit-toolbar__tasks-icon"
			bind:this={tasksIconEl}
			aria-hidden="true"
			title="Task sync"
		></span>
		<button
			type="button"
			class="fulcrum-conduit-toolbar__btn clickable-icon"
			class:fulcrum-conduit-toolbar__btn--active={busy && progress.activeAction === "sync"}
			title="Sync this project (pull and push)"
			aria-label="Sync this project"
			disabled={busy}
			bind:this={syncBtn}
			on:click={() => run("sync")}
		></button>
		<button
			type="button"
			class="fulcrum-conduit-toolbar__btn clickable-icon"
			class:fulcrum-conduit-toolbar__btn--active={busy && progress.activeAction === "pull"}
			title="Pull this project from Reminders"
			aria-label="Pull this project from Reminders"
			disabled={busy}
			bind:this={pullBtn}
			on:click={() => run("pull")}
		></button>
		<button
			type="button"
			class="fulcrum-conduit-toolbar__btn clickable-icon"
			class:fulcrum-conduit-toolbar__btn--active={busy && progress.activeAction === "push"}
			title="Push this project to Reminders"
			aria-label="Push this project to Reminders"
			disabled={busy}
			bind:this={pushBtn}
			on:click={() => run("push")}
		></button>
		{#if busy && badge}
			<span class="fulcrum-conduit-toolbar__badge" title={badgeTitle} aria-live="polite">{badge}</span>
		{/if}
	</div>
{/if}

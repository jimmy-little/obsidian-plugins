import { TFile } from "obsidian";
import type ReposePlugin from "../main";
import { pathUnderMediaRoot } from "../platform";

/** Subscribe to vault/metadata changes and bump a Svelte counter; returns cleanup for onDestroy. */
export function bindVaultRefresh(
	plugin: ReposePlugin,
	bump: () => void,
	options?: { debounceMs?: number; mediaRootOnly?: boolean },
): () => void {
	const debounceMs = options?.debounceMs ?? 120;
	const mediaRootOnly = options?.mediaRootOnly !== false;
	let timer: number | undefined;

	function schedule(): void {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = undefined;
			bump();
		}, debounceMs);
	}

	function onFile(f: TFile): void {
		if (mediaRootOnly && !pathUnderMediaRoot(f.path, plugin.settings.mediaRoot)) return;
		schedule();
	}

	const mdRef = plugin.app.metadataCache.on("changed", (f) => {
		if (f instanceof TFile) onFile(f);
	});
	const createRef = plugin.app.vault.on("create", (f) => {
		if (f instanceof TFile) onFile(f);
	});
	const deleteRef = plugin.app.vault.on("delete", (f) => {
		if (f instanceof TFile) onFile(f);
	});
	const renameRef = plugin.app.vault.on("rename", (f) => {
		if (f instanceof TFile) onFile(f);
	});

	return () => {
		window.clearTimeout(timer);
		plugin.app.metadataCache.offref(mdRef);
		plugin.app.vault.offref(createRef);
		plugin.app.vault.offref(deleteRef);
		plugin.app.vault.offref(renameRef);
	};
}

import {TFile, type Vault} from "obsidian";
import {buildMultilineFeedPreview} from "@obsidian-suite/note-preview";
import type {InteractionKind} from "./interactions";

export type OrbitPreviewRowInput = {
	kind: InteractionKind;
	path: string;
	title: string;
};

const PREVIEW_KINDS = new Set<InteractionKind>(["meeting", "note", "call"]);

/**
 * Multi-line body previews for person activity (suite-shared preview builder; same as Fulcrum/Lapse feeds).
 */
export async function loadOrbitActivityPreviews(
	vault: Vault,
	rows: OrbitPreviewRowInput[],
	entryFieldKey: string,
	maxLines = 10,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	await Promise.all(
		rows.map(async (r) => {
			if (!PREVIEW_KINDS.has(r.kind)) return;
			const f = vault.getAbstractFileByPath(r.path);
			if (!(f instanceof TFile)) return;
			try {
				const raw = await vault.cachedRead(f);
				const text = buildMultilineFeedPreview(raw, {
					maxLines,
					entryFieldKey,
					displayTitle: r.title,
				});
				if (text) out[r.path] = text;
			} catch {
				/* unreadable */
			}
		}),
	);
	return out;
}

import {TFile, type Vault} from "obsidian";
import {buildMultilineFeedPreview} from "@obsidian-suite/note-preview";

export type ActivityPreviewRowInput = {
	kind: string;
	title: string;
	hoverPath?: string;
};

const PREVIEW_KINDS = new Set(["note", "meeting"]);

/**
 * Load multi-line body previews for timeline rows that point at markdown files.
 * Uses {@link buildMultilineFeedPreview} (suite-shared); safe to call from any plugin with a Vault.
 */
export async function loadActivityFeedPreviews(
	vault: Vault,
	rows: ActivityPreviewRowInput[],
	entryFieldKey: string,
	maxLines = 10,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	await Promise.all(
		rows.map(async (r) => {
			if (!r.hoverPath || !PREVIEW_KINDS.has(r.kind)) return;
			const f = vault.getAbstractFileByPath(r.hoverPath);
			if (!(f instanceof TFile)) return;
			try {
				const raw = await vault.cachedRead(f);
				const text = buildMultilineFeedPreview(raw, {
					maxLines,
					entryFieldKey,
					displayTitle: r.title,
				});
				if (text) out[r.hoverPath] = text;
			} catch {
				/* unreadable / binary */
			}
		}),
	);
	return out;
}

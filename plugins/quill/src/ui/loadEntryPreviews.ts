import { TFile, type Vault } from "obsidian";
import { buildMultilineFeedPreview } from "@obsidian-suite/note-preview";
import { journalEntryKey, type JournalEntry } from "../journal";

const PREVIEW_BATCH = 24;

/** Load markdown body previews for journal entries (Fulcrum Activity pattern). */
export async function loadJournalEntryPreviews(
	vault: Vault,
	entries: JournalEntry[],
	entryFieldKey: string,
	maxLines: number,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (let i = 0; i < entries.length; i += PREVIEW_BATCH) {
		const batch = entries.slice(i, i + PREVIEW_BATCH);
		await Promise.all(
			batch.map(async (entry) => {
				const key = journalEntryKey(entry);
				// Log bullets: metadata chips only, no body preview of the raw line.
				if (entry.fromLogFile) return;
				const path = entry.file.path;
				const f = vault.getAbstractFileByPath(path);
				if (!(f instanceof TFile)) return;
				try {
					const raw = await vault.cachedRead(f);
					const text = buildMultilineFeedPreview(raw, {
						maxLines,
						entryFieldKey,
						displayTitle: entry.name,
					});
					if (text) out[key] = text;
				} catch {
					/* unreadable */
				}
			}),
		);
	}
	return out;
}

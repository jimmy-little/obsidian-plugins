import { Menu, type TFile } from "obsidian";
import type ReposePlugin from "../main";
import { EpisodeWatchDateModal } from "../modals/EpisodeWatchDateModal";
import { isEffectivelyWatchedFromFrontmatter } from "../media/mediaModel";
import {
	defaultCustomWatchDate,
	markEpisodeUnwatched,
	markEpisodeWatched,
	markEpisodeWatchedOnCalendarDate,
} from "../vault/watchState";

export function openEpisodeWatchMenu(
	plugin: ReposePlugin,
	file: TFile,
	ev: MouseEvent,
	onComplete?: () => void,
): void {
	const fm = (plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	if (isEffectivelyWatchedFromFrontmatter(fm)) {
		void markEpisodeUnwatched(plugin, file).then(onComplete);
		return;
	}

	const menu = new Menu();
	menu.addItem((item) =>
		item
			.setTitle("Watch on Airdate")
			.setIcon("calendar")
			.onClick(() => {
				void markEpisodeWatched(plugin, file, "airdate").then(onComplete);
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle("Watch Now")
			.setIcon("clock")
			.onClick(() => {
				void markEpisodeWatched(plugin, file, "now").then(onComplete);
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle("Watch on a Date")
			.setIcon("calendar-days")
			.onClick(() => {
				new EpisodeWatchDateModal(plugin.app, defaultCustomWatchDate(fm), async (date) => {
					await markEpisodeWatchedOnCalendarDate(plugin, file, date);
					onComplete?.();
				}).open();
			}),
	);
	menu.showAtMouseEvent(ev);
}

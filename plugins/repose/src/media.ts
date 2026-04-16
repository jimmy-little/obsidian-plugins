export type MediaKind = "show" | "movie" | "book" | "podcast" | "game";

export const MEDIA_KINDS: MediaKind[] = ["show", "movie", "book", "podcast", "game"];

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
	show: "Show",
	movie: "Movie",
	book: "Book",
	podcast: "Podcast",
	game: "Game",
};

/** Lucide icon names (Obsidian setIcon). Prefer widely bundled names (avoid missing glyphs). */
export const MEDIA_KIND_ICON: Record<MediaKind, string> = {
	show: "tv",
	movie: "clapperboard",
	book: "book-open",
	podcast: "podcast",
	game: "gamepad",
};

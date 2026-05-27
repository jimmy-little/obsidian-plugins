# Quill

A **Day One–style journal** inside Obsidian: point it at a folder of notes and browse by **Summary**, **List**, or **Calendar**. Mobile-friendly and dark-mode aware.

**Formerly Day Won** — this plugin is the monorepo home for the former standalone [obsidian-day-won](https://github.com/jimmy-little/obsidian-day-won) repo. Plugin id is `quill` (clean rename from `day-won`).

## Features

- **Folder of notes** — In settings, choose vault folder(s). Each note with a `date` (and optional `time`) in frontmatter becomes a journal entry.
- **Views** — **Summary** (streak, entry count, days, “on this day”), **List** (Fulcrum-style activity timeline grouped by day), **Calendar** (month grid with image thumbnails).
- **Day view** — Activity timeline with markdown body previews (same formatting as Fulcrum project Activity).
- **First image as calendar background** — The first image in a note is used as that day’s calendar thumbnail.
- **Multiple notes per day** — All notes with the same date appear together; opening a calendar day shows every entry for that day.
- **New entry** — Create notes from the `+` button with optional image attachments.
- **Mobile and dark mode** — Layout and colors work on small screens and follow Obsidian’s light/dark theme.

## Commands

- **Open Quill journal** — opens the main journal view (feather ribbon icon).

## Build / install

From monorepo root:

```bash
npm run build -w obsidian-plugin-quill
npm run build:install -w obsidian-plugin-quill
```

## Migration from Day Won

If you had the standalone **Day Won** plugin installed:

1. Disable and remove `.obsidian/plugins/day-won/` from your vault.
2. Install **Quill** from this monorepo (`plugins/quill` via BRAT or `build:install`).
3. Reconfigure settings in **Settings → Quill** (or copy `data.json` from the old folder to `.obsidian/plugins/quill/data.json` manually).

Plugin id, view types, and CSS classes are all renamed to `quill`.

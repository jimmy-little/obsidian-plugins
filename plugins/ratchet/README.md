# Ratchet

Track habits and counts with a dashboard, vault-stored event logs, and markdown embeds.

**Data** lives under **Settings → Data folder** (default `.ratchet/`): `config.json` plus `events/*.jsonl`.

## Commands

- **Open Ratchet** — main view (tracker cards, create/edit).
- **Create new tracker** — opens the main view with the new-tracker form.

## Markdown code blocks

- `ratchet-counter` — interactive counter; `tracker: id` (comma-separated for multiple cards).
- `ratchet-heatmap` — contribution-style grid; `tracker: id`, optional `days:` / `period:`.
- `ratchet-summary` — card + heatmap; same params as heatmap.

## URL schemes (Obsidian URI)

**Plugin id (URI host):** `ratchet`.

```text
obsidian://ratchet
obsidian://ratchet?screen=main
```

Conceptual route: `/ratchet/main`. See **Settings → Ratchet** for the same reference.

## Migration from `obsidian-ratchet`

This plugin is the monorepo home for the former standalone repo. **Plugin id and view type are unchanged** (`ratchet`, `ratchet-main-view`), so existing URIs and vault data keep working.

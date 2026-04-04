# Fulcrum

Project management views for Obsidian (Project Manager shell, timeline, tasks, reviews).

## URL schemes (Obsidian URI)

Use the [Obsidian URI](https://docs.obsidian.md/Advanced+topics/Using+obsidian+URI) format where the **host** is the plugin id (`fulcrum`). Query parameters carry `screen`, `route`, `projectPath`, `focalDate`, etc. Do **not** use `action=open` in the query—that targets the core “open” action, not Fulcrum.

- With several vaults open, Obsidian uses the **focused** vault unless you launch via `obsidian://open?vault=VAULT_NAME&…`.

**Pattern:** `obsidian://fulcrum?screen=<name>&…`

| Conceptual route | Query |
|------------------|--------|
| `/fulcrum/dashboard` | `screen=dashboard` |
| `/fulcrum/areas` | `screen=areas` |
| `/fulcrum/kanban` | `screen=kanban` |
| `/fulcrum/calendar` | `screen=calendar` |
| `/fulcrum/time` | `screen=time` or `screen=time-tracked` |
| `/fulcrum/timeline` | `screen=timeline` — optional `focalDate=YYYY-MM-DD` |
| `/fulcrum/project` | `screen=project&projectPath=<vault-path-encoded>` |
| `/fulcrum/classic` | `screen=classic` (standalone dashboard leaf) |

**Alternate:** `route=%2Ffulcrum%2Fdashboard` (URL-encoded `/fulcrum/dashboard`) instead of `screen`.

Full examples are listed in **Settings → Fulcrum → URL schemes**.

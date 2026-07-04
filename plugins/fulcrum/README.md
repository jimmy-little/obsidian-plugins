# Fulcrum

Project management views for Obsidian (Project Manager shell, timeline, tasks, reviews).

## Tasks (Fulcrum-native)

Fulcrum indexes **task notes** (YAML frontmatter compatible with [TaskNotes](https://tasknotes.dev/)) and **inline checkbox** tasks tagged in your vault (e.g. `#Tasks`).

- **Create task notes** from project pages without the TaskNotes plugin — Fulcrum writes TaskNotes-compatible frontmatter.
- **Right-click any task card** for status, priority, due/scheduled, reminders, recurrence, project, note actions, and subtasks.
- **Recurring tasks** use RFC 5545 RRULE in frontmatter (`recurrence`, `complete_instances`, `recurrence_anchor`).
- **Inline tasks** with your configured include tag appear in Fulcrum with distinct card styling.

## Reminders bridge (macOS)

Fulcrum shows **live** Apple Reminders in notes and supports **one-way convert** actions. Tasks live in Obsidian **or** Reminders — never mirrored copies.

Enable under **Settings → Fulcrum → Integrations → Reminders bridge**.

### Setup

**Option A — Fulcrum Bridge app (recommended)**

1. Build and run [`plugins/fulcrum-bridge`](../fulcrum-bridge/README.md) (`swift build -c release`).
2. Grant Reminders and Calendar access.
3. Set bridge URL to `http://127.0.0.1:9247` in Fulcrum settings.

**Option B — remctl fallback**

1. Install [remctl](https://github.com/viticci/remctl).
2. Run `remctl onboard` and grant permissions to Obsidian (or set remctl path in settings).
3. Fulcrum uses remctl when the HTTP bridge is unreachable.

### Query blocks

````markdown
```fulcrum-reminders
due: today
tags include: #do-this
list: Shopping
completed: false
```
````

Checkboxes complete/reopen the Apple Reminder directly. Right-click a row for **Create task note** (deletes the Reminder, creates a vault task note).

### Convert actions

| Source | Action |
|--------|--------|
| Inline task | **Convert to Reminder** — marks line done with note; creates Reminder |
| Inline task | **Convert to task note** — existing behavior |
| Task note | **Convert to Reminder** — marks done, archives note, creates Reminder with body in notes |
| Reminder row | **Create task note** — deletes Reminder, creates task note |

Projects can **Set Reminders list…** from the project menu (maps `appleReminderListId` for convert targeting).

### Calendar overlay

When calendar IDs are set in settings, Fulcrum calendar shows external events from the bridge (read-only, dashed style).

### Migrating from Conduit sync

On first launch after upgrading, Fulcrum shows a one-time notice if you previously used Conduit sync.

Optional cleanup (command palette or **Settings → Integrations → Reminders bridge → Migration**):

- **Clean up vault metadata** — removes `appleReminderId`, inline `reminder-id` comments, and `conduitSync` from projects
- **Clean up Reminders metadata** — strips `obsidian://` links from reminder notes in project-linked lists (and area tags synced by Conduit)

## URL schemes (Obsidian URI)

Use the [Obsidian URI](https://docs.obsidian.md/Advanced+topics/Using+obsidian+URI) format where the **host** is the plugin id (`fulcrum`). Query parameters carry `screen`, `route`, `projectPath`, `focalDate`, etc. Do **not** use `action=open` in the query—that targets the core “open” action, not Fulcrum.

- With several vaults open, Obsidian uses the **focused** vault unless you launch via `obsidian://open?vault=VAULT_NAME&…`.

**Pattern:** `obsidian://fulcrum?screen=<name>&…`

| Conceptual route | Query |
|------------------|--------|
| `/fulcrum/dashboard` | `screen=dashboard` |
| `/fulcrum/tasks` | `screen=tasks` |
| `/fulcrum/kanban` | `screen=kanban` |
| `/fulcrum/calendar` | `screen=calendar` |
| `/fulcrum/time` | `screen=time` or `screen=time-tracked` |
| `/fulcrum/timeline` | `screen=timeline` — optional `focalDate=YYYY-MM-DD` |
| `/fulcrum/project` | `screen=project&projectPath=<vault-path-encoded>` |
| `/fulcrum/classic` | `screen=classic` (standalone dashboard leaf) |

**Alternate:** `route=%2Ffulcrum%2Fdashboard` (URL-encoded `/fulcrum/dashboard`) instead of `screen`.

Full examples are listed in **Settings → Fulcrum → URL schemes**.

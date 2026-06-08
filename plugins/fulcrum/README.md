# Fulcrum

Project management views for Obsidian (Project Manager shell, timeline, tasks, reviews).

## Tasks (Fulcrum-native)

Fulcrum indexes **task notes** (YAML frontmatter compatible with [TaskNotes](https://tasknotes.dev/)) and **inline checkbox** tasks tagged in your vault (e.g. `#Tasks`).

- **Create task notes** from project pages without the TaskNotes plugin — Fulcrum writes TaskNotes-compatible frontmatter.
- **Right-click any task card** for status, priority, due/scheduled, reminders, recurrence, project, note actions, and subtasks.
- **Recurring tasks** use RFC 5545 RRULE in frontmatter (`recurrence`, `complete_instances`, `recurrence_anchor`).
- **Inline tasks** with your configured include tag appear in Fulcrum with distinct card styling.

## Conduit (Apple Reminders sync, macOS)

Conduit syncs Fulcrum tasks (TaskNotes and inline checkboxes) with **Apple Reminders** using [remctl](https://github.com/viticci/remctl). Enable it under **Settings → Fulcrum → Conduit**.

### Setup

1. Install remctl (`git clone` + `./install.sh --bootstrap`, or your preferred install).
2. Run `remctl onboard` and `remctl permissions full-disk-access`.
3. Run `remctl doctor --for-agent` from **Terminal** first, then use **Run remctl doctor** in Fulcrum settings (grants must apply to **Obsidian**, not only Terminal).
4. Enable **Conduit** in Fulcrum settings.

### Behavior

- **One Reminders list per active project**; TaskNotes without a project use the configured Inbox list.
- **Sync scope:** project-linked **inline** checkbox tasks and **TaskNotes** (`type: task` or task tag in TaskNotes folders) only. Unlinked checklists elsewhere in the vault are not synced to Reminders.
- Syncs **title**, **status**, and **due date** (falls back to scheduled when due is empty). Notes in Reminders contain an `obsidian://open?…` link to the task note (works on iOS when the vault name matches).
- **Delete linked Reminder** when deleting a task (optional setting).
- **Vault quiet period** defers auto-sync so Obsidian Sync can catch up after phone edits — use **Pull from Reminders** if you just changed tasks on mobile.
- Completing a project in Fulcrum **archives** its Reminders list (unpin + rename) when the list has no open tasks.

### Obsidian Sync races

Reminders on your Mac update quickly; vault files may lag behind Obsidian Sync. Conduit prefers **pull** when the vault looks stale and defers bidirectional sync during the quiet window. After editing on iPhone, open Obsidian on Mac, wait for sync, then **Pull from Reminders** or **Sync now**.

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

# Fulcrum

Project management views for Obsidian (Project Manager shell, timeline, tasks, reviews).

## Tasks (Fulcrum-native)

Fulcrum indexes **task notes** (YAML frontmatter compatible with [TaskNotes](https://tasknotes.dev/)) and **inline checkbox** tasks tagged in your vault (e.g. `#Tasks`).

- **Create task notes** from project pages without the TaskNotes plugin — Fulcrum writes TaskNotes-compatible frontmatter.
- **Right-click any task card** for status, priority, due/scheduled, reminders, recurrence, project, note actions, and subtasks.
- **Recurring tasks** use RFC 5545 RRULE in frontmatter (`recurrence`, `complete_instances`, `recurrence_anchor`).
- **Inline tasks** with your configured include tag appear in Fulcrum with distinct card styling.

## OmniFocus sync (macOS)

Two-way mirror between **Fulcrum tasks** (task notes and inline checkboxes on a linked project) and **OmniFocus**. Tasks are linked by stable IDs (`omnifocusProjectId` on project notes, `omnifocusTaskId` on task notes, `<!-- omnifocus-id: … -->` on inline lines). Recurring vault tasks are skipped. This backend is **mutually exclusive** with Reminders task sync.

Enable under **Settings → Fulcrum → Integrations → OmniFocus sync**. Requires [Fulcrum Bridge](../fulcrum-bridge/README.md) and OmniFocus running (typically Pro, with Automation permission).

### Setup

1. Build and run Fulcrum Bridge (`plugins/fulcrum-bridge` → `./build.sh` then `./install-daemon.sh`).
2. Open OmniFocus. On first sync, allow **Fulcrum Bridge** to control OmniFocus.
3. Enable OmniFocus sync in Fulcrum settings (this turns off Reminders task sync).
4. On a project: **Link OmniFocus project…** (creates or picks an OmniFocus project).
5. Use **OmniFocus: Sync now** or wait for the poll interval.

Inbox items are pulled into the vault only when **Pull OmniFocus Inbox** is on. Unlinked vault tasks are not dumped into OmniFocus.

### Agents

Cursor can use the same HTTP API via the project MCP (`.cursor/mcp.json` → `fulcrum-omnifocus`). Do not also attach a third-party OmniFocus MCP while Fulcrum owns IDs.

## Reminders sync (macOS)

Two-way mirror between **Fulcrum tasks** (task notes and inline checkboxes on a linked project) and **Apple Reminders**. Tasks are linked by stable EventKit ids (`appleReminderListId` on project notes, `appleReminderId` on task notes, `<!-- reminder-id: … -->` on inline lines). Recurring vault tasks and recurring Reminders are skipped. This backend is **mutually exclusive** with OmniFocus.

iPhone captures sync through iCloud to this Mac’s EventKit, then into the vault while Fulcrum Bridge and Obsidian are running.

Enable under **Settings → Fulcrum → Integrations → Reminders sync**. Requires [Fulcrum Bridge](../fulcrum-bridge/README.md).

### Setup

1. Build and run [`plugins/fulcrum-bridge`](../fulcrum-bridge/README.md) (`./build.sh` then `./install-daemon.sh`).
2. Grant Reminders and Calendar access.
3. Enable Reminders sync in Fulcrum settings (this turns off OmniFocus).
4. On a project: **Set Reminders list…**
5. Use **Reminders: Sync now** or wait for the poll / EventKit change wake.

Unlinked vault tasks are not dumped into Reminders. Optional **Pull default Reminders list** creates vault notes for incomplete items on the Mac default list.

### Query blocks

Live views of Apple Reminders (including unlinked lists such as shopping):

````markdown
```fulcrum-reminders
due: today
list: Shopping
completed: false
```
````

Checkboxes complete/reopen the Apple Reminder directly. Right-click a row on an **unlinked** list for **Create task note** (deletes the Reminder). Tag filters are empty: EventKit does not expose Reminder tags.

### Convert actions (unlinked lists only)

| Source | Action |
|--------|--------|
| Inline task | **Convert to Reminder** — marks line done; creates Reminder |
| Task note | **Convert to Reminder** — marks done, archives note, creates Reminder |
| Reminder row | **Create task note** — deletes Reminder, creates task note |

Linked projects use two-way sync instead of convert.

### Calendar overlay

When calendar IDs are set in settings, Fulcrum calendar shows external events from the bridge (read-only, dashed style).

### Migrating from remctl / Conduit

Optional cleanup (command palette):

- **Clean up leftover remctl numeric ids** — removes numeric `appleReminderId` values that cannot look up EventKit items (UUID join ids are kept)
- **Clean up Conduit metadata in Reminders** — strips `obsidian://` links from reminder notes in project-linked lists

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

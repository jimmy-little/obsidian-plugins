# Fulcrum UI interaction patterns

Guidelines for toolbars, filters, inputs, menus, and modals across Fulcrum views.

## Shell layout (Project Manager)

- **Left sidebar:** mode glyph bar; **Horizon** shows facets/filter panel + month calendar; Calendar/Kanban show task list with facets; other modes show project list; **Areas** global filter footer on non-Orbit modes.
- **Horizon main pane:** week strip + day-grouped forecast list; right inspector for selected task properties.
- **Main header:** page title + `FulcrumLeafToolbar` (index refresh).

## Global vs local filters

| Control | Scope | Location |
|---------|--------|----------|
| **Areas** (`AreaFilterPanel`) | Entire plugin (`areaFilterState`) | PM left sidebar footer |
| List **Filters** facet | Task sidebar + Horizon (status, project, task source when Both) | `ProjectListPanel` / `TaskListPanel` |
| Calendar **layers** | Calendar visibility | Calendar main pane |
| Time **Areas** toggles | Time overview rollup | Time overview (per-view area inclusion) |

## Menu vs modal

| Pattern | Use when |
|---------|----------|
| Obsidian `Menu` / submenu | Single choice from a small set (≤~15), presets, toggles |
| `FuzzySuggestModal` | Searchable long lists (projects, folders, tags, Reminders lists) |
| `Modal` | Multi-field forms, confirmations, free text, RRULE editing |
| Native date/time inputs | Any calendar date or optional time in modals (`type="date"`, `type="time`, `datetime-local` for timestamps) |

### Task actions

- **Status / priority / due presets:** context menu submenus.
- **Due / scheduled custom:** `TaskFieldDateModal` (date + time pickers).
- **Project (≥20 projects):** `ProjectPickerModal`; fewer projects: submenu.
- **Reminders:** preset submenu on context menu (not modal).
- **Recurrence custom:** modal; presets in submenu.

### Project actions

- **Status pill click:** `ChangeProjectStatusModal` (folder + frontmatter options).
- **Context menu status:** quick apply with default folder/FM options.
- **Mark reviewed / complete / milestone:** modals when note text or multi-field input is needed.

## Shared components (`src/svelte/shared/`)

| Component | Purpose |
|-----------|---------|
| `FulcrumDateNavToolbar` | ‹ › title Today (or dot) + trailing slots |
| `FulcrumFacetPanel` / `FulcrumFacetRow` | Collapsible filter rows in list sidebars |
| `FulcrumFilterPopover` | Anchored checkbox multi-select |
| `FulcrumSegmentGroup` | Pill/tab button groups |
| `FulcrumViewToolbar` | Horizontal toolbar composer (primary + actions) |
| `FulcrumScheduleDropOptions` | “Set date as” when drag-to-schedule is available |

## Drag-to-schedule

Show **Unscheduled** list and **Set date as** only when `scheduleDragContext` is true (PM calendar mode or Kanban tasks sidebar).

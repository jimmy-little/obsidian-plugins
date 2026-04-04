# Lapse

Time tracking with code blocks, reports, calendar, and quick-start timers.

## Time blocking (planned blocks)

Planned blocks are **intent only** (not logged work): they live in per-day notes under **Settings → Lapse → Planner folder** (default `Lapse/Planner/YYYY-MM-DD.md`, YAML key `lapse_planned`). They appear in the week/day calendar with a dashed style, can be moved and resized like logged entries, and are excluded from time reports until you start a timer or create a logged entry.

**Calendar draw mode** controls what happens when you drag on empty space: ask whether to add a plan or log time, always plan, or always log (legacy behavior).

Other plugins can use `getPlugin('lapse-tracker').api` — see `@obsidian-suite/interop` for `listPlannedBlocksInRange`, `upsertPlannedBlock`, `deletePlannedBlock`, and the `LAPSE_PLANNED_DRAG_MIME` drag payload.

## URL schemes (Obsidian URI)

**Plugin id (URI host):** `lapse-tracker` (see `manifest.json`).

**Pattern:** `obsidian://lapse-tracker?screen=<surface>`

| Conceptual route | `screen` value |
|------------------|----------------|
| `/lapse/activity` | `activity` or `sidebar` (default) |
| `/lapse/reports` | `reports` |
| `/lapse/quick-start` | `quick-start`, `quick_start`, `buttons` |
| `/lapse/calendar` | `calendar` |
| `/lapse/grid` | `grid` or `entry_grid` |

Examples are also in **Settings → Lapse → URL schemes** at the top of the tab.

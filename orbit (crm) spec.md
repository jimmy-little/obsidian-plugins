# Orbit — Obsidian CRM Plugin
## Requirements Document v0.1
_Last updated: 2026-03-31_

---

## Overview

**Orbit** is a personal CRM plugin for Obsidian. It renders people (stored as markdown files) as rich profile pages with interaction history, org relationships, stats, and quick-note logging. It is a sibling plugin to Fulcrum and shares its visual language.

---

## 1. Data Model

### 1.1 People Files

- People are standard Obsidian markdown files stored in one or more user-configured directories (set in plugin settings).
- Orbit **hijacks the leaf renderer** for any note in a configured people directory — opening it in the Orbit view instead of the default markdown editor.
- Each person file is the canonical record. Orbit never creates shadow files.

### 1.2 Frontmatter Schema

```yaml
name: "Dave Petzel"
aliases: ["David Petzel"]
company: "Disney"
org_up: "[[Diffendaffer, Chip]]"       # wikilink to another person file
org_down:                               # array of wikilinks
  - "[[Petzel, Dave]]"
  - "[[Little, Jimmy]]"
avatar: "path/to/photo.jpg"            # local wikilink OR remote URL
banner: "[[assets/banner.jpg]]"       # optional; image wikilink/path/URL → banner background
color: "#2a2a2a"                       # optional; tints page chrome + heatmap (named tokens ok); default from settings
tags: []
```

- `org_up` / `org_down`: wikilinks to other people files. Clicking navigates to that person's Orbit leaf.
- `avatar`: resolves as local vault path (wikilink syntax) or remote URL. Behavior (cover, circle, etc.) is controlled by the shared `avatar_style` setting (see §6).
- `banner`: optional background image (image extensions only); wikilink, vault path, or `https` URL. A scrim + `color` tint keeps title/controls readable.
- `color`: tints the page like Fulcrum project accent (stats, section headers, buttons, activity chrome, heatmap). Hex, `rgb()`, or named tokens (`navy`, `teal`, …).

### 1.3 Interaction Detection

An **interaction** is any note in the vault that contains a wikilink to the person's file.

- Includes: meeting notes, call notes, daily notes, project pages, freeform notes.
- Excludes: the person's own file, and snapshot blocks (see §5).
- **Date resolution order:**
  1. `date:` frontmatter field
  2. `startTime:` frontmatter field
  3. File last-modified date (fallback)
- **Interaction type** is inferred from frontmatter or tags:
  - `type: meeting` → Meeting icon
  - `type: call` → Call icon
  - `type: note` (or no type) → Note icon
  - Quick notes (logged on person page) → Quick Note icon
  - Additional types can be added; match Fulcrum's icon set.

---

## 2. Layout & UI

Orbit's visual language mirrors Fulcrum. Shared CSS variables, typography, icon set, and component patterns should be extracted to a shared stylesheet or be consistent by convention.

### 2.1 Header / Banner

- Full-width banner across the top of the leaf.
- Banner color: defaults to theme dark-gray; can be overridden by `color:` frontmatter.
- **Profile picture**: circular avatar rendered in the lower-left of the banner (overlapping banner/content boundary), sourced from `avatar` frontmatter. Fallback: initials in a circle.
- **Name**: large display text in the banner.
- **Action buttons** (top-right of banner, matching Fulcrum style):
  - `Open Note` — opens the raw markdown file
  - `Snapshot` — triggers snapshot (see §5)
  - `New Quick Note` — focuses the quick note input

### 2.2 Stats Tiles

A row of stat tiles below the banner. Suggested stats (can be dialed back):

| Tile | Value |
|---|---|
| Last Contacted | Date of most recent interaction |
| Total Interactions | Count of all interactions |
| This Month | Count of interactions in current calendar month |
| Avg Cadence | Average days between interactions (rolling) |
| First Contact | Date of earliest interaction |
| Streak | Current streak of months with ≥1 interaction |

### 2.3 Org Chart

- Small section showing `org_up` (manager/above) and `org_down` (reports/below) as clickable chips/cards.
- Clicking a person chip opens their Orbit leaf in split view.
- If no org data: section is hidden.

### 2.4 Activity Feed

A reverse-chronological timeline of all interactions, styled to match Fulcrum's Activity section.

- Each entry shows: icon (by type), note title (wikilink), date, and any available metadata (duration, tags).
- Quick notes appear inline in the feed with their timestamp and content.
- Wikilinks within quick note text are rendered as clickable links.
- Snapshot log entries (the `<!-- fulcrum-log -->` style entries) are parsed and displayed but visually distinguished.

### 2.5 Related Notes & Meetings

Two sub-sections, each with **list view** and **calendar view** toggle.

#### List View
- Tabular list: Date | Title | Type | Duration (if available)
- Titles are wikilinks; clicking opens in a new or split leaf.

#### Calendar View
- Full monthly calendar.
- Each interaction appears on its date.
- Entry label: `entry:` frontmatter if present, otherwise note filename.
- Clicking an entry opens the note.
- Month navigation controls.

### 2.6 Quick Notes

- Text input at the bottom of the left panel (matching Fulcrum's "Project log" input).
- On submit, appends lines to the person's markdown file (convention: **near the top of the body**, after frontmatter). Format:
  ```
  - 3/31/26, 8:44 PM — note text with optional [[wikilinks]]
  ```
- Wikilinks in quick notes create backlinks in the linked notes (standard Obsidian behavior).
- Wikilinks do NOT link to other quick notes — only to vault pages.
- Quick notes are parsed out of the file and surfaced in the Activity feed with a distinct icon.
- **Snapshot never edits quick-note lines.** Only the HTML-comment snapshot region (§5) is written or replaced.

---

## 3. Views

### 3.1 Leaf Behavior

- When Orbit is installed, any note in a configured people directory opens in the Orbit leaf renderer instead of the default editor.
- Opening a person in Orbit uses **split-view leaf** (consistent with how Fulcrum opens people today).
- The Orbit leaf is read-only from a rendering perspective; raw editing is accessible via the `Open Note` button.

### 3.2 Fulcrum Integration

- Fulcrum currently displays people (from meeting note frontmatter) as avatar cards that open in split-view leaves.
- **When Orbit is installed**, Fulcrum detects its presence and delegates person-leaf rendering to Orbit.
- Fulcrum passes the person file path; Orbit opens it in its renderer.
- This is a **Fulcrum-side change**, documented here as a dependency/integration point. Orbit exposes a registration API or a detectable plugin ID that Fulcrum can check.

---

## 4. Settings

Accessible via the standard Obsidian plugin settings panel.

| Setting | Description |
|---|---|
| `people_dirs` | Array of vault directories to treat as people (e.g. `People/`, `Contacts/`) |
| `avatar_frontmatter_field` | Frontmatter key for avatar image (default: `avatar`) |
| `avatar_style` | How avatar is rendered: `circle`, `cover`, `thumbnail` (default: `circle`) |
| `default_banner_color` | Fallback banner color if no `color:` frontmatter |
| `date_field` | Primary date frontmatter key (default: `date`) |
| `startTime_field` | Secondary date frontmatter key (default: `startTime`) |

### 4.1 Shared Settings (Future: JimmyOS Core)

> **Note for Cursor:** The `avatar_frontmatter_field` and `avatar_style` settings should be architected to read from a shared config store if a "JimmyOS Core" plugin is present, falling back to local settings if not. Other JimmyOS plugins (Fulcrum, Pulse, etc.) would do the same. This allows a single place to set avatar behavior across all plugins. Design Orbit's settings layer with this future abstraction in mind — e.g., a `getSharedSetting(key, localFallback)` helper.

---

## 5. Snapshot

The Snapshot feature captures the current dynamic state of the person page as a permanent markdown record **stored inside a single replaceable region** in the person's file.

### 5.1 Behavior

- Triggered by the `Snapshot` button in the header.
- Orbit renders the current state (stats, activity, related notes, org) into a structured markdown block.
- The block is wrapped in paired HTML comments so the Orbit renderer can ignore it when building the live UI:

```markdown
<!-- orbit-snapshot:1743456000000 -->
### Person Snapshot (2026-03-31)

| Last Contacted | Total Interactions | This Month | Avg Cadence |
|---|---|---|---|
| Mar 28, 2026 | 14 | 3 | 12 days |

#### Recent Activity
- 3/28/26 — [[TSS Team Sync]] (Meeting, 30m)
- 3/23/26 — [[Mobius Integration Review]] (Note)

#### Org
- Reports to: [[Diffendaffer, Chip]]

_Snapshot captured by Orbit_
<!-- orbit-snapshot-end -->
```

- **Replacement, not accumulation:** Each time the user runs Snapshot, Orbit **replaces the entire prior snapshot region**—everything from the opening `<!-- orbit-snapshot ... -->` through `<!-- orbit-snapshot-end -->`—with a freshly generated block. There is at most one snapshot region in the file at a time.
- **Quick notes are out of scope for Snapshot writes:** Lines written by Quick Notes (typically at the **top** of the body, §2.6) are **never** modified, deleted, or moved by Snapshot. Only the content **between** the HTML comment fences is replaced.
- The opening marker may include a timestamp id (e.g. `orbit-snapshot:1743456000000`) for debugging; replacement still targets the whole fenced region.
- The renderer skips all content between `<!-- orbit-snapshot -->` and `<!-- orbit-snapshot-end -->` when rendering the Orbit profile (same as excluding that region from “live” parsing where appropriate).
- In the raw note, the snapshot block remains visible and human-readable for export and diffing.

---

## 6. Out of Scope (v1)

- Email/calendar integration (interactions are vault-only)
- Bulk import from external CRMs
- Two-way sync with any external service
- Relationship strength scoring (beyond basic stats)
- JimmyOS Core shared settings plugin (noted as future work)

---

## 7. Open Questions for Implementation

1. **Interaction exclusion**: Should Orbit exclude the person file itself from interaction counting even if it has self-referencing wikilinks? (Assumed: yes.)
2. **Quick note parsing**: Quick notes are identified by the `- MM/DD/YY, H:MM AM/PM —` prefix pattern. Is this regex sufficient, or should they be in a dedicated section/heading?
3. **Fulcrum API surface**: What's the lightest-weight way for Orbit to signal its presence to Fulcrum — a global `window.__orbitPlugin` handle, checking `app.plugins.plugins['orbit']`, or a custom event?
4. **Calendar view scope**: Does the calendar show only the current month on load, with nav to go back, or does it default to the month of the last interaction?
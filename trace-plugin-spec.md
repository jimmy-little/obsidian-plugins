# Trace — Obsidian Plugin Specification

> **Purpose:** Hand this document to Cursor/Claude Code as the authoritative spec for building the Trace Obsidian plugin. All architectural decisions are finalized here.

---

## Overview

**Plugin name:** Trace  
**Type:** Obsidian community plugin (TypeScript)  
**Purpose:** Parse, display, highlight, filter, and query structured log files inside Obsidian — supporting pipe-delimited markdown tables, CSV, and standard app/system log formats.

---

## Supported File & Format Types

Trace activates on files with:
- Extension: `.log`, `.csv`
- Or any `.md` file with frontmatter property: `trace: true`

For `.md` files, format is determined by optional `logformat: table | csv | log` frontmatter, or auto-detected from content when omitted.

### Format Modes

| Mode | Description | Example |
|---|---|---|
| `table` | Pipe-delimited markdown table | `\| Date \| Status \| App \|` |
| `csv` | Comma-separated values (with header row) | `Date,Status,App` |
| `log` | Standard app/system log lines | `[2026-06-14T18:12:28] INFO Starting app` |

Auto-detection is used when `logformat` is not set (or for `.log`/`.csv` files):
- Starts with `|` → `table`
- Fields separated by commas, first line is header → `csv`
- Otherwise → `log`

---

## Normalized Internal Schema

All formats are parsed into a shared internal record structure:

```typescript
interface LogEntry {
  timestamp: Date | null;
  status: string | null;         // raw value, e.g. "OPEN", "ERROR", "200"
  statusCategory: StatusCategory; // derived semantic category
  subject: string | null;        // app name, URL, filename, etc.
  message: string | null;        // remaining/note content
  raw: string;                   // original unparsed line
  lineNumber: number;
}

type StatusCategory = 'success' | 'error' | 'warning' | 'info' | 'neutral';
```

---

## Phase 1 — Parsing

### Column Mapping

For `table` and `csv` modes, columns are mapped to schema fields via:
1. **Auto-detection:** Match header names to known aliases (see below)
2. **Per-file override:** Frontmatter property `trace-columns`
3. **Global default:** Settings panel

```yaml
# Example frontmatter override
---
trace: true
logformat: table
trace-columns:
  timestamp: Date
  status: Status
  subject: App
---
```

**Known header aliases (case-insensitive):**

| Field | Recognized headers |
|---|---|
| `timestamp` | date, time, timestamp, datetime, ts, logged_at, created_at |
| `status` | status, level, severity, type, event, code |
| `subject` | app, url, page, file, source, target, name, resource |
| `message` | message, msg, note, comment, description, detail |

### Status Normalization

Map raw status values to `StatusCategory`:

| Category | Values |
|---|---|
| `success` | OPEN, SUCCESS, OK, 200, 201, 204, STARTED, RUNNING, PASS |
| `error` | ERROR, FAIL, FAILED, CLOSED, CRASH, 400, 401, 403, 404, 500, 502, 503 |
| `warning` | WARN, WARNING, DEPRECATED, TIMEOUT, 301, 302, 429 |
| `info` | INFO, DEBUG, LOG, TRACE, NOTICE |
| `neutral` | *(everything else)* |

User can add custom status mappings in settings.

### Log Line Parsing (log mode)

Use a regex pipeline to extract fields from unstructured log lines. Attempt patterns in order:

1. `[TIMESTAMP] LEVEL message` — bracket-wrapped timestamp
2. `TIMESTAMP LEVEL message` — space-separated
3. `LEVEL: message` — level prefix only
4. Fall through: treat entire line as `message`, `status = null`, `timestamp = null`

**Timestamp formats to recognize:**
- ISO 8601: `2026-06-14T18:12:28`, `2026-06-14T18:12:28Z`, `2026-06-14T18:12:28.000Z`
- Common log: `14/Jun/2026:18:12:28`, `Jun 14 18:12:28`
- Compact: `20260614`, `20260614T181228`

---

## Phase 2 — Syntax Highlighting

### Implementation

- **Live Preview:** CodeMirror 6 `ViewPlugin` + `Decoration`
- **Reading Mode:** Markdown post-processor (`registerMarkdownPostProcessor`)
- Both must be implemented; they share the same token-type logic

### Token Types & Default Colors

CSS custom properties so theme colors can override:

| Token | CSS Variable | Default (dark) | Default (light) |
|---|---|---|---|
| Timestamp/Date | `--trace-color-timestamp` | `#7EC8E3` (blue) | `#1A6A8A` |
| Status: success | `--trace-color-success` | `#6DBF6D` (green) | `#2A7A2A` |
| Status: error | `--trace-color-error` | `#E06C6C` (red) | `#9A2020` |
| Status: warning | `--trace-color-warning` | `#E5C07B` (yellow) | `#8A6A00` |
| Status: info | `--trace-color-info` | `#ABB2BF` (gray) | `#555B66` |
| Status: neutral | `--trace-color-neutral` | `#6B6B6B` | `#999999` |
| Subject | `--trace-color-subject` | `#C678DD` (purple) | `#6A1A8A` |
| Comment/Note | `--trace-color-comment` | `#5C6370` (muted) | `#888888` |

Colors are overridable in Settings (color picker per token type).

### Table Mode Highlighting

In `table` mode, highlight entire cells by their mapped column type rather than inline spans. Apply a CSS class to the `<td>` element:

```
.trace-cell-timestamp
.trace-cell-status-success
.trace-cell-status-error
(etc.)
```

---

## Phase 3 — In-Leaf Filtering

### UI

Inject a sticky filter toolbar above the rendered log content. Toolbar is only shown when Trace is active on the current file.

### Filter Controls

| Control | Type | Behavior |
|---|---|---|
| Date From | Date input | Hide entries before this date |
| Date To | Date input | Hide entries after this date |
| Status | Multi-select checkboxes | Show only selected status categories; default = all checked |
| Keyword | Text input | Case-insensitive match against any field in the entry |

### Behavior

- Filtered rows are **hidden** (CSS `display: none`), not removed from DOM
- A count badge shows: `Showing 42 of 318 entries`
- Filters are **ephemeral** — reset when the leaf is closed
- No filter state is persisted to disk

---

## Phase 4 — Custom Query Code Block

Replace Dataview integration with a native `trace` fenced code block renderer.

### Syntax

````
```trace
source: "logs/app-log.md"
status: ERROR, WARN
date-from: 2026-06-01
date-to: 2026-06-14
keyword: Shortcuts
limit: 50
group-by: status
```
````

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `source` | string (required) | Vault-relative path to the log file |
| `status` | string or list | Match raw status value OR `StatusCategory` (case-insensitive), e.g. `ERROR` or `error, warning` |
| `date-from` | ISO date string | Inclusive start date |
| `date-to` | ISO date string | Inclusive end date |
| `keyword` | string | Free-text match against any field |
| `limit` | integer | Max rows to return (default: 100) |
| `group-by` | `status` \| `date` | Optional grouping (`status` = raw status string; `date` = local calendar day `YYYY-MM-DD`, null timestamps → `unknown`) |
| `display` | `table` \| `summary` | Output format (default: `table`) |

### Display Modes

**`table` (default):** Renders a styled HTML table of matching entries with column highlighting applied.

**`summary`:** Renders an aggregated count view:
```
OPEN     ████████████  42
CLOSED   ████          12
ERROR    ██            6
```

### Error States

- Source file not found → show inline error: `⚠ Trace: file not found — logs/app-log.md`
- No results → show: `No entries matched your query.`
- Parse failure → show: `⚠ Trace: could not parse source file. Check logformat setting.`

---

## Phase 5 — Settings

Settings panel under **Settings → Community Plugins → Trace**

### Options

| Setting | Type | Default | Description |
|---|---|---|---|
| Default column: timestamp | Text | `Date, Timestamp, Time` | Comma-separated header aliases |
| Default column: status | Text | `Status, Level, Severity` | |
| Default column: subject | Text | `App, URL, Source, File` | |
| Default column: message | Text | `Message, Note, Comment` | |
| CSV delimiter | Select | `,` | Options: `,` `\|` `\t` |
| Custom status mappings | Key-value list | *(empty)* | e.g. `LAUNCH → success` |
| Token colors | Color pickers | *(see defaults above)* | Per token type |
| Default query limit | Number | `100` | Max rows in trace blocks |

---

## Plugin Structure

Monorepo location: `plugins/trace/` (obsidian-suite workspace).

```
plugins/trace/
├── esbuild.config.mjs
├── manifest.json
├── package.json
├── styles.css               # generated (suite tokens + plugin CSS)
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── main.ts              # Plugin entry point
    ├── plugin.css           # CSS variables + token classes
    ├── traceContext.ts      # Activation + format resolution
    ├── types.ts
    ├── parser/
    │   ├── index.ts         # Format detection + dispatch
    │   ├── tableParser.ts   # Pipe-delimited markdown tables
    │   ├── csvParser.ts     # CSV line splitting
    │   ├── csvParserMain.ts # CSV → LogEntry
    │   ├── logParser.ts     # Unstructured log lines
    │   ├── statusNormalizer.ts
    │   ├── columnMapping.ts
    │   └── timestampParser.ts
    ├── highlight/
    │   ├── tokenTypes.ts
    │   ├── cmExtension.ts   # CodeMirror 6 (Source + Live Preview + plain)
    │   ├── postProcessor.ts # Reading mode
    │   └── lineDecorations.ts
    ├── filter/
    │   ├── filterToolbar.ts
    │   └── filterState.ts
    ├── query/
    │   ├── traceBlock.ts    # ```trace``` code block renderer
    │   └── queryEngine.ts
    └── settings/
        ├── settingsTab.ts
        └── defaults.ts
```

---

## Development Notes

- Target Obsidian API: `1.4.0+`
- Language: TypeScript (strict mode)
- No external runtime dependencies — parsers are hand-rolled, no npm CSV/log libraries
- CodeMirror 6 is available via `obsidian` package — do not import it separately
- Use `obsidian`'s built-in `MarkdownRenderer` for rendering inside the trace block output where needed
- All file reads go through `app.vault.read()` — never use Node `fs` directly
- Plugin ID: `trace` (for manifest)
- Build: `npm run build:trace` from monorepo root
- Editor coverage: syntax highlighting and filter toolbar in Source, Live Preview, and Reading (`.md`), plus plain editor (`.log`/`.csv`)
- Keyword filter matches case-insensitively across timestamp (ISO), status, subject, message, and raw line
- One line = one log entry (multi-line entries not supported in v1)

---

## Open Questions / Future Work

- Timeline/sparkline visualization in summary mode
- Export filtered results to a new note
- Support for multi-file sources in a single trace block (`source: ["log1.md", "log2.md"]`)
- Watch mode: auto-refresh trace blocks when source file changes

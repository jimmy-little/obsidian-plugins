# Design Document: Timer Active Restyle

## Overview

Restyle the `ActiveTimersPanel` row rendering to match the `.fulcrum-timer-button--timery` card language used by Quick Start. Each active timer row becomes a mini card with: thick accent left-border, boxed timer display with ±1/±5 adjust buttons, a two-line info column (label + note name), and a filled accent-background circular stop button.

Both the docked leaf (`mountActiveTimersView`) and the floating pop-out (`mountFloatingTimersHud`) share the same `ActiveTimersPanel` class, so changes apply to both surfaces automatically.

## Architecture

### Component: `ActiveTimersPanel.renderRow()`

The existing `renderRow` method is refactored from a two-column layout (info + stop button) to a three-column layout:

```
┌────────────────────────────────────────────────────────────┐
│ ┌──────────┐  ┌──────────────────────┐  ┌────┐            │
│ │  01:23:45 │  │ Timer Label (accent)  │  │ ■  │           │
│ │ -5 -1 +1 +5│ │ Note Name (muted)     │  │    │           │
│ └──────────┘  └──────────────────────┘  └────┘            │
│▌thick accent left border                                    │
└────────────────────────────────────────────────────────────┘
```

### Data Flow

```
ActiveTimersPanel.render()
  └─ getActiveTimers()  →  Array<{ filePath, entry }>
       └─ for each row:
            ├─ resolveAccentForFile(filePath)  →  accentCss string
            ├─ renderRow(list, { filePath, entry }, accentCss)
            │    ├─ DOM: row card (accent left border)
            │    ├─ DOM: timer-container (elapsed + adjust buttons)
            │    ├─ DOM: right-column (label + note name)
            │    └─ DOM: stop button (circular accent bg)
            └─ timeDisplays.set(entry.id, timeEl)
```

## Components and Interfaces

### 1. `ActiveTimersPanel.renderRow()` — New DOM Structure

```typescript
private renderRow(list: HTMLElement, { filePath, entry }: ActiveTimerRow, accentCss: string): void {
    const card = list.createDiv({ cls: "fulcrum-active-timers__row" });

    // Apply accent left border via shared utility
    this.plugin.applyProjectAccent(card, accentCss);

    // LEFT: Timer display box (reuses inline widget classes)
    const timerBox = card.createDiv({ cls: "fulcrum-timer-timer-container" });
    const elapsed = this.plugin.getActiveEntryElapsedMs(entry);
    const timeEl = timerBox.createDiv({
        text: this.plugin.formatTimeAsHHMMSS(elapsed),
        cls: "fulcrum-timer-timer-display",
    });
    this.timeDisplays.set(entry.id, timeEl);

    // Adjust buttons row
    const adjustRow = timerBox.createDiv({ cls: "fulcrum-timer-adjust-buttons" });
    for (const offset of [-5, -1, 1, 5]) {
        const btn = adjustRow.createEl("button", {
            cls: "fulcrum-timer-btn-adjust",
            text: offset > 0 ? `+${offset}` : `${offset}`,
        });
        btn.onclick = (ev) => {
            ev.stopPropagation();
            void this.adjustStartTime(filePath, entry, offset);
        };
    }

    // CENTER: Right info column (label + note name)
    const info = card.createDiv({ cls: "fulcrum-timer-right-column fulcrum-active-timers__info" });
    const entryLabel = entry.label?.trim();
    const noteName = this.noteLabel(filePath);

    if (entryLabel) {
        info.createDiv({
            text: entryLabel,
            cls: "fulcrum-active-timers__entry-label fulcrum-active-timers__entry-label--accent",
        });
        const noteLink = info.createEl("a", {
            text: noteName,
            cls: "fulcrum-active-timers__note",
            href: filePath,
        });
        noteLink.onclick = (ev) => {
            ev.preventDefault();
            void this.openNote(filePath);
        };
    } else {
        // No label: promote note name to line 1 with accent styling
        const noteLink = info.createEl("a", {
            text: noteName,
            cls: "fulcrum-active-timers__note fulcrum-active-timers__note--accent",
            href: filePath,
        });
        noteLink.onclick = (ev) => {
            ev.preventDefault();
            void this.openNote(filePath);
        };
    }

    // RIGHT: Stop button (circular, accent bg, white icon)
    const stopBtn = card.createEl("button", {
        cls: "fulcrum-active-timers__stop",
        attr: { "aria-label": "Stop timer" },
    });
    setIcon(stopBtn, "square");
    stopBtn.onclick = (ev) => {
        ev.stopPropagation();
        void this.stopTimer(filePath, entry.id);
    };
}
```

### 2. `ActiveTimersPanel.resolveAccentForFile()` — Accent Color Lookup

```typescript
private async resolveAccentForFile(filePath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return "var(--interactive-accent)";

    // Try indexed project via vault index
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
    const projectRaw = fm?.[this.plugin.settings.projectKey];
    if (typeof projectRaw === "string" && projectRaw.trim()) {
        const color = await this.plugin.getProjectColor(projectRaw);
        if (color) return color;
    }

    return "var(--interactive-accent)";
}
```

This reads the `project:` frontmatter key from the timer note, resolves its linked project file, then returns the accent CSS via `getProjectColor()` (which internally uses `resolveProjectAccentCss`).

### 3. `ActiveTimersPanel.adjustStartTime()` — Start Time Adjustment Logic

```typescript
private async adjustStartTime(filePath: string, entry: TimeEntry, offsetMinutes: number): Promise<void> {
    if (!entry.startTime) return;

    const offsetMs = offsetMinutes * 60 * 1000;
    // For positive offset (+N), subtract from startTime to increase elapsed
    // For negative offset (-N), add to startTime to decrease elapsed
    const newStartTime = entry.startTime - offsetMs;

    // Guard: new startTime must not be in the future
    if (newStartTime > Date.now()) return;

    entry.startTime = newStartTime;

    // Persist to note frontmatter
    await this.plugin.updateFrontmatter(filePath);

    // Update display immediately
    const timeEl = this.timeDisplays.get(entry.id);
    if (timeEl) {
        const elapsed = this.plugin.getActiveEntryElapsedMs(entry);
        timeEl.setText(this.plugin.formatTimeAsHHMMSS(elapsed));
    }

    this.plugin.refreshActivityPanel();
}
```

**Key logic:**
- `+N` button: subtracts N minutes from `startTime` → elapsed grows by N minutes
- `-N` button: adds N minutes to `startTime` → elapsed shrinks by N minutes
- Guard: if `newStartTime > Date.now()`, the adjustment is silently rejected (elapsed would be negative)
- Persist: calls existing `this.plugin.updateFrontmatter(filePath)` which writes the in-memory entries array back to the note's YAML frontmatter

### 4. Updated `render()` Call Site

```typescript
async render(container: HTMLElement): Promise<void> {
    // ... (header unchanged) ...

    const activeTimers = await this.plugin.getActiveTimers();
    if (activeTimers.length === 0) {
        container.createEl("p", {
            text: "No active timers",
            cls: "fulcrum-active-timers__empty",
        });
    } else {
        const list = container.createDiv({ cls: "fulcrum-active-timers__list" });
        for (const row of activeTimers) {
            const accentCss = await this.resolveAccentForFile(row.filePath);
            this.renderRow(list, row, accentCss);
        }
    }

    // ... (tick interval unchanged) ...
}
```

## Interfaces

### Type Changes

No new types are introduced. The existing `ActiveTimerRow` alias and `TimeEntry` interface remain unchanged:

```typescript
type ActiveTimerRow = { filePath: string; entry: TimeEntry };
```

### New Private Methods on `ActiveTimersPanel`

| Method | Signature | Purpose |
|--------|-----------|---------|
| `resolveAccentForFile` | `(filePath: string) => Promise<string>` | Resolve accent CSS color from note's project frontmatter |
| `adjustStartTime` | `(filePath: string, entry: TimeEntry, offsetMinutes: number) => Promise<void>` | Shift entry.startTime and persist |
| `openNote` | `(filePath: string) => Promise<void>` | Extract existing note-open logic |

### TimerModule Dependency (Already Exists)

| Method | Used For |
|--------|----------|
| `getProjectColor(projectName)` | Resolve accent CSS from project name |
| `applyProjectAccent(el, accentCss)` | Sets `--fulcrum-pl-accent` + `data-fulcrum-accent` on element |
| `updateFrontmatter(filePath)` | Persists in-memory entries to note YAML |
| `getActiveEntryElapsedMs(entry)` | Computes elapsed ms from startTime |
| `formatTimeAsHHMMSS(ms)` | Formats elapsed for display |
| `settings.projectKey` | Frontmatter key for project lookup |

## CSS Changes

### Existing Classes Reused (No Changes Needed)

| Class | Source | Used For |
|-------|--------|----------|
| `.fulcrum-timer-timer-container` | Inline widget | Timer display box border + background |
| `.fulcrum-timer-timer-display` | Inline widget | Elapsed time text styling |
| `.fulcrum-timer-btn-adjust` | Inline widget | ±1/±5 button styling |
| `.fulcrum-timer-adjust-buttons` | Inline widget | Flex container for adjust button row |
| `.fulcrum-timer-right-column` | Inline widget | Info column flex layout |

### Modified CSS Rules

```css
/* Active Timers leaf — restyled rows to match Timery card layout */
.fulcrum-active-timers__row {
    display: flex;
    align-items: stretch;
    gap: 10px;
    padding: 8px 10px 8px 8px;
    border: 1px solid var(--background-modifier-border);
    border-left: 4px solid var(--fulcrum-pl-accent, var(--interactive-accent));
    border-radius: var(--radius-m, 6px);
    background: var(--background-secondary);
}

.fulcrum-active-timers__row[data-fulcrum-accent] {
    border-left-color: var(--fulcrum-pl-accent);
}
```

### New CSS Rules (Under `/* Active Timers Widget Styles */`)

```css
/* Timer box sizing within active timers row */
.fulcrum-active-timers__row .fulcrum-timer-timer-container {
    width: 100px;
    padding: 6px;
    gap: 4px;
}

.fulcrum-active-timers__row .fulcrum-timer-timer-display {
    font-size: 16px;
}

/* Info column within active timers row */
.fulcrum-active-timers__row .fulcrum-active-timers__info {
    justify-content: center;
}

/* Entry label promoted to primary line with accent color */
.fulcrum-active-timers__entry-label--accent {
    font-size: var(--font-ui-small);
    font-weight: 600;
    color: var(--fulcrum-pl-accent, var(--text-accent));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Note name link when promoted to accent line (no separate label) */
.fulcrum-active-timers__note--accent {
    color: var(--fulcrum-pl-accent, var(--text-accent));
    font-weight: 600;
}

/* Stop button as filled accent circle */
.fulcrum-active-timers__stop {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border-radius: 50%;
    background: var(--fulcrum-pl-accent, var(--interactive-accent));
    color: var(--fulcrum-timer-play-fg, #ffffff);
    align-self: center;
}
```

## Data Models

No data model changes. The `TimeEntry.startTime` field (already `number | null`) is mutated in-place by the adjust logic, and the existing `updateFrontmatter` persistence path handles serialization.

## Testing Strategy

**Property-based tests** (minimum 100 iterations each):
- Time format correctness (Property 1): Generate random non-negative ms values and verify HH:MM:SS pattern
- Adjust arithmetic (Properties 2, 3): Generate random valid startTimes and offsets, verify exact arithmetic
- Future-guard invariant (Property 4): Generate random startTimes and offsets including edge cases near `now`, verify startTime ≤ now always holds
- Label fallback rendering (Property 5): Generate entries with various label values (null, empty, whitespace, valid), verify correct DOM promotion

**Unit tests** (example-based):
- DOM structure: Verify rendered row contains `.fulcrum-timer-timer-container`, `.fulcrum-timer-right-column`, and stop button in correct order
- CSS class application: Verify `data-fulcrum-accent` attribute and `--fulcrum-pl-accent` CSS variable are set on row element
- Button labels: Verify exactly 4 adjust buttons with text −5, −1, +1, +5
- Stop action: Verify entry.endTime is set and row is removed from display
- Accent fallback: Verify `var(--interactive-accent)` used when no project color available

## Error Handling

| Scenario | Handling |
|----------|----------|
| Adjustment would cause negative elapsed | Guard: `if (newStartTime > Date.now()) return;` — silently no-op |
| Note file missing/deleted | `resolveAccentForFile` returns fallback `var(--interactive-accent)` |
| Project frontmatter key absent | Falls through to fallback accent color |
| `updateFrontmatter` file I/O failure | Existing error handling in `updateFrontmatter`; in-memory state remains (will persist on next save) |
| Entry becomes stale (stopped externally) | Existing `tick()` logic detects ID mismatch and triggers full re-render |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Time format output matches HH:MM:SS pattern

*For any* non-negative integer milliseconds value, `formatTimeAsHHMMSS(ms)` SHALL produce a string matching the pattern `HH:MM:SS` where HH is zero-padded hours, MM is zero-padded minutes (00–59), and SS is zero-padded seconds (00–59).

**Validates: Requirements 2.1**

### Property 2: Positive adjust decreases startTime by exact offset

*For any* active timer entry with a valid `startTime` and *for any* positive offset N in {1, 5}, applying the +N adjustment SHALL set `entry.startTime` to `(originalStartTime - N * 60000)`, thereby increasing elapsed duration by exactly N minutes.

**Validates: Requirements 3.1**

### Property 3: Negative adjust increases startTime by exact offset

*For any* active timer entry with a valid `startTime` and *for any* positive offset N in {1, 5}, applying the −N adjustment SHALL set `entry.startTime` to `(originalStartTime + N * 60000)`, thereby decreasing elapsed duration by exactly N minutes, provided the guard condition passes.

**Validates: Requirements 3.2**

### Property 4: Adjustment never produces a future startTime

*For any* active timer entry and *for any* adjustment offset (positive or negative), after the adjustment is applied (or rejected), `entry.startTime` SHALL be less than or equal to `Date.now()`. Equivalently, elapsed duration is always non-negative.

**Validates: Requirements 3.4**

### Property 5: Label-absent entries promote note name to accent position

*For any* active timer entry where `entry.label` is null, undefined, or an empty/whitespace-only string, the rendered row SHALL display the note name in the primary (line 1, accent-colored) position rather than the secondary muted position.

**Validates: Requirements 4.4**

### Property 6: Stop action sets endTime and removes entry from active list

*For any* active timer entry (where `startTime` is set and `endTime` is null), after the stop action completes, `entry.endTime` SHALL be a non-null timestamp, and the entry SHALL no longer appear in the active timers list returned by `listActiveTimersInMemory()`.

**Validates: Requirements 5.4**

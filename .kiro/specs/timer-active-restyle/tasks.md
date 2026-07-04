# Implementation Plan: Timer Active Restyle

## Overview

Restyle `ActiveTimersPanel` row rendering to match the Timery card layout: thick accent left-border, boxed timer display with ±1/±5 adjust buttons, two-line info column (label + note name), and filled accent-background circular stop button. Reuses existing inline widget CSS classes for consistency.

## Tasks

- [x] 1. CSS changes for restyled active timer rows
  - [x] 1.1 Modify `.fulcrum-active-timers__row` rule to use three-column flex layout with thick accent left border
    - Change `display: flex; align-items: stretch; gap: 10px`
    - Set `border-left: 4px solid var(--fulcrum-pl-accent, var(--interactive-accent))`
    - Add `border-radius: var(--radius-m, 6px)` and `background: var(--background-secondary)`
    - Add `[data-fulcrum-accent]` selector for `border-left-color`
    - _Requirements: 1.1, 1.2, 1.3, 7.5_

  - [x] 1.2 Add new CSS rules for active timer row components
    - Add `.fulcrum-active-timers__row .fulcrum-timer-timer-container` sizing override (width: 100px, padding: 6px)
    - Add `.fulcrum-active-timers__row .fulcrum-timer-timer-display` font-size override (16px)
    - Add `.fulcrum-active-timers__row .fulcrum-active-timers__info` centering rule
    - Add `.fulcrum-active-timers__entry-label--accent` rule (accent color, font-weight 600, ellipsis)
    - Add `.fulcrum-active-timers__note--accent` rule (accent color, font-weight 600)
    - Add `.fulcrum-active-timers__stop` circular stop button rule (28px, border-radius 50%, accent bg, white icon)
    - _Requirements: 2.2, 4.1, 4.2, 5.1, 5.2, 5.3, 7.5_

- [x] 2. Add resolveAccentForFile() method to ActiveTimersPanel
  - [x] 2.1 Implement `resolveAccentForFile(filePath: string): Promise<string>`
    - Read frontmatter project key from note's metadata cache
    - Call `this.plugin.getProjectColor(projectName)` to resolve accent CSS
    - Return fallback `var(--interactive-accent)` when project is missing or has no color
    - _Requirements: 1.1, 1.3_

  - [x] 2.2 Write property test for accent fallback behavior
    - **Property 5: Label-absent entries promote note name to accent position**
    - **Validates: Requirements 4.4**

- [x] 3. Add adjustStartTime() method and persistence
  - [x] 3.1 Implement `adjustStartTime(filePath, entry, offsetMinutes)` in ActiveTimersPanel
    - For +N: subtract N*60000 from `entry.startTime` (increases elapsed)
    - For -N: add N*60000 to `entry.startTime` (decreases elapsed)
    - Guard: reject if `newStartTime > Date.now()` (prevents negative elapsed)
    - Persist via `this.plugin.updateFrontmatter(filePath)` wrapped in `runWithFrontmatterReloadSuppressed`
    - Immediately update `timeDisplays` element text
    - Call `this.plugin.refreshActivityPanel()`
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 3.2 Write property test for adjust arithmetic (positive offset)
    - **Property 2: Positive adjust decreases startTime by exact offset**
    - **Validates: Requirements 3.1**

  - [x] 3.3 Write property test for adjust arithmetic (negative offset)
    - **Property 3: Negative adjust increases startTime by exact offset**
    - **Validates: Requirements 3.2**

  - [x] 3.4 Write property test for future-guard invariant
    - **Property 4: Adjustment never produces a future startTime**
    - **Validates: Requirements 3.4**

- [x] 4. Checkpoint - Verify new methods compile and logic is sound
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Rewrite renderRow() with new three-column DOM structure
  - [x] 5.1 Rewrite `renderRow()` to accept `accentCss` parameter and build new layout
    - Call `this.plugin.applyProjectAccent(card, accentCss)` on the row card
    - LEFT column: create `.fulcrum-timer-timer-container` with elapsed display (`.fulcrum-timer-timer-display`) and adjust buttons row (`.fulcrum-timer-adjust-buttons` with four `.fulcrum-timer-btn-adjust` buttons)
    - CENTER column: create `.fulcrum-timer-right-column` with label (accent styled) on line 1 and note name (muted) on line 2; when label is empty, promote note name to accent position
    - RIGHT column: circular stop button (`.fulcrum-active-timers__stop`) with `setIcon(stopBtn, "square")`
    - Wire adjust button click handlers to `this.adjustStartTime()`
    - Wire stop button click handler to existing `this.stopTimer()`
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4_

  - [x] 5.2 Extract `openNote(filePath)` helper from existing inline click handler
    - Move note-open logic to a reusable private method
    - _Requirements: 4.2_

  - [x] 5.3 Write property test for label fallback rendering
    - **Property 5: Label-absent entries promote note name to accent position**
    - **Validates: Requirements 4.4**

- [x] 6. Update render() to resolve accent and pass to renderRow
  - [x] 6.1 Modify the `render()` loop to call `resolveAccentForFile()` per row and pass result to `renderRow()`
    - Change `this.renderRow(list, row)` → `this.renderRow(list, row, accentCss)`
    - Await accent resolution before rendering each row
    - _Requirements: 1.1, 1.3_

- [x] 7. Verify FloatingTimersView inherits changes
  - [x] 7.1 Confirm FloatingTimersView uses same `ActiveTimersPanel` class via `mountFloatingTimersHud`
    - No code changes expected — both docked leaf and floating pop-out share `ActiveTimersPanel`
    - Verify that CSS rules apply correctly to both contexts
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design reuses existing CSS classes (`.fulcrum-timer-timer-container`, `.fulcrum-timer-timer-display`, `.fulcrum-timer-btn-adjust`, `.fulcrum-timer-adjust-buttons`, `.fulcrum-timer-right-column`) from the inline timer widget — no new definitions needed for those
- `updateFrontmatter` already handles suppression of metadata-cache reload via `runWithFrontmatterReloadSuppressed`; the `adjustStartTime` method should follow the same pattern
- FloatingTimersView shares the `ActiveTimersPanel` class so changes propagate automatically
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1"] },
    { "id": 5, "tasks": ["7.1"] }
  ]
}
```

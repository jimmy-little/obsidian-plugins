# Requirements Document

## Introduction

Restyle the active timer row displays in ActiveTimersPanel (docked leaf) and FloatingTimersView (pop-out window) to match the `.fulcrum-timer-button--timery` card design language. The new layout introduces a thick accent left border, a boxed timer display with functional ±1/±5 adjust buttons, a two-line info column (accent-colored label + muted note name), and a filled accent-background stop button. Existing inline timer widget CSS classes are reused where possible for visual consistency.

## Glossary

- **Active_Timer_Row**: A single row in the active timers list representing one running timer entry.
- **ActiveTimersPanel**: The imperative DOM component rendered in the docked Active Timers leaf view (`ActiveTimersPanel.ts`).
- **FloatingTimersView**: The pop-out window view that wraps ActiveTimersPanel via `mountFloatingTimersHud` (`FloatingTimersView.ts`).
- **Timer_Display_Box**: The bordered container showing elapsed time (HH:MM:SS) and adjust buttons, using `.fulcrum-timer-timer-container` styling.
- **Adjust_Button**: A button (±1 min or ±5 min) that shifts a timer's `startTime` to change elapsed duration in real-time, using `.fulcrum-timer-btn-adjust` styling.
- **Stop_Button**: The button that terminates a running timer entry.
- **Accent_Color**: The project/area accent color exposed via `var(--fulcrum-pl-accent)`.
- **Timer_Label**: The user-defined label or title of the running timer entry.
- **Note_Name**: The display name of the file/note the timer is associated with.

## Requirements

### Requirement 1: Row Layout Structure

**User Story:** As a user viewing active timers, I want each timer row to follow the Timery card layout, so that active timers are visually consistent with the quick-start card design.

#### Acceptance Criteria

1. THE Active_Timer_Row SHALL display a thick left border colored with Accent_Color using `var(--fulcrum-pl-accent)`.
2. THE Active_Timer_Row SHALL arrange content in a three-column horizontal layout: Timer_Display_Box on the left, a right info column in the center, and Stop_Button on the right.
3. THE Active_Timer_Row SHALL apply the `fulcrum-timer-button--timery` border-left pattern by setting `border-left-color` to `var(--fulcrum-pl-accent)`.

### Requirement 2: Boxed Timer Display

**User Story:** As a user tracking time, I want the elapsed duration shown in a bordered container with adjust buttons, so that I can see and modify elapsed time at a glance.

#### Acceptance Criteria

1. THE Timer_Display_Box SHALL render elapsed time in HH:MM:SS format using the `.fulcrum-timer-timer-display` class styling.
2. THE Timer_Display_Box SHALL be wrapped in a bordered container using the `.fulcrum-timer-timer-container` class for consistent styling with the inline timer widget.
3. THE Timer_Display_Box SHALL include four Adjust_Buttons labeled −5, −1, +1, and +5 representing minute offsets.
4. THE Timer_Display_Box SHALL update the displayed elapsed time every second.

### Requirement 3: Functional Adjust Buttons

**User Story:** As a user, I want ±1 and ±5 adjust buttons on active timers so that I can correct or shift the running timer's start time without stopping and restarting.

#### Acceptance Criteria

1. WHEN an Adjust_Button with offset +N is pressed, THE ActiveTimersPanel SHALL subtract N minutes from the timer entry's `startTime` so that the elapsed duration increases by N minutes.
2. WHEN an Adjust_Button with offset −N is pressed, THE ActiveTimersPanel SHALL add N minutes to the timer entry's `startTime` so that the elapsed duration decreases by N minutes.
3. THE Adjust_Button SHALL use the `.fulcrum-timer-btn-adjust` CSS class for consistent styling with the inline timer widget.
4. IF an Adjust_Button press would result in a `startTime` later than the current time, THEN THE ActiveTimersPanel SHALL disable or prevent that adjustment to avoid negative elapsed durations.
5. WHEN an Adjust_Button press modifies `startTime`, THE ActiveTimersPanel SHALL persist the updated `startTime` to the note file immediately.

### Requirement 4: Right Info Column

**User Story:** As a user, I want to see the timer label prominently with the note name below it, so that I can identify which task and file a timer belongs to.

#### Acceptance Criteria

1. THE Active_Timer_Row SHALL display Timer_Label on line 1 of the right info column using Accent_Color and a larger font weight.
2. THE Active_Timer_Row SHALL display Note_Name on line 2 of the right info column using a smaller font size and muted text color.
3. THE Active_Timer_Row SHALL use the `.fulcrum-timer-right-column` CSS class for the info column layout.
4. WHEN Timer_Label is empty or undefined, THE Active_Timer_Row SHALL display Note_Name on line 1 using Accent_Color styling instead.

### Requirement 5: Stop Button Styling

**User Story:** As a user, I want the stop button to be a filled accent-colored circle with a white icon, so that it is visually prominent and matches the play button design of the inline widget.

#### Acceptance Criteria

1. THE Stop_Button SHALL render with Accent_Color as its background fill color.
2. THE Stop_Button SHALL display a white-colored stop icon (square icon).
3. THE Stop_Button SHALL use a circular shape consistent with the `.fulcrum-timer-button-play` styling pattern (border-radius 50%).
4. WHEN Stop_Button is pressed, THE ActiveTimersPanel SHALL stop the associated timer entry and remove the row from the display.

### Requirement 6: Scope Constraint

**User Story:** As a developer, I want the restyle limited to ActiveTimersPanel and FloatingTimersView only, so that other timer surfaces remain unchanged.

#### Acceptance Criteria

1. THE ActiveTimersPanel SHALL apply the new row layout in the docked leaf view.
2. THE FloatingTimersView SHALL display the same restyled row layout via `mountFloatingTimersHud`.
3. THE restyle SHALL NOT modify rendering or styles for `TaskCardTimerSlot.svelte`.
4. THE restyle SHALL NOT modify rendering or styles for `TimelineActiveTimerBlock.svelte`.

### Requirement 7: CSS Class Reuse

**User Story:** As a developer, I want existing inline timer widget CSS classes reused where possible, so that the codebase remains consistent and avoids redundant styles.

#### Acceptance Criteria

1. THE Timer_Display_Box SHALL reference the `.fulcrum-timer-timer-container` CSS class from the existing inline widget styles.
2. THE right info column SHALL reference the `.fulcrum-timer-right-column` CSS class from the existing inline widget styles.
3. THE Adjust_Buttons SHALL reference the `.fulcrum-timer-btn-adjust` CSS class from the existing inline widget styles.
4. THE elapsed time text SHALL reference the `.fulcrum-timer-timer-display` CSS class from the existing inline widget styles.
5. WHERE new CSS rules are needed for active-timer-specific layout, THE plugin.css SHALL define them under the existing `/* Active Timers Widget Styles */` section.

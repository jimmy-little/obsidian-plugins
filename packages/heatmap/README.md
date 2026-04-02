# @obsidian-suite/heatmap

GitHub-style **contribution heatmap**: 7 rows (weekdays) × ~52 columns (weeks), **today** back **365** local days (default). Shared by **Orbit**, **Fulcrum**, **Pulse**, and **Ratchet**.

## Usage

1. **Merge CSS** — `heatmap.css` is included by `tooling/merge-css.mjs` (after tokens) in each plugin build.
2. **Data** — `Map` or record of `YYYY-MM-DD` → count, or pass timestamps via `countsFromTimestamps`.
3. **Accent** — set `accentColor` on `createHeatmapElement` (e.g. person `color:` frontmatter, project accent).

```ts
import {
	buildHeatmapGrid,
	countsFromTimestamps,
	createHeatmapElement,
} from "@obsidian-suite/heatmap";

const counts = countsFromTimestamps(interactionDatesMs);
const grid = buildHeatmapGrid(counts, {
	firstDayOfWeek: 1, // Monday first; 0 = Sunday
	intensity: "relative", // optional: scale buckets to max in range
});
const filesByDay = new Map<string, {path: string; title: string}[]>(); // dateKey → files
const el = createHeatmapElement(grid, {
	accentColor: "#2d7a4d",
	ariaLabel: "Interactions in the last year",
	filesByDay,
	onDayClick: ({dateKey, files}) => {
		/* open a modal or navigate */
	},
});
container.appendChild(el);
```

Weekday letters (**M T W T F S S**) and month labels (**Jan**, **Feb**, …) are rendered automatically. Pass **`onDayClick`** to make day cells keyboard- and mouse-activable; use **`filesByDay`** when the callback should list vault paths for that day.

Helpers for custom UIs: **`computeMonthLabels`**, **`dowAbbreviationsForRows`**, **`findColumnIndexForDate`**.

## Options

| Option | Description |
|--------|-------------|
| `firstDayOfWeek` | `0` = Sunday … `6` = Saturday. Top row = first weekday. |
| `daysBack` | Default `364` → **365** inclusive days ending today. |
| `intensity` | `"fixed"` (default) or `"relative"` (thresholds from max count). |
| `accentColor` | CSS color; drives `--suite-heatmap-accent` on the root. |
| `filesByDay` | Optional `Map` of date → `{ path, title }` for click details. |
| `onDayClick` | If set, in-range days become buttons (click / Enter / Space). |
| `locale` | Optional BCP 47 tag for month abbreviations. |

## Integrations (intended)

- **Orbit** — one interaction per linked note per day can increment the day count (activity feed).
- **Fulcrum** — project activity / indexed activity dates.
- **Pulse** — days with logged exercises.
- **Ratchet** — days a habit was completed.

# Pulse

Health and workout **import** plugin for Obsidian: brings Auto Export, Workouts CSV, **Gravl** exports, and related files into markdown notes, with **read-only** history and stats in the Pulse view.

## URL schemes (Obsidian URI)

**Plugin id (URI host):** `pulse` · **Query:** `screen=<Pulse tab>` (alias `mode` or `leaf`). Optionally `path=<vault-path>`.

**Pattern:** `obsidian://pulse?screen=<name>&path=<optional-vault-path>`

Do not use `?action=open` — the host must be `pulse`, not `open`.

| Conceptual route | Notes |
|------------------|--------|
| `/pulse/history` | Default when `screen` is omitted |
| `/pulse/today` | `screen=today` — Home (import CTA) |
| `/pulse/program` | `screen=program` — alias **`screen=programs`** |
| `/pulse/stats` | `screen=stats` |
| `/pulse/exercise` | `screen=exercise` |
| `/pulse/session` | `screen=session` |

Other accepted `screen` values (mostly legacy): `workout-edit` (read-only; use `path=`), `new-exercise`, `workout-builder`, `program-builder`, `edit-program`.

**Alternate:** `route=%2Fpulse%2Fhistory`.

Details and examples: **Settings → Pulse → URL schemes**.

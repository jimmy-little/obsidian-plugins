# Pulse

Workout tracker and health import plugin for Obsidian.

## URL schemes (Obsidian URI)

**Plugin id (URI host):** `pulse` · **Query:** `screen=<Pulse tab>` (alias `mode` or `leaf`). Optionally `path=<vault-path>`.

**Pattern:** `obsidian://pulse?screen=<name>&path=<optional-vault-path>`

Do not use `?action=open` — the host must be `pulse`, not `open`.

| Conceptual route | Notes |
|------------------|--------|
| `/pulse/today` | Default when `screen` is omitted |
| `/pulse/program` | `screen=program` — alias **`screen=programs`** |
| `/pulse/stats` | `screen=stats` |
| `/pulse/history` | `screen=history` |
| `/pulse/exercise` | `screen=exercise` |
| `/pulse/session` | `screen=session` |

Other valid `screen` values: `new-exercise`, `workout-builder`, `program-builder`, `edit-program`, `workout-edit`. Use `path=` when a mode needs a vault path.

**Alternate:** `route=%2Fpulse%2Ftoday`.

Details and examples: **Settings → Pulse → URL schemes**.

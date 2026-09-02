# Fulcrum Bridge

Companion macOS app that exposes Apple **Reminders**, **Calendar**, and **OmniFocus** to the Fulcrum Obsidian plugin over a local HTTP API.

Default URL: `http://127.0.0.1:9247`

Configure in **Fulcrum → Settings → Integrations → Calendar integration** (bridge URL) and pick Forecast calendars with the **gear** icon in the Tasks (Forecast) view.

## Install

Requires **Xcode** (not Command Line Tools alone). If `swift build` fails, point `xcode-select` at Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

```bash
cd plugins/fulcrum-bridge
./build.sh
.build/release/FulcrumBridge
```

Or manually:

```bash
cd plugins/fulcrum-bridge
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release
.build/release/FulcrumBridge
```

Keep the process running while Obsidian is open.

### Menu bar

Fulcrum Bridge shows a **pyramid** icon in the menu bar (no Dock icon). Click it for:

- **Health Check…** — status, calendar count, and Reminders/Calendar authorization
- **Restart Bridge** — stops and restarts the HTTP server on port 9247
- **Kill Bridge** — quits the app (if installed as a LaunchAgent with `KeepAlive`, launchd will start it again shortly)

**Recommended first run** (Calendar permission dialog appears reliably for app bundles):

```bash
cd plugins/fulcrum-bridge
./build.sh
pkill -x FulcrumBridge 2>/dev/null || true   # stop any stale copy on port 9247
open .build/FulcrumBridge.app
```

Approve **Reminders** and **Calendar** when macOS prompts. The app runs headless (no Dock icon).

CLI alternative (Reminders may work; Calendar often stays `notDetermined` without the `.app`):

```bash
.build/release/FulcrumBridge
```

### Permissions

On first launch, macOS prompts for **Reminders** and **Calendar** access. Both are required for full functionality.

**Port 9247 already in use?** Only one bridge can run at a time:

```bash
pkill -x FulcrumBridge
# or: lsof -i :9247
```

**Calendar stuck at `notDetermined`?** Use the app bundle, not the bare binary:

```bash
pkill -x FulcrumBridge 2>/dev/null || true
open .build/FulcrumBridge.app
```

If you denied access:

1. Open **System Settings → Privacy & Security → Reminders** and enable **FulcrumBridge**.
2. Open **System Settings → Privacy & Security → Calendars** and enable **FulcrumBridge**.
3. Restart FulcrumBridge.

**Permission dialog did not appear?** Run the binary from **Terminal.app** (not an embedded IDE terminal). macOS often suppresses TCC prompts from background shells. After rebuilding, you should see:

```
Fulcrum Bridge permissions: reminders=..., calendar=...
```

If calendar stays `notDetermined`, use System Settings manually.

Verify with:

```bash
curl -s http://127.0.0.1:9247/health | python3 -m json.tool
```

Expect `"ok": true` and calendar/reminders authorized in `"authorization"`.

### Run as a daemon (recommended)

After permissions work once via `open .build/FulcrumBridge.app`, install a **LaunchAgent** that starts at login and restarts if the process exits or crashes:

```bash
cd plugins/fulcrum-bridge
./install-daemon.sh
```

This installs `~/Applications/FulcrumBridge.app` and registers `~/Library/LaunchAgents/com.fulcrum.bridge.plist` with `KeepAlive`.

Logs: `~/Library/Logs/FulcrumBridge/stdout.log` and `stderr.log`

```bash
# Restart manually
launchctl kickstart -k gui/$(id -u)/com.fulcrum.bridge

# Stop and remove daemon (keeps app bundle)
./uninstall-daemon.sh

# Stop and remove daemon + app
./uninstall-daemon.sh --purge-app
```

Re-install after code changes: `./install-daemon.sh` (rebuilds and replaces the installed app).

## Fulcrum usage

| Feature | Where |
|---------|--------|
| System calendars in **Forecast** | Tasks view → gear icon → calendar picker (`forecastCalendarIds`) |
| Calendar overlay in **Calendar** view | Settings → Integrations → Reminders bridge → Calendar overlay IDs |
| Reminders live views / convert | Settings → Integrations → Reminders bridge |
| OmniFocus two-way sync | Settings → Integrations → OmniFocus sync |

Forecast calendar IDs and Calendar view overlay IDs are **independent**.

### OmniFocus

OmniFocus has no public REST API. The bridge drives the Mac app with Omni Automation (`evaluateJavascript` via `osascript`). OmniFocus must be **running**. Typical requirements: OmniFocus Pro, and **System Settings → Privacy & Security → Automation** allowing Fulcrum Bridge to control OmniFocus.

Probe without mutating data:

```bash
osascript -l JavaScript plugins/fulcrum-bridge/scripts/omnifocus-spike.js
curl -s http://127.0.0.1:9247/omnifocus/health | python3 -m json.tool
```

Cursor agents should use the bundled MCP (`plugins/fulcrum-bridge/mcp/omnifocus-mcp.mjs`), configured in `.cursor/mcp.json`. It talks to this HTTP API only — do not attach a second OmniFocus MCP while Fulcrum sync owns IDs.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{ ok, status, authorization, calendarCount, omnifocus }` |
| GET | `/omnifocus/health` | OmniFocus installed/running/OmniJS probe |
| GET | `/omnifocus/projects` | `{ "projects": [{ "id", "name", "status", "folder", "sequential" }] }` |
| POST | `/omnifocus/projects` | Create project `{ "name" }` → `{ "id" }` |
| GET | `/omnifocus/tasks?projectId=&projectIds=&inbox=&completed=` | `{ "tasks": [...] }` (`projectIds` is comma-separated) |
| POST | `/omnifocus/tasks` | Create task `{ "name", "due", "defer", "projectId", "note", "flagged", "tags" }` → `{ "id" }` |
| PATCH | `/omnifocus/tasks/:id` | Update name/due/defer/completed/projectId/note/flagged |
| POST | `/omnifocus/tasks/:id/complete` | Mark complete |
| POST | `/omnifocus/tasks/:id/reopen` | Mark incomplete |
| POST | `/omnifocus/sync` | JXA `Application("OmniFocus").synchronize()` |
| GET | `/lists` | `{ "lists": [{ "id", "name" }] }` |
| POST | `/lists` | Create list `{ "name": "..." }` → `{ "listId" }` |
| GET | `/reminders` | `{ "reminders": [...] }` |
| POST | `/reminders` | Create reminder (JSON body) |
| POST | `/reminders/:id/complete` | Mark done |
| POST | `/reminders/:id/reopen` | Mark incomplete |
| PATCH | `/reminders/:id` | Edit notes (JSON body) |
| DELETE | `/reminders/:id` | Delete reminder |
| GET | `/calendars` | `{ "calendars": [...] }` |
| GET | `/events?from=&to=&calendarId=` | Calendar events in range |

Fulcrum falls back to **remctl** for Reminders when the HTTP bridge is unreachable.

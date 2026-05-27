# Fulcrum Companion

Native Mac and iOS companion for [Fulcrum](https://github.com/) time tracking. Reads and writes `Fulcrum/.widget-bridge.json` in your Obsidian vault (synced via iCloud). The Fulcrum Obsidian plugin reconciles `pendingCommands` into note frontmatter when Obsidian is open.

## Requirements

- Xcode 15+ (iOS 17 / macOS 14 for App Intents widgets)
- Apple Developer account (for device widgets and App Groups)
- Obsidian vault on disk (iCloud Drive recommended)
- Fulcrum plugin with **Widget companion** enabled

## Generate the Xcode project

```bash
brew install xcodegen   # one-time; skip if already installed
cd /Users/Jimmy.Little/Documents/GitHub/obsidian-plugins/companion/FulcrumCompanion
xcodegen generate
open FulcrumCompanion.xcodeproj
```

If `xcodegen` is not found, open a **new** Terminal window after `brew install` (or run `hash -r`).

In Xcode:

1. Top toolbar **scheme** → choose **FulcrumCompanion (macOS)** (not the widget-only target).
2. **Destination** → **My Mac**.
3. Sign these targets (Signing & Capabilities → Team):
   - **FulcrumCompanion_macOS**
   - **FulcrumWidgetsExtension_macOS**
   - (For iPhone: **FulcrumCompanion_iOS** and **FulcrumWidgetsExtension_iOS**)
3. Update App Group `group.com.fulcrum.companion` in both entitlements if you change the bundle prefix (must match `AppGroupStore.suiteName` in code).

## First run

1. Build and run **FulcrumCompanion** on Mac or iPhone.
2. Tap **Choose vault folder** and select your Obsidian vault root (the folder that contains `Fulcrum/` and your notes).
3. Open Obsidian and reload Fulcrum so the bridge file exists.
4. Add **Fulcrum** widgets from the widget gallery (Home Screen / Lock Screen / macOS Notification Center).

## Architecture

```text
Widget (App Intent) → App Group cache (fast UI)
                  → vault bridge JSON (pendingCommands)
Obsidian + Fulcrum plugin → reconcile → note frontmatter
```

## Bundle IDs (default)

| Target | Bundle ID |
|--------|-----------|
| App | `com.fulcrum.companion` |
| Widget | `com.fulcrum.companion.widgets` |

## Troubleshooting

- **Empty active timers in app but running in Obsidian:** Open Obsidian once so Fulcrum publishes the bridge; tap **Refresh** in the companion app.
- **Commands not applied:** Obsidian must open the vault so the plugin can reconcile `pendingCommands`.
- **Wrong bridge file:** Fulcrum settings → Timer → Widget companion → path (default `Fulcrum/.widget-bridge.json`).

# Orbit

People and relationships: profile view, org chart, activity feed.

## URL schemes (Obsidian URI)

**Plugin id (URI host):** `orbit`.

**Pattern:** `obsidian://orbit?screen=<name>&…`

| Conceptual route | Parameters |
|------------------|------------|
| `/orbit/home` | `screen=home` or `screen=main` (default) |
| `/orbit/org-chart` | `screen=org-chart` — optional `anchorPath=<person-note-path>` |
| `/orbit/person` | `screen=person` — required `path=` or `personPath=` (vault path to note) |

**Alternate:** `route=%2Forbit%2Fhome`.

See **Settings → Orbit → URL schemes**.

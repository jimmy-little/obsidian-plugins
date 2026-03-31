# Obsidian plugins (monorepo)

npm workspaces containing **Pulse**, **Lapse**, **Ratchet**, **Fulcrum**, **CRM**, and shared packages (`@obsidian-suite/*`).

## Setup

```bash
cd obsidian-plugins
npm install
```

## Build

Build all plugins:

```bash
npm run build
```

Build one plugin:

```bash
npm run build -w obsidian-plugin-pulse
```

## Install into a vault (no symlinks)

Set your vault path, then:

```bash
export OBSIDIAN_VAULT_PATH="/path/to/your/vault"
npm run build:install -w obsidian-plugin-pulse
```

Copies `main.js`, `manifest.json`, and `styles.css` into  
`.obsidian/plugins/<plugin-id>/`.

## Release (per plugin)

From repo root (requires [GitHub CLI](https://cli.github.com/) `gh`):

```bash
npm run release -w obsidian-plugin-pulse -- 0.0.2
```

Tags use the form `<plugin-id>-v<version>` (e.g. `pulse-v0.0.2`) so releases do not collide in this monorepo.

## BRAT

Use the **same GitHub repo** with a **plugin subfolder** per plugin, e.g. `plugins/pulse`, `plugins/lapse`, etc.

## Git

```bash
git init
git add .
git commit -m "chore: initial monorepo scaffold"
```

Connect your remote as usual (`git remote add origin …`).

## Fulcrum

The **Fulcrum** plugin is ported from the standalone `obsidian-fulcrum` repo: full `src/` (views, Svelte UI, `VaultIndex`, settings, modals). Styles live in `plugins/fulcrum/src/plugin.css` and are merged with shared tokens into `styles.css` at build.

`src/fulcrum/openViews.ts` uses `claimLeaf` from `@obsidian-suite/core`.

Build / install:

```bash
npm run build -w obsidian-plugin-fulcrum
export OBSIDIAN_VAULT_PATH="/path/to/vault"
npm run build:install -w obsidian-plugin-fulcrum
```

### Shared theme (`packages/theme`)

- **`tokens.css`** — CSS variables (spacing, **sidebar glyph touch targets** `--suite-glyph-*`).
- **`shell.css`** — Shared layout helpers (e.g. `.suite-glyph-btn`, Fulcrum ProjectManager glyph row). Merged **after** each plugin’s `src/plugin.css` so suite rules win.

Tune icon row size globally by editing `--suite-glyph-btn-size` and `--suite-glyph-icon-size` in `tokens.css`.

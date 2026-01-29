# Enshrouded Crafting Index

Static site (GitHub Pages) to search and browse Enshrouded crafting recipes. Data is fetched from the wiki’s [Data:Crafting_Recipes.json](https://enshrouded.wiki.gg/wiki/Data:Crafting_Recipes.json?action=raw&ctype=application/json).

## Local development

1. **Fetch data** (writes to `data/`, copies latest to `public/items.json`):
   ```bash
   npm run scrape
   ```
2. **Run dev server** (copies data then starts Next.js):
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Build (static export, no backend)

- **Local / same-origin**: `npm run build` → output in `out/`.
- **GitHub Pages** (repo subpath): set base path and build:
  ```bash
  NEXT_PUBLIC_BASE_PATH=/enshrouded-crafting-index npm run build
  ```
  Or use the script: `npm run build:gh` (uses `/enshrouded-crafting-index`; change in `package.json` if your repo name differs).

The site loads `/items.json` in the browser (no API). That file is maintained by a daily cron job (see below).

## Deploy to GitHub Pages

1. In the repo: **Settings → Pages → Build and deployment**: choose **GitHub Actions**.
2. Push to `main`. The workflow (`.github/workflows/deploy.yml`) will:
   - Use the committed `public/items.json` (or fetch once if missing)
   - Build the static export with the correct base path
   - Deploy the `out/` folder to GitHub Pages

The site will be at `https://<user>.github.io/<repo>/`. Ensure `NEXT_PUBLIC_BASE_PATH` in the workflow matches your repo name (see `deploy.yml`).

## Daily data update (cron)

The workflow **Update crafting data** (`.github/workflows/update-data.yml`) runs **daily at 12:00 UTC** (and can be run manually via **Actions → Update crafting data → Run workflow**). It:

1. Fetches the wiki JSON
2. **Validates** it (must be a non-empty array of recipe objects with `CraftedItem`). If invalid, the workflow **fails and does not commit** — the existing `public/items.json` stays as-is.
3. If valid: copies to `public/items.json`, commits and pushes. That push triggers the deploy workflow so the site is updated.

So the GitHub Pages site always serves the latest valid data; bad fetches are never committed.

## Project layout

- `app/` – Next.js App Router (page, layout, types)
- `data/` – Scraper output (`crafted-items-<timestamp>.json`); gitignored
- `public/` – Static assets; `items.json` is committed by the update-data workflow and used by the site
- `scraper/` – Fetches `Data:Crafting_Recipes.json` from the wiki; writes to `data/` only when JSON is valid
- `scripts/copy-data.js` – Copies latest `data/crafted-items-*.json` → `public/items.json`

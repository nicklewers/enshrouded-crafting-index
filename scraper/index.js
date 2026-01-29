/**
 * Fetches crafting recipes JSON from the Enshrouded wiki Data namespace (raw).
 * Writes to data/crafted-items-<ISO8601>.json (or OUTPUT_PATH).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(REPO_ROOT, "data");

const DATA_URL =
  "https://enshrouded.wiki.gg/wiki/Data:Crafting_Recipes.json?action=raw&ctype=application/json";

function isoFilename() {
  const d = new Date();
  return d.toISOString().replace(/:/g, "-").slice(0, 19);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("[scraper] data dir:", DATA_DIR);
}

/**
 * Fetch raw JSON from wiki Data: page.
 * @returns {unknown} Parsed JSON (array or object).
 */
async function fetchCraftingRecipes() {
  console.log("[scraper] URL:", DATA_URL);

  const res = await fetch(DATA_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "EnshroudedCraftingIndex/1.0 (https://github.com/enshrouded-crafting-index)",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}. First 200 chars: ${text.slice(0, 200)}`);
  }

  if (data === null || typeof data !== "object") {
    throw new Error("Response is not a JSON object or array");
  }

  return data;
}

function normalizeToArray(data) {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const values = Object.values(data);
    if (values.every(Array.isArray)) return values.flat();
    return values;
  }
  return [];
}

/**
 * Returns true only if data looks like valid crafting recipes (array of objects with CraftedItem).
 * If invalid, do not export — keep existing JSON.
 */
function isValidRecipeData(data) {
  const items = normalizeToArray(data);
  if (!Array.isArray(items) || items.length === 0) return false;
  const first = items[0];
  if (!first || typeof first !== "object") return false;
  if (typeof first.CraftedItem !== "string" || !first.CraftedItem.trim()) return false;
  return true;
}

async function main() {
  const outputPath =
    process.env.OUTPUT_PATH || path.join(DATA_DIR, `crafted-items-${isoFilename()}.json`);

  ensureDataDir();

  const data = await fetchCraftingRecipes();

  if (!isValidRecipeData(data)) {
    console.error("[scraper] Validation failed: not a non-empty array of recipe objects with CraftedItem. Skipping export.");
    process.exit(1);
  }

  const items = normalizeToArray(data);
  const count = Array.isArray(data) ? data.length : items.length;
  console.log("[scraper] item count:", count);

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
  console.log("[scraper] wrote:", outputPath);
}

main().catch((err) => {
  console.error("[scraper] error:", err.message);
  process.exit(1);
});

/**
 * Reads the latest data/crafted-items-*.json, optimizes for the frontend, and writes
 * public/items.json: minified, { crafters, items }, items pre-sorted by CraftedItem, short keys.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const publicDir = path.join(repoRoot, "public");
const outFile = path.join(publicDir, "items.json");

const SHORT_KEYS = {
  CraftedItem: "n",
  Crafter: "c",
  Workshop: "w",
  Workshop2: "w2",
  CraftedQuantity: "q",
  SourceItem: "s",
  SourceQuantity: "sq",
};

function shorten(item) {
  const out = {};
  if (item.CraftedItem != null) out.n = item.CraftedItem;
  if (item.Crafter != null) out.c = item.Crafter;
  if (item.Workshop != null) out.w = item.Workshop;
  if (item.Workshop2 != null) out.w2 = item.Workshop2;
  if (item.CraftedQuantity != null) out.q = item.CraftedQuantity;
  if (item.SourceItem != null) out.s = item.SourceItem;
  if (item.SourceQuantity != null) out.sq = item.SourceQuantity;
  return out;
}

if (!fs.existsSync(dataDir)) {
  console.warn("[copy-data] data/ not found. Run npm run scrape first.");
  process.exit(0);
}

const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("crafted-items-") && f.endsWith(".json"));
if (files.length === 0) {
  console.warn("[copy-data] No crafted-items-*.json in data/. Run npm run scrape first.");
  process.exit(0);
}

files.sort();
const latestPath = path.join(dataDir, files[files.length - 1]);
const raw = fs.readFileSync(latestPath, "utf8");
const data = JSON.parse(raw);
const items = Array.isArray(data) ? data : Object.values(data).flat();

const crafters = [...new Set(items.map((r) => r.Crafter).filter(Boolean))].sort();
const sorted = [...items].sort((a, b) => (a.CraftedItem ?? "").localeCompare(b.CraftedItem ?? ""));
const shortItems = sorted.map(shorten);

const payload = { crafters, items: shortItems };
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(payload), "utf8");
console.log("[copy-data] wrote", outFile, "(minified, crafters + items, pre-sorted)");

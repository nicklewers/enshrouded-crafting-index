/**
 * Copies the latest data/crafted-items-*.json to public/items.json
 * so the static export (GitHub Pages) can serve it. Run before build.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const publicDir = path.join(repoRoot, "public");
const outFile = path.join(publicDir, "items.json");

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
const latest = path.join(dataDir, files[files.length - 1]);
fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(latest, outFile);
console.log("[copy-data] copied", path.basename(latest), "-> public/items.json");

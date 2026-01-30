"use client";

import { useEffect, useMemo, useState, useCallback, useRef, startTransition } from "react";
import Fuse from "fuse.js";
import type { CraftingRecipe } from "@/app/types/items";

type SortKey = "CraftedItem" | "Crafter" | "Workshop";
type SortDir = "asc" | "desc";

const WIKI_API = "https://enshrouded.wiki.gg/api.php";

type ObtainingState = { text: string } | "loading" | { error: string } | { noSection: true };

/** True if element is a heading (H1–H6). */
function isHeading(el: Element): boolean {
  return /^H[1-6]$/.test(el.tagName);
}

/** Strip to only the Obtaining intro: find Obtaining heading, take content until next heading (any level), plain text. */
function stripObtainingToPlainText(html: string): string {
  if (typeof document === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body.querySelector(".mw-parser-output") ?? doc.body;
  const obtainingHeadline =
    root.querySelector("#Obtaining") ?? root.querySelector('span.mw-headline[id="Obtaining"]');
  if (!obtainingHeadline) {
    const firstHeading = root.querySelector("h1, h2, h3, h4, h5, h6");
    if (firstHeading) {
      const parts: string[] = [];
      let el: Element | null = firstHeading.nextElementSibling;
      while (el && !isHeading(el)) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text) parts.push(text);
        el = el.nextElementSibling;
      }
      return parts.join("\n\n").replace(/\n{2,}/g, "\n\n").trim();
    }
    return "";
  }
  const h2 = obtainingHeadline.closest("h2");
  if (!h2) return "";
  const parts: string[] = [];
  let el: Element | null = h2.nextElementSibling;
  while (el && !isHeading(el)) {
    const text = (el as HTMLElement).innerText?.trim();
    if (text) parts.push(text);
    el = el.nextElementSibling;
  }
  return parts.join("\n\n").replace(/\n{2,}/g, "\n\n").trim();
}

/** Fetch "Obtaining" section if it exists. Returns null when the page has no Obtaining section (e.g. craft-only). */
async function fetchObtainingSection(itemName: string): Promise<string | null> {
  const pageName = itemName.replace(/\s+/g, "_");
  const sectionsUrl = `${WIKI_API}?${new URLSearchParams({ action: "parse", page: pageName, prop: "sections", format: "json", origin: "*" })}`;
  const sectionsRes = await fetch(sectionsUrl);
  if (!sectionsRes.ok) throw new Error(`Sections: ${sectionsRes.status}`);
  const sectionsData = await sectionsRes.json();
  if (sectionsData.error) throw new Error(sectionsData.error.info || sectionsData.error.code);
  const sections: { line?: string; index?: string }[] = sectionsData.parse?.sections ?? [];
  const obtaining = sections.find((s) => (s.line ?? "").toLowerCase() === "obtaining");
  if (!obtaining) return null;
  const sectionIndex = obtaining.index ?? "0";
  const textUrl = `${WIKI_API}?${new URLSearchParams({ action: "parse", page: pageName, prop: "text", section: sectionIndex, format: "json", origin: "*" })}`;
  const textRes = await fetch(textUrl);
  if (!textRes.ok) throw new Error(`Text: ${textRes.status}`);
  const textData = await textRes.json();
  if (textData.error) throw new Error(textData.error.info || textData.error.code);
  const html = textData.parse?.text?.["*"];
  if (typeof html !== "string") throw new Error("No content");
  return html;
}

/** Expands short-key payload from copy-data.js into CraftingRecipe shape. */
function expandItem(short: Record<string, unknown>): CraftingRecipe {
  return {
    CraftedItem: (short.n as string) ?? "",
    Crafter: (short.c as string) ?? "",
    Workshop: (short.w as string | null) ?? null,
    Workshop2: (short.w2 as string | null) ?? null,
    CraftedQuantity: (short.q as string) ?? "",
    SourceItem: (short.s as string[]) ?? [],
    SourceQuantity: (short.sq as number[]) ?? [],
  };
}

function useItems() {
  const [items, setItems] = useState<CraftingRecipe[]>([]);
  const [crafters, setCrafters] = useState<string[] | null>(null);
  const [workshops, setWorkshops] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const url = base ? `${base}/items.json` : "/items.json";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "No data. Run npm run scrape and npm run build." : "Failed to load");
        return r.json();
      })
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setItems(data as CraftingRecipe[]);
          setCrafters(null);
          setWorkshops(null);
          return;
        }
        const payload = data as { crafters?: string[]; workshops?: string[]; items?: Record<string, unknown>[] };
        if (payload?.items) {
          setItems(payload.items.map(expandItem));
          setCrafters(payload.crafters ?? null);
          setWorkshops(payload.workshops ?? null);
        } else {
          setItems([]);
          setCrafters(null);
          setWorkshops(null);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { items, crafters, workshops, loading, error };
}

function SearchInput({
  value,
  onChange,
  placeholder = "Search by item name…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  // Only sync from parent when parent clears (e.g. external reset). Otherwise we’d overwrite
  // the user’s typing when the debounced parent state arrives and cause dropped keystrokes.
  useEffect(() => {
    if (value === "") setLocal("");
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => onChange(local), 180);
    return () => clearTimeout(t);
  }, [local, onChange]);

  return (
    <input
      type="search"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      aria-label="Search"
    />
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function RecipeCard({
  recipe,
  onCardClick,
  onCrafterClick,
  onWorkshopClick,
  onIngredientClick,
  craftableNames,
}: {
  recipe: CraftingRecipe;
  onCardClick?: (recipe: CraftingRecipe) => void;
  onCrafterClick?: (crafter: string) => void;
  onWorkshopClick?: (workshop: string) => void;
  onIngredientClick?: (name: string, parentRecipe: CraftingRecipe) => void;
  craftableNames?: Set<string>;
}) {
  const ingredients = recipe.SourceItem.map((name, i) => ({
    name,
    qty: recipe.SourceQuantity[i] ?? 1,
  }));

  const content = (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold text-[var(--text)]">{recipe.CraftedItem}</h2>
        <span className="text-sm text-[var(--muted)]">×{recipe.CraftedQuantity}</span>
        {onCardClick && (
          <span className="ml-auto text-[var(--muted)] opacity-70" aria-hidden>
            <InfoIcon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {recipe.Crafter ? (
          onCrafterClick ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCrafterClick(recipe.Crafter); }}
              className="mr-2 rounded bg-[var(--border)] px-2 py-0.5 text-[var(--text)] hover:bg-[var(--accent-dim)] hover:text-white"
            >
              {recipe.Crafter}
            </button>
          ) : (
            <span className="mr-2 rounded bg-[var(--border)] px-2 py-0.5 text-[var(--text)]">{recipe.Crafter}</span>
          )
        ) : null}
        {recipe.Workshop ? (
          onWorkshopClick ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onWorkshopClick(recipe.Workshop!); }}
              className="rounded bg-[var(--border)] px-2 py-0.5 text-[var(--muted)] hover:bg-[var(--accent-dim)] hover:text-white"
            >
              {recipe.Workshop}
            </button>
          ) : (
            <span className="rounded bg-[var(--border)] px-2 py-0.5 text-[var(--muted)]">{recipe.Workshop}</span>
          )
        ) : null}
      </div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Ingredients</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-[var(--muted)]">
        {ingredients.map((ing, i) => {
          const isCraftable = craftableNames?.has(ing.name) && onIngredientClick;
          return (
            <li key={i}>
              {isCraftable ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onIngredientClick(ing.name, recipe); }}
                  className="text-left text-[var(--accent)] hover:underline"
                >
                  {ing.name} ×{ing.qty}
                </button>
              ) : (
                <span>{ing.name} ×{ing.qty}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  if (onCardClick) {
    const openPanel = () => onCardClick(recipe);
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={openPanel}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            openPanel();
            if (!(e.target as Element).closest("button")) e.preventDefault();
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(); } }}
        className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:border-[var(--accent-dim)] hover:bg-[var(--surface)]/95 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      >
        {content}
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:border-[var(--accent-dim)]">
      {content}
    </article>
  );
}

function ObtainingBlock({
  itemName,
  state,
  onRetry,
}: {
  itemName: string;
  state: ObtainingState | undefined;
  onLoad: (itemName: string) => void;
  onRetry: (itemName: string) => void;
}) {
  if (typeof state === "object" && state && "error" in state) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
        <p className="text-[var(--muted)]">{state.error}</p>
        <button
          type="button"
          onClick={() => onRetry(itemName)}
          className="mt-2 text-xs text-[var(--accent)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }
  if (typeof state === "object" && state && "text" in state) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Obtaining</p>
        <div className="max-h-40 overflow-y-auto whitespace-pre-line text-sm text-[var(--text)]">
          {state.text}
        </div>
      </div>
    );
  }
  return null;
}

function SidePanel({
  stack,
  craftableByName,
  obtainingByItem,
  onIngredientClick,
  onFetchObtaining,
  onPopToIndex,
  onClose,
}: {
  stack: CraftingRecipe[];
  craftableByName: Map<string, CraftingRecipe>;
  obtainingByItem: Record<string, ObtainingState>;
  onIngredientClick: (name: string, parentRecipe: CraftingRecipe) => void;
  onFetchObtaining: (itemName: string) => void;
  onPopToIndex: (index: number) => void;
  onClose: () => void;
}) {
  if (stack.length === 0) return null;
  const current = stack[stack.length - 1];
  const craftableNames = useMemo(() => new Set(craftableByName.keys()), [craftableByName]);
  const obtainingState = obtainingByItem[current.CraftedItem];

  useEffect(() => {
    if (obtainingState === undefined) onFetchObtaining(current.CraftedItem);
  }, [current.CraftedItem, obtainingState, onFetchObtaining]);

  const showObtaining =
    obtainingState &&
    typeof obtainingState === "object" &&
    ("text" in obtainingState || "error" in obtainingState);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          {stack.map((r, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-[var(--muted)]">›</span>}
              <button
                type="button"
                onClick={() => i < stack.length - 1 && onPopToIndex(i)}
                className={
                  "truncate hover:underline " +
                  (i === stack.length - 1 ? "font-medium text-[var(--text)]" : "text-[var(--muted)]")
                }
              >
                {r.CraftedItem}
              </button>
            </span>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          {stack.length > 1 ? (
            <button
              type="button"
              onClick={() => onPopToIndex(stack.length - 2)}
              className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
            aria-label="Close panel"
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <RecipeCard
          recipe={current}
          onIngredientClick={onIngredientClick}
          craftableNames={craftableNames}
        />
        {showObtaining && (
          <ObtainingBlock
            itemName={current.CraftedItem}
            state={obtainingState}
            onLoad={onFetchObtaining}
            onRetry={onFetchObtaining}
          />
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { items, crafters: craftersFromData, workshops: workshopsFromData, loading, error } = useItems();
  const [query, setQuery] = useState("");
  const [crafterFilter, setCrafterFilter] = useState("All");
  const [workshopFilter, setWorkshopFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("CraftedItem");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [panelStack, setPanelStack] = useState<CraftingRecipe[]>([]);
  const [obtainingByItem, setObtainingByItem] = useState<Record<string, ObtainingState>>({});
  const filterSectionRef = useRef<HTMLDivElement>(null);

  const fetchObtaining = useCallback((itemName: string) => {
    startTransition(() => {
      setObtainingByItem((prev) => {
        const cur = prev[itemName];
        if (cur === "loading") return prev;
        if (cur && ("text" in cur || "noSection" in cur)) return prev;
        return { ...prev, [itemName]: "loading" };
      });
    });
    fetchObtainingSection(itemName)
      .then((html) => {
        if (html === null) {
          return setObtainingByItem((prev) => ({ ...prev, [itemName]: { noSection: true as const } }));
        }
        const text = stripObtainingToPlainText(html);
        setObtainingByItem((prev) => ({
          ...prev,
          [itemName]: text.trim() ? { text } : { noSection: true as const },
        }));
      })
      .catch((e) => setObtainingByItem((prev) => ({ ...prev, [itemName]: { error: String(e) } })));
  }, []);

  const handleCardClick = useCallback(
    (recipe: CraftingRecipe) => {
      setPanelStack([recipe]);
      fetchObtaining(recipe.CraftedItem);
    },
    [fetchObtaining]
  );

  const crafterOptions = useMemo(() => {
    if (craftersFromData?.length) return ["All", ...craftersFromData];
    const set = new Set<string>(["All"]);
    items.forEach((r) => r.Crafter && set.add(r.Crafter));
    return Array.from(set).sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));
  }, [items, craftersFromData]);

  const workshopOptions = useMemo(() => {
    if (workshopsFromData?.length) return ["All", ...workshopsFromData];
    const set = new Set<string>(["All"]);
    items.forEach((r) => r.Workshop && set.add(r.Workshop));
    return Array.from(set).sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));
  }, [items, workshopsFromData]);

  const craftableByName = useMemo(() => {
    const map = new Map<string, CraftingRecipe>();
    items.forEach((r) => {
      if (r.CraftedItem && !map.has(r.CraftedItem)) map.set(r.CraftedItem, r);
    });
    return map;
  }, [items]);

  const craftableNames = useMemo(() => new Set(craftableByName.keys()), [craftableByName]);

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["CraftedItem"],
        threshold: 0.15,
      }),
    [items]
  );

  const filtered = useMemo(() => {
    let list = query.trim() ? fuse.search(query).map((r) => r.item) : items;
    if (crafterFilter !== "All") list = list.filter((r) => r.Crafter === crafterFilter);
    if (workshopFilter !== "All") list = list.filter((r) => r.Workshop === workshopFilter);
    const mult = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const aVal = (a[sortKey] ?? "") as string;
      const bVal = (b[sortKey] ?? "") as string;
      return mult * (aVal === bVal ? 0 : aVal < bVal ? -1 : 1);
    });
    return list;
  }, [items, query, fuse, crafterFilter, workshopFilter, sortKey, sortDir]);

  const handleCrafterClick = useCallback((crafter: string) => {
    setCrafterFilter(crafter);
    setWorkshopFilter("All");
    setQuery("");
    filterSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleWorkshopClick = useCallback((workshop: string) => {
    setWorkshopFilter(workshop);
    setCrafterFilter("All");
    setQuery("");
    filterSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const openIngredient = useCallback(
    (name: string, parentRecipe?: CraftingRecipe) => {
      const recipe = craftableByName.get(name);
      if (!recipe) return;
      setPanelStack((prev) => {
        if (parentRecipe && prev.length === 0) return [parentRecipe, recipe];
        return [...prev, recipe];
      });
      fetchObtaining(name);
    },
    [craftableByName, fetchObtaining]
  );

  const popToIndex = useCallback((index: number) => {
    setPanelStack((prev) => prev.slice(0, index + 1));
  }, []);

  const closePanel = useCallback(() => setPanelStack([]), []);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center text-[var(--muted)]">Loading recipes…</div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">Enshrouded Crafting Index</h1>
        <p className="text-sm text-[var(--muted)]">
          {items.length} recipes from the wiki — search by item, crafter, or ingredient.
        </p>
      </header>

      <div ref={filterSectionRef} className="mb-6 space-y-4">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="shrink-0">Crafter</span>
            <select
              value={crafterFilter}
              onChange={(e) => setCrafterFilter(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              aria-label="Filter by crafter"
            >
              {crafterOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="shrink-0">Workshop</span>
            <select
              value={workshopFilter}
              onChange={(e) => setWorkshopFilter(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              aria-label="Filter by workshop"
            >
              {workshopOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4 text-sm text-[var(--muted)]">
        <span>Sort by:</span>
        {(["CraftedItem", "Crafter", "Workshop"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleSort(key)}
            className={
              "font-medium " +
              (sortKey === key ? "text-[var(--accent)]" : "hover:text-[var(--text)]")
            }
          >
            {key === "CraftedItem" ? "Item" : key}
            {sortKey === key && (sortDir === "asc" ? " ↑" : " ↓")}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-[var(--muted)]">
        {filtered.length} {filtered.length === 1 ? "recipe" : "recipes"}
      </p>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Recipe list">
        {filtered.map((recipe, i) => (
          <RecipeCard
            key={`${recipe.CraftedItem}-${recipe.Crafter}-${i}`}
            recipe={recipe}
            onCardClick={handleCardClick}
            onCrafterClick={handleCrafterClick}
            onWorkshopClick={handleWorkshopClick}
            onIngredientClick={openIngredient}
            craftableNames={craftableNames}
          />
        ))}
      </section>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-[var(--muted)]">No recipes match your filters.</p>
      )}

      {panelStack.length > 0 && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={closePanel}
          />
          <SidePanel
            stack={panelStack}
            craftableByName={craftableByName}
            obtainingByItem={obtainingByItem}
            onIngredientClick={openIngredient}
            onFetchObtaining={fetchObtaining}
            onPopToIndex={popToIndex}
            onClose={closePanel}
          />
        </>
      )}
    </div>
  );
}

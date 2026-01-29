"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Fuse from "fuse.js";
import type { CraftingRecipe } from "@/app/types/items";

type SortKey = "CraftedItem" | "Crafter" | "Workshop";
type SortDir = "asc" | "desc";

function useItems() {
  const [items, setItems] = useState<CraftingRecipe[]>([]);
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
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { items, loading, error };
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

function CategoryPills({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={
            "rounded-full px-3 py-1 text-sm font-medium transition-colors " +
            (selected === opt
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]")
          }
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: CraftingRecipe }) {
  const ingredients = recipe.SourceItem.map((name, i) => ({
    name,
    qty: recipe.SourceQuantity[i] ?? 1,
  }));

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:border-[var(--accent-dim)]">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold text-[var(--text)]">{recipe.CraftedItem}</h2>
        <span className="text-sm text-[var(--muted)]">×{recipe.CraftedQuantity}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded bg-[var(--border)] px-2 py-0.5 text-[var(--text)]">{recipe.Crafter}</span>
        <span className="rounded bg-[var(--border)] px-2 py-0.5 text-[var(--muted)]">
          {recipe.Workshop ?? "—"}
        </span>
      </div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Ingredients</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-[var(--muted)]">
        {ingredients.map((ing, i) => (
          <li key={i}>
            {ing.name} ×{ing.qty}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function Home() {
  const { items, loading, error } = useItems();
  const [query, setQuery] = useState("");
  const [crafterFilter, setCrafterFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("CraftedItem");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const crafterOptions = useMemo(() => {
    const set = new Set<string>(["All"]);
    items.forEach((r) => r.Crafter && set.add(r.Crafter));
    return Array.from(set).sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));
  }, [items]);

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
    const mult = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const aVal = (a[sortKey] ?? "") as string;
      const bVal = (b[sortKey] ?? "") as string;
      return mult * (aVal === bVal ? 0 : aVal < bVal ? -1 : 1);
    });
    return list;
  }, [items, query, fuse, crafterFilter, sortKey, sortDir]);

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

      <div className="mb-6 space-y-4">
        <SearchInput value={query} onChange={setQuery} />
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Crafter
          </span>
          <CategoryPills options={crafterOptions} selected={crafterFilter} onSelect={setCrafterFilter} />
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
          <RecipeCard key={`${recipe.CraftedItem}-${recipe.Crafter}-${i}`} recipe={recipe} />
        ))}
      </section>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-[var(--muted)]">No recipes match your filters.</p>
      )}
    </div>
  );
}

import { normalizeName } from "./fuzzy.js";

function textsOf(place) {
  return [place.label, place.name, ...(place.aliases || [])].filter(Boolean);
}

function rankOf(place, needle) {
  let rank = Infinity;
  for (const text of textsOf(place)) {
    const normalized = normalizeName(text);
    if (!normalized) continue;
    if (normalized.startsWith(needle)) rank = Math.min(rank, 0);
    else if (normalized.split(" ").some((word) => word.startsWith(needle))) rank = Math.min(rank, 1);
  }
  return rank;
}

/** Places in `catalog` whose name or alias matches the typed query. */
export function suggestPlaces(catalog, query, { exclude = [], limit = 8 } = {}) {
  const needle = normalizeName(query);
  if (!needle) return [];
  const skipped = new Set(exclude);
  return catalog
    .filter((place) => place && !skipped.has(place.id))
    .map((place) => ({ place, rank: rankOf(place, needle), label: place.label || place.name }))
    .filter((item) => item.rank < Infinity)
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((item) => item.place);
}

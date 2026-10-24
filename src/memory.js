export const MISSES_KEY = "saan-misses-v1";

export function loadMisses(storage = globalThis.localStorage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(MISSES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const misses = {};
    for (const [key, value] of Object.entries(parsed)) {
      const count = Number(value);
      if (Number.isInteger(count) && count > 0) misses[key] = count;
    }
    return misses;
  } catch {
    return {};
  }
}

/** Misses get heavier; a correct answer lightens that place by one. */
export function recordAnswer(misses, key, correct) {
  const next = { ...misses };
  const current = next[key] || 0;
  const updated = correct ? Math.max(0, current - 1) : current + 1;
  if (updated === 0) delete next[key];
  else next[key] = updated;
  return next;
}

export function saveMisses(misses, storage = globalThis.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(MISSES_KEY, JSON.stringify(misses));
  } catch {
    // Private mode and full storage should not break the quiz.
  }
}

export function missWeight(misses, key) {
  return 1 + (misses[key] || 0) * 3;
}

export function pickWeighted(items, keyOf, misses, random = Math.random) {
  if (!items.length) throw new Error("nothing to pick");
  const weights = items.map((item) => missWeight(misses, keyOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items[items.length - 1];
}

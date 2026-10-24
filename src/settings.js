const CITY_SET_KEY = "saan-city-set-v1";
const OUTLINES_KEY = "saan-outlines-v1";

function storageOf(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function loadCitySet(storage) {
  const store = storageOf(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(CITY_SET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id) => typeof id === "string");
  } catch {
    return null;
  }
}

export function saveCitySet(ids, storage) {
  const store = storageOf(storage);
  if (!store) return;
  try {
    if (ids == null) store.removeItem(CITY_SET_KEY);
    else store.setItem(CITY_SET_KEY, JSON.stringify(ids));
  } catch {
    // Private mode and full storage should not break the quiz.
  }
}

export function loadOutlines(storage) {
  const fallback = { provinces: true, cities: true };
  const store = storageOf(storage);
  if (!store) return fallback;
  try {
    const raw = store.getItem(OUTLINES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return {
      provinces: parsed.provinces !== false,
      cities: parsed.cities !== false,
    };
  } catch {
    return fallback;
  }
}

export function saveOutlines(outlines, storage) {
  const store = storageOf(storage);
  if (!store) return;
  try {
    store.setItem(
      OUTLINES_KEY,
      JSON.stringify({
        provinces: outlines.provinces !== false,
        cities: outlines.cities !== false,
      })
    );
  } catch {
    // Private mode and full storage should not break the quiz.
  }
}

/** Null means every city. An array is the explicit set the player checked. */
export function resolveCities(cities, ids) {
  if (ids == null) return cities;
  const selected = new Set(ids);
  return cities.filter((city) => selected.has(city.id));
}

export function majorCityIds(cities) {
  return cities.filter((city) => city.independent).map((city) => city.id);
}

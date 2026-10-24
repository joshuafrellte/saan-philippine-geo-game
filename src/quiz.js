import { matchesPlace } from "./fuzzy.js";
import { pickWeighted, recordAnswer } from "./memory.js";

export const CATEGORIES = [
  { id: "region", label: "Regions" },
  { id: "province", label: "Provinces" },
  { id: "city", label: "Cities" },
];

const CATEGORY_IDS = CATEGORIES.map((item) => item.id);

/** Button text for the checked set. All three reads as All. */
export function categoryLabel(selected) {
  const ids = CATEGORY_IDS.filter((id) => selected.includes(id));
  if (ids.length === CATEGORY_IDS.length) return "All";
  return ids.map((id) => CATEGORIES.find((item) => item.id === id).label).join(", ");
}

/**
 * Next checked set after a checklist click. Null means the click changes nothing:
 * All is already on, or the last category would be cleared.
 */
export function applyCategoryCheck(selected, id, checked) {
  const set = new Set(selected.filter((item) => CATEGORY_IDS.includes(item)));
  if (id === "all") {
    if (CATEGORY_IDS.every((item) => set.has(item))) return null;
    return CATEGORY_IDS.slice();
  }
  if (!CATEGORY_IDS.includes(id)) return null;
  if (checked) {
    set.add(id);
    return CATEGORY_IDS.filter((item) => set.has(item));
  }
  if (set.size <= 1 && set.has(id)) return null;
  set.delete(id);
  return CATEGORY_IDS.filter((item) => set.has(item));
}

function pickAvoiding(items, keyOf, misses, random, previousKey) {
  const pool =
    previousKey && items.length > 1
      ? items.filter((item) => keyOf(item) !== previousKey)
      : items;
  return pickWeighted(pool.length ? pool : items, keyOf, misses, random);
}

function shuffle(list, random) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function regionPhrase(name) {
  const needsThe = /(Region|Peninsula|Valley|Visayas)$/.test(name) || /^(National|Cordillera|Ilocos)/.test(name);
  return needsThe ? `the ${name}` : name;
}

export function describePlace(place) {
  const alias = place.aliases?.length ? ` Also called ${place.aliases.join(", ")}.` : "";
  const regionName = place.regionRecord?.name || "an unknown region";
  if (place.kind === "region") {
    return `${place.name} has its regional center in ${place.capital}.${alias}`;
  }
  if (place.kind === "city") {
    const host = !place.provinceRecord
      ? ""
      : place.independent
        ? ` It governs itself, separate from ${place.provinceRecord.name}.`
        : ` It is in ${place.provinceRecord.name}.`;
    return `${place.label || place.name} is in ${regionPhrase(regionName)}.${host}${alias}`;
  }
  return `${place.name} has its capital in ${place.capital}, in ${regionPhrase(regionName)}.${alias}`;
}

function choiceLabel(place) {
  return place.label || place.name;
}

function choicesFor(places, correctId, random) {
  const correct = places.find((place) => place.id === correctId);
  const others = places.filter((place) => place.id !== correctId);
  const picked = [];
  const pool = others.slice();
  while (picked.length < 3 && pool.length) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return shuffle(
    [correct, ...picked].filter(Boolean).map((place) => ({ id: place.id, label: choiceLabel(place) })),
    random
  );
}

function placesFor(atlas, kind) {
  if (kind === "region") return atlas.regions;
  if (kind === "province") return atlas.provinces;
  return atlas.cities;
}

function emptyCityQuestion(mode) {
  return {
    mode,
    key: "city:none",
    prompt: "Turn on at least one city",
    promptMark: "",
    map: "province",
    highlightId: null,
    targetId: null,
    answerId: null,
    place: null,
    choices: null,
    empty: true,
  };
}

export function createQuestion(atlas, mode, categories, misses = {}, random = Math.random, previousKey = null) {
  const wanted = CATEGORY_IDS.filter((id) => (categories || []).includes(id));
  const available = wanted.filter((id) => id !== "city" || atlas.cities.length);
  if (!available.length) return emptyCityQuestion(mode);
  const kind = available.length === 1 ? available[0] : available[Math.floor(random() * available.length)];
  const pool = placesFor(atlas, kind);
  const place = pickAvoiding(pool, (item) => `${kind}:${item.id}`, misses, random, previousKey);
  const key = `${kind}:${place.id}`;
  if (mode === "mcq") {
    return {
      mode,
      key,
      prompt: `Which ${kind} is this?`,
      promptMark: kind,
      map: kind,
      highlightId: place.id,
      targetId: place.id,
      answerId: place.id,
      place,
      choices: choicesFor(pool, place.id, random),
    };
  }
  if (mode === "type") {
    return {
      mode: "type",
      key,
      prompt: `Type the name of this ${kind}`,
      promptMark: kind,
      map: kind,
      highlightId: place.id,
      targetId: place.id,
      answerId: place.id,
      place,
      choices: null,
    };
  }
  const phrase = kind === "region" ? regionPhrase(place.name) : choiceLabel(place);
  return {
    mode: "locate",
    key,
    prompt: `Click ${phrase}`,
    promptMark: phrase,
    map: kind,
    highlightId: null,
    targetId: place.id,
    answerId: place.id,
    place,
    choices: null,
  };
}

function firstLetter(name) {
  const found = [...(name || "")].find((char) => /\p{L}/u.test(char));
  return found ? found.toUpperCase() : "";
}

function letterCount(name) {
  return [...(name || "")].filter((char) => /\p{L}/u.test(char)).length;
}

/** Two steps before the reveal. Region questions never give the region name away. */
export function hintSteps(place) {
  if (!place?.name) return [];
  const name = place.name;
  const letter = firstLetter(name);
  const count = letterCount(name);
  const spelling = letter
    ? `The name starts with ${letter} and has ${count} ${count === 1 ? "letter" : "letters"}.`
    : `The name has ${count} ${count === 1 ? "letter" : "letters"}.`;
  if (place.kind === "region") {
    const center = firstLetter(place.capital);
    return [
      center ? `The regional center starts with ${center}.` : "This place is a region.",
      spelling,
    ];
  }
  const regionName = place.regionRecord?.name;
  const where = regionName ? `It is in ${regionPhrase(regionName)}.` : "It sits in one of the regions.";
  return [where, spelling];
}

/**
 * Assisted correct answers count, leave the streak where it is, and do not change miss weight.
 * A miss, including "I don't know", still adds a miss and ends the streak.
 */
export function settleScore(session, misses, key, correct, assisted) {
  const next = {
    correct: session.correct,
    answered: session.answered + 1,
    streak: session.streak,
  };
  if (correct) {
    next.correct += 1;
    if (!assisted) next.streak += 1;
  } else {
    next.streak = 0;
  }
  if (correct && assisted) return { session: next, misses };
  return { session: next, misses: recordAnswer(misses, key, correct) };
}

/** Heaviest review weights, rolled up to the region that owns each miss. */
export function regionWeights(atlas, misses) {
  const totals = new Map();
  function add(region, weight) {
    if (!region || !(weight > 0)) return;
    const current = totals.get(region.id) || { id: region.id, name: region.name, weight: 0 };
    current.weight += weight;
    totals.set(region.id, current);
  }
  for (const [key, weight] of Object.entries(misses || {})) {
    const split = key.indexOf(":");
    if (split < 0) continue;
    const kind = key.slice(0, split);
    const id = key.slice(split + 1);
    if (kind === "region") add(atlas.regions.find((item) => item.id === id), weight);
    else if (kind === "province") add(atlas.provinces.find((item) => item.id === id)?.regionRecord, weight);
    else if (kind === "city") add(atlas.cities.find((item) => item.id === id)?.regionRecord, weight);
  }
  return [...totals.values()].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

export function checkAnswer(question, response, catalog) {
  if (question.mode === "type") {
    if (String(response) === String(question.place.id)) return true;
    return matchesPlace(response, question.place, catalog);
  }
  return String(response) === String(question.answerId);
}

export function catalogFor(atlas, question) {
  if (question.place.kind === "region") return atlas.regions;
  if (question.place.kind === "city") return atlas.cities;
  return atlas.provinces;
}

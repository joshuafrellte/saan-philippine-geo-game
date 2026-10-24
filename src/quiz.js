import { matchesPlace } from "./fuzzy.js";
import { pickWeighted, recordAnswer } from "./memory.js";

export const MODES = [
  { id: "daily", label: "Daily" },
  { id: "region", label: "Regions" },
  { id: "province", label: "Provinces" },
  { id: "city", label: "Cities" },
  { id: "which-region", label: "Which region?" },
  { id: "type", label: "Type it" },
];

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

const DISPLAY_NAMES = {
  calabarzon: "Calabarzon",
  mimaropa: "Mimaropa",
  "region-12": "Soccsksargen",
};

/** Title case for the three regional acronyms. The stored name stays official. */
export function displayName(place) {
  if (!place) return "";
  return DISPLAY_NAMES[place.id] || place.label || place.name || "";
}

function regionPhrase(name) {
  const needsThe = /(Region|Peninsula|Valley|Visayas)$/.test(name) || /^(National|Cordillera|Ilocos)/.test(name);
  return needsThe ? `the ${name}` : name;
}

function shown(place) {
  return displayName(place);
}

export function describePlace(place) {
  const alias = place.aliases?.length ? ` Also called ${place.aliases.join(", ")}.` : "";
  const regionName = place.regionRecord ? shown(place.regionRecord) : "an unknown region";
  if (place.kind === "region") {
    return `${shown(place)} has its regional center in ${place.capital}.${alias}`;
  }
  if (place.kind === "city") {
    const host = !place.provinceRecord
      ? ""
      : place.independent
        ? ` It governs itself, separate from ${shown(place.provinceRecord)}.`
        : ` It is in ${shown(place.provinceRecord)}.`;
    return `${shown(place)} is in ${regionPhrase(regionName)}.${host}${alias}`;
  }
  return `${shown(place)} has its capital in ${place.capital}, in ${regionPhrase(regionName)}.${alias}`;
}

function choicesFor(regions, correctId, random) {
  const correct = regions.find((region) => region.id === correctId);
  const others = regions.filter((region) => region.id !== correctId);
  const picked = [];
  const pool = others.slice();
  while (picked.length < 3 && pool.length) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return shuffle(
    [correct, ...picked].filter(Boolean).map((region) => ({ id: region.id, label: shown(region) })),
    random
  );
}

export function createQuestion(atlas, mode, misses = {}, random = Math.random, previousKey = null) {
  if (mode === "region") {
    const region = pickAvoiding(atlas.regions, (item) => `region:${item.id}`, misses, random, previousKey);
    const phrase = regionPhrase(shown(region));
    return {
      mode,
      key: `region:${region.id}`,
      prompt: `Click ${phrase}`,
      promptMark: phrase,
      map: "region",
      highlightId: null,
      targetId: region.id,
      answerId: region.id,
      place: region,
      choices: null,
    };
  }

  if (mode === "province") {
    const province = pickAvoiding(
      atlas.provinces,
      (item) => `province:${item.id}`,
      misses,
      random,
      previousKey
    );
    return {
      mode,
      key: `province:${province.id}`,
      prompt: `Click ${shown(province)}`,
      promptMark: shown(province),
      map: "province",
      highlightId: null,
      targetId: province.id,
      answerId: province.id,
      place: province,
      choices: null,
    };
  }

  if (mode === "which-region") {
    const province = pickAvoiding(
      atlas.provinces,
      (item) => `province:${item.id}`,
      misses,
      random,
      previousKey
    );
    return {
      mode,
      key: `province:${province.id}`,
      prompt: `Which region is ${shown(province)} in?`,
      promptMark: shown(province),
      map: "province",
      highlightId: province.id,
      targetId: province.id,
      answerId: province.region,
      place: province,
      choices: choicesFor(atlas.regions, province.region, random),
    };
  }

  if (mode === "city") {
    if (!atlas.cities.length) {
      return {
        mode,
        key: "city:none",
        prompt: "Turn on at least one city",
        map: "province",
        highlightId: null,
        targetId: null,
        answerId: null,
        place: null,
        choices: null,
        empty: true,
      };
    }
    const city = pickAvoiding(atlas.cities, (item) => `city:${item.id}`, misses, random, previousKey);
    const askRegion = random() >= 0.5;
    const label = shown(city);
    return {
      mode,
      key: `city:${city.id}`,
      prompt: askRegion ? `Which region is ${label} in?` : `Click ${label}`,
      promptMark: label,
      map: "city",
      highlightId: askRegion ? city.id : null,
      targetId: city.id,
      answerId: askRegion ? city.region : city.id,
      place: city,
      choices: askRegion ? choicesFor(atlas.regions, city.region, random) : null,
    };
  }

  const roll = random();
  let kind = roll < 0.34 ? "region" : roll < 0.67 ? "province" : "city";
  if (kind === "city" && !atlas.cities.length) kind = "province";
  const pool = kind === "region" ? atlas.regions : kind === "province" ? atlas.provinces : atlas.cities;
  const place = pickAvoiding(pool, (item) => `${kind}:${item.id}`, misses, random, previousKey);
  const prompt = `Type the name of this ${kind}`;
  return {
    mode: "type",
    key: `${kind}:${place.id}`,
    prompt,
    promptMark: kind,
    map: kind,
    highlightId: place.id,
    targetId: place.id,
    answerId: place.id,
    place,
    choices: null,
  };
}

/** One Type it question drawn from places the player has missed. */
export function questionForMisses(atlas, misses, random = Math.random, previousKey = null) {
  const places = [];
  for (const key of Object.keys(misses || {})) {
    if (!(misses[key] > 0)) continue;
    const split = key.indexOf(":");
    if (split < 0) continue;
    const kind = key.slice(0, split);
    const id = key.slice(split + 1);
    const pool = kind === "region" ? atlas.regions : kind === "province" ? atlas.provinces : kind === "city" ? atlas.cities : null;
    const place = pool?.find((item) => item.id === id);
    if (place) places.push(place);
  }
  if (!places.length) return null;
  const place = pickAvoiding(places, (item) => `${item.kind}:${item.id}`, misses, random, previousKey);
  const kind = place.kind;
  return {
    mode: "type",
    key: `${kind}:${place.id}`,
    prompt: `Type the name of this ${kind}`,
    promptMark: kind,
    map: kind,
    highlightId: place.id,
    targetId: place.id,
    answerId: place.id,
    place,
    choices: null,
    review: true,
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
  const name = shown(place);
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
  const regionName = place.regionRecord ? shown(place.regionRecord) : "";
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
    const current = totals.get(region.id) || { id: region.id, name: displayName(region), weight: 0 };
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

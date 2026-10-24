import { matchesPlace } from "./fuzzy.js";
import { pickWeighted } from "./memory.js";

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
    [correct, ...picked].filter(Boolean).map((region) => ({ id: region.id, label: region.name })),
    random
  );
}

export function createQuestion(atlas, mode, misses = {}, random = Math.random, previousKey = null) {
  if (mode === "region") {
    const region = pickAvoiding(atlas.regions, (item) => `region:${item.id}`, misses, random, previousKey);
    const phrase = regionPhrase(region.name);
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
      prompt: `Click ${province.name}`,
      promptMark: province.name,
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
      prompt: `Which region is ${province.name} in?`,
      promptMark: province.name,
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
    const label = city.label || city.name;
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

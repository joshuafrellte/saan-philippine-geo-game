const REGION_NUMBERS = {
  ncr: "NCR",
  car: "CAR",
  "region-1": "I",
  "region-2": "II",
  "region-3": "III",
  calabarzon: "IV-A",
  mimaropa: "IV-B",
  "region-5": "V",
  "region-6": "VI",
  "region-7": "VII",
  "region-8": "VIII",
  "region-9": "IX",
  "region-10": "X",
  "region-11": "XI",
  "region-12": "XII",
  caraga: "XIII",
  nir: "XVIII",
  barmm: "BARMM",
};

function regionEyebrow(place) {
  const number = REGION_NUMBERS[place.id];
  if (!number) return "Region";
  if (/^(NCR|CAR|BARMM)$/.test(number)) return number;
  return `Region ${number}`;
}

export function studyCard(atlas, library, place) {
  const entry = library[place.id] || {};
  const facts = Array.isArray(entry.facts) ? entry.facts : [];
  if (place.kind === "region") {
    return {
      eyebrow: regionEyebrow(place),
      name: place.name,
      rows: [{ label: "Regional center", text: entry.seat || "No regional center has been settled." }],
      links: [],
      facts,
    };
  }
  if (place.kind === "province") {
    return {
      eyebrow: "Province",
      name: place.name,
      rows: [{ label: "Capital", text: place.capital }],
      links: [{ label: "Region", place: atlas.regions.find((region) => region.id === place.region) }],
      facts,
    };
  }
  const province = atlas.provinces.find((item) => item.id === place.province);
  const region = atlas.regions.find((item) => item.id === place.region);
  const status = place.independent
    ? province
      ? `It governs itself, separate from ${province.name}.`
      : "It is one of Metro Manila’s cities."
    : `It is a component city in ${province?.name || "its province"}.`;
  return {
    eyebrow: "City",
    name: place.label || place.name,
    rows: [{ label: "Status", text: status }],
    links: [province && { label: "Province", place: province }, region && { label: "Region", place: region }].filter(Boolean),
    facts,
  };
}

export function studyProblems(places, library) {
  const problems = [];
  const seen = new Set();
  for (const region of places.regions) {
    seen.add(region.id);
    const entry = library[region.id];
    if (!entry) {
      problems.push(`${region.id}: missing`);
      continue;
    }
    checkFacts(problems, region.id, entry);
    if (region.id === "nir") {
      if (entry.seat) problems.push("nir: seat should stay empty");
    } else if (typeof entry.seat !== "string" || !entry.seat.trim()) {
      problems.push(`${region.id}: missing seat`);
    }
  }
  for (const place of [...places.provinces, ...places.cities]) {
    seen.add(place.id);
    const entry = library[place.id];
    if (!entry) {
      problems.push(`${place.id}: missing`);
      continue;
    }
    checkFacts(problems, place.id, entry);
    if ("seat" in entry) problems.push(`${place.id}: unexpected seat`);
  }
  for (const id of Object.keys(library)) {
    if (!seen.has(id)) problems.push(`${id}: unknown`);
  }
  return problems;
}

function checkFacts(problems, id, entry) {
  if (!Array.isArray(entry.facts) || entry.facts.length < 2 || entry.facts.length > 3) {
    problems.push(`${id}: facts`);
    return;
  }
  if (entry.facts.some((fact) => typeof fact !== "string" || fact.trim().length < 20)) {
    problems.push(`${id}: short fact`);
  }
}

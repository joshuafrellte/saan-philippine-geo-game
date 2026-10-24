import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { geoArea, geoCentroid, geoContains } from "d3-geo";
import { normalizeName } from "../src/fuzzy.js";
import { seatCities } from "./fit-cities.mjs";

const execFileAsync = promisify(execFile);

const root = path.resolve(import.meta.dirname, "..");
const cacheDir = path.join(root, "data", "src-regions");
const source =
  "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/regions/lowres";
const files = [
  "provdists-region-100000000.0.001.json",
  "provdists-region-200000000.0.001.json",
  "provdists-region-300000000.0.001.json",
  "provdists-region-400000000.0.001.json",
  "provdists-region-500000000.0.001.json",
  "provdists-region-600000000.0.001.json",
  "provdists-region-700000000.0.001.json",
  "provdists-region-800000000.0.001.json",
  "provdists-region-900000000.0.001.json",
  "provdists-region-1000000000.0.001.json",
  "provdists-region-1100000000.0.001.json",
  "provdists-region-1200000000.0.001.json",
  "provdists-region-1300000000.0.001.json",
  "provdists-region-1400000000.0.001.json",
  "provdists-region-1600000000.0.001.json",
  "provdists-region-1700000000.0.001.json",
  "provdists-region-1900000000.0.001.json",
];

const attribution =
  "Province shapes are geoBoundaries ADM2 simplified (CC BY 3.0 IGO), simplified together so shared borders meet. The BARMM special area stays on James Faeldon, philippines-json-maps (MIT). Region membership follows RA 12000 (Negros Island Region) and Executive Order No. 91 (2025), which places Sulu in the Zamboanga Peninsula.";

const provinceBoundary =
  "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/41af8f1e141eb6826ab9877e306df6f848b9ff0b/releaseData/gbOpen/PHL/ADM2/geoBoundaries-PHL-ADM2_simplified.geojson";

function roundCoords(coords) {
  if (typeof coords[0] === "number") {
    return [Math.round(coords[0] * 10000) / 10000, Math.round(coords[1] * 10000) / 10000];
  }
  return coords.map(roundCoords);
}

function roundGeometry(geometry) {
  return { type: geometry.type, coordinates: roundCoords(geometry.coordinates) };
}

function partsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported geometry ${geometry.type}`);
}

function multiCoords(geometry) {
  return partsOf(roundGeometry(geometry));
}

function multiGeometry(parts) {
  const coordinates = [];
  for (const geometry of parts) coordinates.push(...multiCoords(geometry));
  return rewind({ type: "MultiPolygon", coordinates });
}

/** Source rings are clockwise. d3-geo treats that as the rest of the globe. */
function rewindPolygon(polygon) {
  const sample = { type: "Polygon", coordinates: polygon };
  const reversed = {
    type: "Polygon",
    coordinates: polygon.map((ring) => ring.slice().reverse()),
  };
  return geoArea(sample) > geoArea(reversed) ? reversed.coordinates : polygon;
}

function rewind(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length) return { type: "MultiPolygon", coordinates: [] };
  return { type: "MultiPolygon", coordinates: polygons.map(rewindPolygon) };
}

async function readSources() {
  const cached = await readdir(cacheDir).catch(() => []);
  const collections = [];
  for (const file of files) {
    if (cached.includes(file)) {
      collections.push(JSON.parse(await readFile(path.join(cacheDir, file), "utf8")));
      continue;
    }
    const response = await fetch(`${source}/${file}`);
    if (!response.ok) throw new Error(`Could not download ${file}`);
    collections.push(await response.json());
  }
  return collections;
}

const places = JSON.parse(await readFile(path.join(root, "data", "places.json"), "utf8"));
const byName = new Map(places.provinces.map((province) => [normalizeName(province.name), province]));
const found = new Map();
const extras = { isabela: null, sga: null, ncr: [] };

for (const collection of await readSources()) {
  for (const feature of collection.features) {
    const name = feature.properties?.adm2_en;
    if (!name) {
      extras.sga = feature;
      continue;
    }
    if (name.startsWith("NCR")) {
      extras.ncr.push(feature);
      continue;
    }
    if (name.includes("Not a Province")) {
      if (name.includes("Isabela")) extras.isabela = feature;
      continue;
    }
    const province = byName.get(normalizeName(name));
    if (!province) throw new Error(`No places.json row for ${name}`);
    if (found.has(province.id)) throw new Error(`Duplicate geometry for ${name}`);
    found.set(province.id, feature);
  }
}

for (const province of places.provinces) {
  if (!found.has(province.id)) throw new Error(`Missing geometry for ${province.name}`);
}
if (!extras.isabela || !extras.sga || extras.ncr.length !== 4) {
  throw new Error("Expected Isabela City, the BARMM special area, and four NCR districts");
}

async function loadProvinceBoundaries() {
  const file = path.join(cacheDir, "gb-adm2-simplified.geojson");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    const response = await fetch(provinceBoundary);
    if (!response.ok) throw new Error("Could not download province boundaries");
    const json = await response.json();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(json));
    return json;
  }
}

// The low-resolution Faeldon files simplify each region alone, so a shared
// border becomes two lines and the sea shows through. geoBoundaries keeps
// those borders on the same points. Its Maguindanao shape is split into the
// two current provinces.
const boundaries = await loadProvinceBoundaries();
const ncrParts = [];
let isabelaCity = null;
let cotabatoCity = null;
let maguindanao = null;
const norteFaeldon = rewind(found.get("maguindanao-del-norte").geometry);
const surFaeldon = rewind(found.get("maguindanao-del-sur").geometry);
const tiled = new Set();
for (const feature of boundaries.features) {
  const name = feature.properties.shapeName;
  if (name.startsWith("NCR")) {
    ncrParts.push(feature);
    continue;
  }
  if (name === "City of Isabela") {
    isabelaCity = feature;
    continue;
  }
  if (name === "Cotabato City") {
    cotabatoCity = feature;
    continue;
  }
  if (name === "Maguindanao") {
    maguindanao = feature;
    continue;
  }
  const provinceName = name === "Compostela Valley" ? "Davao de Oro" : name;
  const province = byName.get(normalizeName(provinceName));
  if (!province) throw new Error(`No places.json row for boundary ${name}`);
  found.set(province.id, { geometry: feature.geometry });
  tiled.add(province.id);
}
if (ncrParts.length !== 4 || !isabelaCity || !cotabatoCity || !maguindanao) {
  throw new Error("Province boundaries are missing NCR, Isabela City, Cotabato City, or Maguindanao");
}
const norteParts = [];
const surParts = [];
for (const polygon of partsOf(maguindanao.geometry)) {
  const piece = rewind({ type: "Polygon", coordinates: polygon });
  const centroid = geoCentroid(piece);
  if (geoContains(norteFaeldon, centroid)) norteParts.push(...partsOf(piece));
  else if (geoContains(surFaeldon, centroid)) surParts.push(...partsOf(piece));
  else throw new Error("A Maguindanao piece falls outside both provinces");
}
found.set("maguindanao-del-norte", { geometry: { type: "MultiPolygon", coordinates: norteParts } });
found.set("maguindanao-del-sur", { geometry: { type: "MultiPolygon", coordinates: surParts } });
tiled.add("maguindanao-del-norte");
tiled.add("maguindanao-del-sur");
for (const province of places.provinces) {
  if (!tiled.has(province.id)) throw new Error(`No tiled boundary for ${province.name}`);
}

const draft = [
  ...places.provinces.map((province) => ({
    type: "Feature",
    properties: { id: province.id, name: province.name, kind: "province" },
    geometry: found.get(province.id).geometry,
  })),
  {
    type: "Feature",
    properties: { id: "isabela-city", name: "Isabela City", kind: "city" },
    geometry: isabelaCity.geometry,
  },
  {
    type: "Feature",
    properties: { id: "cotabato-city", name: "Cotabato City", kind: "city" },
    geometry: cotabatoCity.geometry,
  },
  {
    type: "Feature",
    properties: { id: "ncr", name: "National Capital Region", kind: "landmark" },
    geometry: { type: "MultiPolygon", coordinates: ncrParts.flatMap((feature) => partsOf(feature.geometry)) },
  },
  {
    type: "Feature",
    properties: { id: "barmm-sga", name: "Special Geographic Area", kind: "landmark", inert: true },
    geometry: extras.sga.geometry,
  },
];

const tiledPath = path.join(cacheDir, "provinces-tiled.json");
const simplifiedPath = path.join(cacheDir, "provinces-simplified.json");
await writeFile(tiledPath, JSON.stringify({ type: "FeatureCollection", features: draft }));
const mapshaper = path.join(root, "node_modules", "mapshaper", "bin", "mapshaper");
await execFileAsync(process.execPath, [
  mapshaper,
  "-i",
  tiledPath,
  "-simplify",
  "visvalingam",
  "8%",
  "keep-shapes",
  "-o",
  "format=geojson",
  "precision=0.0001",
  simplifiedPath,
]);
const simplified = JSON.parse(await readFile(simplifiedPath, "utf8"));
const geometries = new Map(
  simplified.features.map((feature) => [feature.properties.id, rewind(feature.geometry)])
);

function geometryFor(id) {
  const geometry = geometries.get(id);
  if (!geometry) throw new Error(`Missing simplified geometry for ${id}`);
  return geometry;
}

function combined(ids) {
  return rewind({
    type: "MultiPolygon",
    coordinates: ids.flatMap((id) => partsOf(geometryFor(id))),
  });
}

const basilanGeometry = combined(["basilan", "isabela-city"]);
const norteGeometry = combined(["maguindanao-del-norte", "cotabato-city"]);
for (const province of places.provinces) {
  const geometry =
    province.id === "basilan"
      ? basilanGeometry
      : province.id === "maguindanao-del-norte"
        ? norteGeometry
        : geometryFor(province.id);
  found.set(province.id, { geometry });
}

const provinceFeatures = places.provinces.map((province) => ({
  type: "Feature",
  properties: { id: province.id, name: province.name, kind: "province" },
  geometry: found.get(province.id).geometry,
}));
provinceFeatures.push({
  type: "Feature",
  properties: { id: "ncr", name: "National Capital Region", kind: "landmark" },
  geometry: geometryFor("ncr"),
});
provinceFeatures.push({
  type: "Feature",
  properties: { id: "barmm-sga", name: "Special Geographic Area", kind: "landmark", inert: true },
  geometry: geometryFor("barmm-sga"),
});

const cityCache = path.join(root, "data", "src-cities");
const citySource =
  "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/provdists/lowres";
const boundarySource =
  "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/PHL/ADM3/geoBoundaries-PHL-ADM3_simplified.geojson";

function cityKey(name) {
  return normalizeName(name)
    .replace(/^island garden city of /, "")
    .replace(/^science city of /, "")
    .replace(/^city of /, "")
    .replace(/ city$/, "");
}

function covers(host, feature) {
  const city = rewind(roundGeometry(feature.geometry));
  const region = rewind(roundGeometry(host));
  const points = [geoCentroid(city)];
  for (const polygon of city.coordinates) {
    const ring = polygon[0];
    points.push(ring[0], ring[Math.floor(ring.length / 2)]);
  }
  return points.some((point) => geoContains(region, point));
}

async function readMunicipalityFile(psgc) {
  const file = `municities-provdist-${psgc}.0.001.json`;
  const cached = path.join(cityCache, file);
  try {
    return JSON.parse(await readFile(cached, "utf8"));
  } catch {
    const response = await fetch(`${citySource}/${file}`);
    if (!response.ok) return null;
    const json = await response.json();
    await mkdir(cityCache, { recursive: true });
    await writeFile(cached, JSON.stringify(json));
    return json;
  }
}

const psgcToProvince = new Map();
const ncrPsgcs = new Set();
const seenPsgc = new Set();
for (const collection of await readSources()) {
  for (const feature of collection.features) {
    const psgc = feature.properties?.adm2_psgc;
    const name = feature.properties?.adm2_en;
    if (!psgc || seenPsgc.has(String(psgc))) continue;
    seenPsgc.add(String(psgc));
    if (!name) continue;
    if (name.startsWith("NCR")) ncrPsgcs.add(String(psgc));
    else if (name.includes("Isabela") && name.includes("Not a Province")) {
      psgcToProvince.set(String(psgc), "basilan");
    } else if (!name.includes("Not a Province")) {
      const province = byName.get(normalizeName(name));
      if (province) psgcToProvince.set(String(psgc), province.id);
    }
  }
}

const municipalities = new Map();
for (const psgc of seenPsgc) {
  const collection = await readMunicipalityFile(psgc);
  if (!collection?.features) continue;
  for (const feature of collection.features) {
    if (!feature.properties?.adm3_en || !feature.geometry) continue;
    const code = String(feature.properties.adm2_psgc);
    const host = ncrPsgcs.has(code) ? "ncr" : psgcToProvince.get(code);
    if (!host) continue;
    const key = cityKey(feature.properties.adm3_en);
    const bucket = municipalities.get(key) || [];
    bucket.push({ host, feature });
    municipalities.set(key, bucket);
  }
}

let outsideBoundaries = null;
async function boundaryFor(city, key, host) {
  if (!outsideBoundaries) {
    const cached = path.join(cityCache, "gb-adm3-simplified.geojson");
    try {
      outsideBoundaries = JSON.parse(await readFile(cached, "utf8"));
    } catch {
      const response = await fetch(boundarySource);
      if (!response.ok) throw new Error("Could not download the city boundaries");
      outsideBoundaries = await response.json();
      await mkdir(cityCache, { recursive: true });
      await writeFile(cached, JSON.stringify(outsideBoundaries));
    }
  }
  const hits = outsideBoundaries.features.filter(
    (feature) => cityKey(feature.properties.shapeName) === key
  );
  const hostGeometry =
    host === "ncr"
      ? multiGeometry(extras.ncr.map((feature) => feature.geometry))
      : found.get(host).geometry;
  const inside = hits.filter((feature) => covers(hostGeometry, feature));
  if (inside.length !== 1) {
    const names = hits.map((feature) => feature.properties.shapeName).join(", ") || "none";
    throw new Error(`${city.name}: expected one shape inside its province, found ${inside.length} (${names})`);
  }
  return inside[0].geometry;
}

const cityFeatures = [];
const filledFromBoundaries = [];
for (const city of places.cities) {
  const key = cityKey(city.name);
  const host = city.province || "ncr";
  const matches = (municipalities.get(key) || []).filter((item) => item.host === host);
  let geometry;
  if (matches.length === 1) geometry = matches[0].feature.geometry;
  else if (matches.length > 1) throw new Error(`${city.name}: ${matches.length} municipality shapes`);
  else {
    geometry = await boundaryFor(city, key, host);
    filledFromBoundaries.push(city.name);
  }
  cityFeatures.push({
    type: "Feature",
    properties: { id: city.id, name: city.name, kind: "city" },
    geometry: rewind(roundGeometry(geometry)),
  });
}

const cityAttribution =
  "City shapes are Faeldon PSGC municipality polygons where the city is in that extract. Highly urbanized cities left out of those extracts use geoBoundaries ADM3 simplified boundaries (CC BY 3.0 IGO). Edges that meet a province or region outline use that outline, so the city sits flush inside it.";

const outlineById = new Map(provinceFeatures.map((feature) => [feature.properties.id, feature]));
const allParents = provinceFeatures
  .filter((feature) => feature.properties.kind === "province" || feature.properties.id === "ncr" || feature.properties.id === "barmm-sga")
  .map((feature) => ({ id: feature.properties.id, geometry: feature.geometry }));
const seated = await seatCities(
  cityFeatures,
  (feature) => {
    const place = places.cities.find((city) => city.id === feature.properties.id);
    const parent = outlineById.get(place.province || "ncr");
    return { id: parent.properties.id, geometry: parent.geometry };
  },
  allParents
);
for (const [id, geometry] of seated.parents) {
  const feature = outlineById.get(id);
  if (feature) feature.geometry = geometry;
}

const regionFeatures = places.regions.map((region) => {
  const parts = places.provinces
    .filter((province) => province.region === region.id)
    .flatMap((province) => partsOf(outlineById.get(province.id).geometry));
  if (region.id === "region-9") parts.push(...partsOf(geometryFor("isabela-city")));
  if (region.id === "barmm") parts.push(...partsOf(outlineById.get("barmm-sga").geometry));
  if (region.id === "ncr") parts.push(...partsOf(outlineById.get("ncr").geometry));
  return {
    type: "Feature",
    properties: { id: region.id, name: region.name },
    geometry: rewind({ type: "MultiPolygon", coordinates: parts }),
  };
});

await writeFile(
  path.join(root, "data", "provinces.geojson"),
  JSON.stringify({ type: "FeatureCollection", source: attribution, features: provinceFeatures })
);
await writeFile(
  path.join(root, "data", "regions.geojson"),
  JSON.stringify({ type: "FeatureCollection", source: attribution, features: regionFeatures })
);
await writeFile(
  path.join(root, "data", "cities.geojson"),
  JSON.stringify({ type: "FeatureCollection", source: cityAttribution, features: seated.features })
);

console.log(
  `Wrote ${provinceFeatures.length} province-map features, ${regionFeatures.length} regions, and ${cityFeatures.length} cities (${filledFromBoundaries.length} from geoBoundaries: ${filledFromBoundaries.join(", ")}).`
);

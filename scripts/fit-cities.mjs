import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { geoArea, geoContains } from "d3-geo";
import { fitCityToParent } from "../src/fit-city.js";

const require = createRequire(import.meta.url);
const mapshaper = require("mapshaper");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOLERANCE_KM = 6;

function rewindPolygon(polygon) {
  const sample = { type: "Polygon", coordinates: polygon };
  const reversed = { type: "Polygon", coordinates: polygon.map((ring) => ring.slice().reverse()) };
  return geoArea(sample) > geoArea(reversed) ? reversed.coordinates : polygon;
}

function rewind(geometry) {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates || [];
  if (!polygons.length) return { type: "MultiPolygon", coordinates: [] };
  return { type: "MultiPolygon", coordinates: polygons.map(rewindPolygon) };
}

function areaKm2(geometry) {
  if (!geometry?.coordinates?.length) return 0;
  return geoArea({ type: "Feature", properties: {}, geometry: rewind(geometry) }) * 510072000;
}

function parseOutput(raw) {
  if (raw == null) return [];
  const parsed = raw && typeof raw === "object" && (raw.features || raw.type) ? raw : JSON.parse(String(raw));
  if (parsed.features) return parsed.features.filter((feature) => feature?.geometry?.coordinates?.length);
  if (parsed.type === "GeometryCollection") {
    return parsed.geometries
      .filter((geometry) => geometry?.coordinates?.length)
      .map((geometry) => ({ type: "Feature", properties: {}, geometry }));
  }
  if (parsed.type === "Feature" && parsed.geometry) return [parsed];
  return [];
}

function polygonsOf(features) {
  return features.map((feature) => ({
    ...feature,
    properties: feature.properties || {},
    geometry: rewind(feature.geometry),
  }));
}

async function run(commands, files) {
  try {
    const output = await mapshaper.applyCommands(commands, { ...files });
    const result = {};
    for (const [key, raw] of Object.entries(output)) result[key] = polygonsOf(parseOutput(raw));
    return result;
  } catch (error) {
    console.warn(`Map command failed (${commands}): ${error.message}`);
    return {};
  }
}

function collection(features) {
  return { type: "FeatureCollection", features };
}

function samplePoint(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const ring = polygons?.[0]?.[0];
  if (!ring?.length) return null;
  return ring[Math.floor(ring.length / 3)] || ring[0];
}

function matchCities(originals, outputs) {
  const byId = new Map();
  for (const feature of outputs) {
    const id = feature.properties?.id;
    if (id) byId.set(id, feature);
  }
  if (byId.size === originals.length) {
    return originals.map((city) => {
      const match = byId.get(city.properties.id);
      return match?.geometry ? { ...city, geometry: rewind(match.geometry) } : city;
    });
  }
  return originals.map((city) => {
    const point = samplePoint(city.geometry);
    let best = null;
    let bestArea = -1;
    for (const feature of outputs) {
      if (!feature.geometry || !point || !geoContains(feature, point)) continue;
      const area = areaKm2(feature.geometry);
      if (area > bestArea) {
        best = feature;
        bestArea = area;
      }
    }
    return best ? { ...city, geometry: rewind(best.geometry) } : city;
  });
}

async function seatGroup(parent, cities, others) {
  const baseParent = rewind(parent.geometry);
  const baseCities = cities.map((city) => ({ ...city, geometry: rewind(city.geometry) }));
  const files = {
    "parent.json": collection([{ type: "Feature", properties: {}, geometry: baseParent }]),
    "cities.json": collection(baseCities),
    "others.json": collection(others.map((item) => ({ type: "Feature", properties: {}, geometry: rewind(item.geometry) }))),
  };

  const outside = await run(
    "-i cities.json -erase parent.json -o outside.json format=geojson precision=0.0001",
    files
  );
  let sea = outside["outside.json"] || [];
  if (sea.length && others.length) {
    const erased = await run(
      "-i outside.json -erase others.json -o sea.json format=geojson precision=0.0001",
      { "outside.json": collection(sea), "others.json": files["others.json"] }
    );
    sea = erased["sea.json"] || [];
  }

  let parentGeometry = baseParent;
  const seaArea = sea.reduce((sum, feature) => sum + areaKm2(feature.geometry), 0);
  if (sea.length && seaArea > 0.5) {
    const grown = await run(
      "-i parent.json sea.json combine-files -merge-layers force -dissolve -o grown.json format=geojson precision=0.0001",
      { "parent.json": files["parent.json"], "sea.json": collection(sea) }
    );
    const next = grown["grown.json"]?.[0]?.geometry;
    if (next && areaKm2(next) >= areaKm2(baseParent) * 0.98) parentGeometry = rewind(next);
  }

  const clipped = await run(
    "-i cities.json -clip parent.json -o clipped.json format=geojson precision=0.0001",
    {
      "cities.json": collection(baseCities),
      "parent.json": collection([{ type: "Feature", properties: {}, geometry: parentGeometry }]),
    }
  );
  const clippedCities = matchCities(baseCities, clipped["clipped.json"] || []);
  const finished = clippedCities.map((city) => {
    const blockers = clippedCities
      .filter((other) => other.properties.id !== city.properties.id)
      .map((other) => other.geometry);
    const fitted = rewind(fitCityToParent(city.geometry, parentGeometry, TOLERANCE_KM, blockers));
    const nextArea = areaKm2(fitted);
    const baseArea = areaKm2(city.geometry);
    const geometry = baseArea > 0 && nextArea >= baseArea * 0.9 && nextArea <= baseArea * 1.4 ? fitted : city.geometry;
    return { ...city, geometry: rewind(geometry) };
  });
  return { geometry: parentGeometry, features: finished };
}

/**
 * Cut each city to its province or region outline and pull edges that run
 * along that outline onto it. Outline land that is only sea gets extended
 * around a city that already sticks out there.
 */
export async function seatCities(features, parentOf, allParents) {
  const groups = new Map();
  for (const feature of features) {
    const parent = parentOf(feature);
    if (!parent?.geometry) throw new Error(`No outline for ${feature.properties?.id}`);
    const group = groups.get(parent.id) || { id: parent.id, geometry: parent.geometry, features: [] };
    group.features.push(feature);
    groups.set(parent.id, group);
  }

  const seated = [];
  const parents = new Map();
  for (const group of groups.values()) {
    const others = allParents.filter((item) => item.id !== group.id && item.geometry);
    const result = await seatGroup(group, group.features, others);
    parents.set(group.id, result.geometry);
    seated.push(...result.features);
  }
  const seen = new Set(seated.map((feature) => feature.properties.id));
  for (const feature of features) {
    if (!seen.has(feature.properties.id)) seated.push(feature);
  }
  return { features: seated, parents };
}

async function main() {
  const places = JSON.parse(await readFile(path.join(root, "data", "places.json"), "utf8"));
  const provinces = JSON.parse(await readFile(path.join(root, "data", "provinces.geojson"), "utf8"));
  const regions = JSON.parse(await readFile(path.join(root, "data", "regions.geojson"), "utf8"));
  const cities = JSON.parse(await readFile(path.join(root, "data", "cities.geojson"), "utf8"));
  const provinceById = new Map(provinces.features.map((feature) => [feature.properties.id, feature]));
  const regionById = new Map(regions.features.map((feature) => [feature.properties.id, feature]));
  const placeById = new Map(places.cities.map((city) => [city.id, city]));
  const allParents = provinces.features
    .filter((feature) => feature.properties.kind === "province" || feature.properties.id === "ncr")
    .map((feature) => ({ id: feature.properties.id, geometry: feature.geometry }));
  const parentById = new Map(allParents.map((parent) => [parent.id, parent]));
  const before = new Map(cities.features.map((feature) => [feature.properties.id, areaKm2(feature.geometry)]));
  const seated = await seatCities(
    cities.features,
    (feature) => {
      const place = placeById.get(feature.properties.id);
      const parent = place?.province ? parentById.get(place.province) : regionById.get(place.region);
      return { id: place?.province || place.region, geometry: parent.geometry };
    },
    allParents
  );
  const changed = [];
  for (const feature of seated.features) {
    const from = before.get(feature.properties.id);
    const to = areaKm2(feature.geometry);
    const ratio = to / from;
    if (ratio < 0.97 || ratio > 1.03) changed.push(`${feature.properties.id} ${from.toFixed(0)} -> ${to.toFixed(0)}`);
  }
  console.log(`Seated ${seated.features.length} cities. Area moved for ${changed.length}:`);
  for (const line of changed) console.log(line);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) await main();

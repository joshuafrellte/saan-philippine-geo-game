import { geoMercator, geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { boundsInside, fitTransform, frameSpec } from "./frame.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);
const width = 800;
const height = 640;
const projection = geoMercator().fitExtent(
  [[18, 18], [width - 18, height - 18]],
  {
    type: "FeatureCollection",
    features: atlas.regions.map((region) => region.feature).filter(Boolean),
  }
);
const path = geoPath(projection);

describe("type it framing", () => {
  it("frames a province by its region, a city by its province, and a region by itself", () => {
    const cebu = atlas.provinces.find((place) => place.id === "cebu");
    expect(frameSpec(cebu)).toBe(cebu.regionRecord.feature);

    const city = atlas.cities.find((place) => place.id === "cebu-city");
    expect(frameSpec(city)).toBe(city.provinceRecord.feature);

    const manila = atlas.cities.find((place) => place.id === "manila");
    const ncr = atlas.provincesGeo.features.find((feature) => feature.properties.id === "ncr");
    expect(frameSpec(manila, atlas.provincesGeo.features)).toBe(ncr);

    const car = atlas.regions.find((place) => place.id === "car");
    expect(frameSpec(car)).toBe(car.feature);
  });

  it("does not keep a southern frame when the next target is a northern region", () => {
    const cebu = atlas.provinces.find((place) => place.id === "cebu");
    const visayas = path.bounds(frameSpec(cebu));
    const cx = (visayas[0][0] + visayas[1][0]) / 2;
    const cy = (visayas[0][1] + visayas[1][1]) / 2;
    const stuck = { k: 5, x: width / 2 - 5 * cx, y: height / 2 - 5 * cy };

    const car = atlas.regions.find((place) => place.id === "car");
    const carBounds = path.bounds(frameSpec(car));
    const next = fitTransform(carBounds, width, height, { coverage: 0.7 });

    expect(boundsInside(carBounds, stuck, width, height, 0)).toBe(false);
    expect(boundsInside(carBounds, next, width, height, 8)).toBe(true);
    expect(next.k).not.toBe(stuck.k);
  });

  it("fits a multi-island region as one bbox and stays on the country when that bbox is huge", () => {
    const mimaropa = atlas.regions.find((place) => place.id === "mimaropa");
    const bounds = path.bounds(frameSpec(mimaropa));
    const framed = fitTransform(bounds, width, height, { coverage: 0.7 });
    const span = bounds[1][0] - bounds[0][0];
    const cebu = atlas.provinces.find((place) => place.id === "palawan") || atlas.provinces.find((place) => place.id === "cebu");
    const island = path.bounds(cebu.feature);
    expect(span).toBeGreaterThan(island[1][0] - island[0][0]);
    expect(boundsInside(bounds, framed, width, height, 8)).toBe(true);
  });
});

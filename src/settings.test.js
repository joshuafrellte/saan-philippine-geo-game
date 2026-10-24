import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { majorCityIds, resolveCities } from "./settings.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("city set", () => {
  it("starts from every city and can narrow to the 38 self-governing cities", () => {
    expect(resolveCities(atlas.cities, null)).toHaveLength(149);
    const major = majorCityIds(atlas.cities);
    expect(major).toHaveLength(38);
    expect(resolveCities(atlas.cities, major).every((city) => city.independent)).toBe(true);
    expect(resolveCities(atlas.cities, [])).toHaveLength(0);
  });
});

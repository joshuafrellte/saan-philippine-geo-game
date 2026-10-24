import { describe, expect, it } from "vitest";
import { buildAtlas, validateAtlas } from "./atlas.js";
import { matchesPlace } from "./fuzzy.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("atlas", () => {
  it("gives every province a region and a geometry", () => {
    expect(validateAtlas(atlas)).toEqual([]);
    for (const province of atlas.provinces) {
      expect(province.region, province.name).toBeTruthy();
      expect(province.regionRecord?.id, province.name).toBe(province.region);
      expect(province.feature?.geometry?.coordinates?.length, province.name).toBeGreaterThan(0);
    }
  });

  it("accepts the aliases stored for real places", () => {
    const davao = atlas.provinces.find((province) => province.id === "davao-de-oro");
    const cotabato = atlas.provinces.find((province) => province.id === "cotabato");
    const samar = atlas.provinces.find((province) => province.id === "samar");
    const ncr = atlas.regions.find((region) => region.id === "ncr");
    const ilocos = atlas.regions.find((region) => region.id === "region-1");
    const calabarzon = atlas.regions.find((region) => region.id === "calabarzon");

    expect(matchesPlace("Compostela Valley", davao, atlas.provinces)).toBe(true);
    expect(matchesPlace("compostela valey", davao, atlas.provinces)).toBe(true);
    expect(matchesPlace("North Cotabato", cotabato, atlas.provinces)).toBe(true);
    expect(matchesPlace("Western Samar", samar, atlas.provinces)).toBe(true);
    expect(matchesPlace("Davao del Norte", davao, atlas.provinces)).toBe(false);
    expect(matchesPlace("Quezon City", atlas.provinces.find((province) => province.id === "quezon"), atlas.provinces)).toBe(false);
    expect(matchesPlace("Metro Manila", ncr, atlas.regions)).toBe(true);
    expect(matchesPlace("NCR", ncr, atlas.regions)).toBe(true);
    expect(matchesPlace("Region 10", ilocos, atlas.regions)).toBe(false);
    expect(matchesPlace("Region IV-B", calabarzon, atlas.regions)).toBe(false);
  });

  it("gives every city a region and a geometry", () => {
    expect(atlas.cities).toHaveLength(149);
    expect(atlas.cities.filter((city) => city.independent)).toHaveLength(38);
    for (const city of atlas.cities) {
      expect(city.region, city.name).toBeTruthy();
      expect(city.regionRecord?.id, city.name).toBe(city.region);
      expect(city.feature?.geometry?.coordinates?.length, city.name).toBeGreaterThan(0);
      if (city.province) expect(city.provinceRecord?.id, city.name).toBe(city.province);
      else expect(city.provinceRecord, city.name).toBeNull();
    }

    const cities = atlas.cities;
    const cebu = cities.find((city) => city.id === "cebu-city");
    const naga = cities.find((city) => city.id === "naga");
    expect(matchesPlace("Cebu", cebu, cities)).toBe(true);
    expect(matchesPlace("CDO", cities.find((city) => city.id === "cagayan-de-oro"), cities)).toBe(true);
    expect(matchesPlace("GenSan", cities.find((city) => city.id === "general-santos"), cities)).toBe(true);
    expect(matchesPlace("QC", cities.find((city) => city.id === "quezon-city"), cities)).toBe(true);
    expect(matchesPlace("Lapu-Lapu", cities.find((city) => city.id === "lapu-lapu"), cities)).toBe(true);
    expect(matchesPlace("Cebu", naga, cities)).toBe(false);
    expect(matchesPlace("Cebu City", atlas.provinces.find((province) => province.id === "cebu"), atlas.provinces)).toBe(false);

    const labels = cities.map((city) => city.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(expect.arrayContaining([
      "San Fernando, La Union",
      "San Fernando, Pampanga",
      "San Carlos, Pangasinan",
      "San Carlos, Negros Occidental",
      "Naga, Camarines Sur",
      "Naga, Cebu",
      "Talisay, Negros Occidental",
      "Talisay, Cebu",
    ]));
    const nagaCebu = cities.find((city) => city.id === "naga-cebu");
    expect(matchesPlace("Naga", naga, cities)).toBe(false);
    expect(matchesPlace("Naga, Cebu", nagaCebu, cities)).toBe(true);
    expect(matchesPlace("Naga City", naga, cities)).toBe(true);
    expect(matchesPlace("Naga", naga, [naga])).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { suggestPlaces } from "./suggest.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("suggestions", () => {
  it("offers provinces, regions, or cities from the catalog being asked", () => {
    expect(suggestPlaces(atlas.provinces, "cebu").map((place) => place.id)).toEqual(["cebu"]);
    const cebuCities = suggestPlaces(atlas.cities, "cebu").map((place) => place.id);
    expect(cebuCities[0]).toBe("cebu-city");
    expect(cebuCities).toEqual(expect.arrayContaining(["naga-cebu", "talisay-cebu"]));
    expect(suggestPlaces(atlas.regions, "ncr").map((place) => place.id)).toEqual(["ncr"]);
    expect(suggestPlaces(atlas.provinces, "ncr")).toEqual([]);
    expect(suggestPlaces(atlas.cities, "")).toEqual([]);
  });

  it("keeps both San Carlos cities distinct and skips a guess already used", () => {
    const matches = suggestPlaces(atlas.cities, "san carlos").map((place) => place.label);
    expect(matches).toEqual(["San Carlos, Negros Occidental", "San Carlos, Pangasinan"]);
    expect(suggestPlaces(atlas.provinces, "cebu", { exclude: ["cebu"] })).toEqual([]);
    const short = suggestPlaces(atlas.provinces, "ba").map((place) => place.name);
    expect(short).toEqual(["Basilan", "Bataan", "Batanes", "Batangas"]);
  });
});

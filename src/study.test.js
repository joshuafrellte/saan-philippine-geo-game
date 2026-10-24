import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { studyCard, studyProblems } from "./study.js";
import places from "../data/places.json";
import study from "../data/study.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("study library", () => {
  it("has two or three facts for every region, province, and city", () => {
    expect(atlas.regions).toHaveLength(18);
    expect(atlas.provinces).toHaveLength(82);
    expect(atlas.cities).toHaveLength(149);
    expect(studyProblems(places, study)).toEqual([]);
  });

  it("reads a capital from the atlas and leaves it out of the study file", () => {
    const cebu = atlas.provinces.find((province) => province.id === "cebu");
    const card = studyCard(atlas, study, cebu);
    expect(card.rows).toEqual([{ label: "Capital", text: "Cebu City" }]);
    expect(study.cebu.seat).toBeUndefined();
    expect(card.links.map((link) => link.place.id)).toEqual(["region-7"]);
  });

  it("says the Negros Island Region has no settled center", () => {
    const nir = atlas.regions.find((region) => region.id === "nir");
    const card = studyCard(atlas, study, nir);
    expect(card.rows[0].text).toMatch(/settled/i);
  });
});

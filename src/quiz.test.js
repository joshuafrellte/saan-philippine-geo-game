import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { catalogFor, checkAnswer, createQuestion, describePlace, displayName, hintSteps, regionWeights, settleScore } from "./quiz.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("questions", () => {
  it("asks which region a province is in, with the right region among four choices", () => {
    const question = createQuestion(atlas, "which-region", {}, () => 0.2);
    expect(question.choices).toHaveLength(4);
    expect(new Set(question.choices.map((choice) => choice.id)).size).toBe(4);
    expect(question.choices.some((choice) => choice.id === question.place.region)).toBe(true);
    expect(checkAnswer(question, question.place.region, catalogFor(atlas, question))).toBe(true);
    expect(checkAnswer(question, "not-a-region", catalogFor(atlas, question))).toBe(false);
    expect(describePlace(question.place)).toContain(question.place.capital);
  });

  it("accepts an alias in type-in mode and favors a missed province", () => {
    const province = createQuestion(atlas, "type", {}, () => 0.5);
    expect(province.place.kind).toBe("province");
    expect(checkAnswer(province, province.place.name, catalogFor(atlas, province))).toBe(true);

    const city = createQuestion(atlas, "type", {}, () => 0.99);
    expect(city.place.kind).toBe("city");
    expect(city.map).toBe("city");
    expect(catalogFor(atlas, city)).toBe(atlas.cities);
    expect(checkAnswer(city, city.place.name, catalogFor(atlas, city))).toBe(true);
    expect(checkAnswer(city, city.place.id, catalogFor(atlas, city))).toBe(true);

    const misses = { "province:sulu": 30 };
    let sulu = 0;
    for (let i = 0; i < 40; i += 1) {
      const question = createQuestion(atlas, "province", misses);
      if (question.place.id === "sulu") sulu += 1;
    }
    expect(sulu).toBeGreaterThan(8);
  });

  it("asks the player to click a city or name its region", () => {
    const click = createQuestion(atlas, "city", {}, () => 0.2);
    expect(click.prompt).toMatch(/^Click /);
    expect(click.prompt).toContain(click.promptMark);
    expect(click.map).toBe("city");
    expect(click.choices).toBeNull();
    expect(click.key.startsWith("city:")).toBe(true);
    expect(checkAnswer(click, click.targetId, catalogFor(atlas, click))).toBe(true);

    const named = createQuestion(atlas, "city", {}, () => 0.8);
    expect(named.prompt).toMatch(/^Which region is /);
    expect(named.prompt).toContain(named.promptMark);
    expect(named.highlightId).toBe(named.place.id);
    expect(named.choices).toHaveLength(4);
    expect(new Set(named.choices.map((choice) => choice.id)).size).toBe(4);
    expect(named.choices.some((choice) => choice.id === named.place.region)).toBe(true);
    expect(checkAnswer(named, named.place.region, catalogFor(atlas, named))).toBe(true);

    const cebu = atlas.cities.find((city) => city.id === "cebu-city");
    expect(describePlace(cebu)).toContain("Central Visayas");
    expect(describePlace(cebu)).toContain("separate from Cebu");
  });

  it("hints around a place without giving a region question its name", () => {
    const ilocos = atlas.provinces.find((place) => place.id === "ilocos-norte");
    const provinceSteps = hintSteps(ilocos);
    expect(provinceSteps[0]).toContain("Ilocos Region");
    expect(provinceSteps[1]).toContain("starts with I");
    expect(provinceSteps[1]).toContain("11 letters");

    const region = atlas.regions.find((place) => place.id === "region-1");
    const regionSteps = hintSteps(region);
    expect(regionSteps[0]).not.toContain(region.name);
    expect(regionSteps[0]).toContain("starts with S");
    expect(regionSteps[1]).not.toContain(region.name);
    expect(regionSteps[1]).toContain("12 letters");
  });

  it("leaves a miss in place when the correct answer used a hint", () => {
    const session = { correct: 1, answered: 2, streak: 2 };
    const misses = { "province:ilocos-norte": 2 };
    const assisted = settleScore(session, misses, "province:ilocos-norte", true, true);
    expect(assisted.session).toEqual({ correct: 2, answered: 3, streak: 2 });
    expect(assisted.misses).toBe(misses);

    const clean = settleScore(session, misses, "province:ilocos-norte", true, false);
    expect(clean.session.streak).toBe(3);
    expect(clean.misses).toEqual({ "province:ilocos-norte": 1 });

    const missed = settleScore(session, misses, "province:ilocos-norte", false, true);
    expect(missed.session.streak).toBe(0);
    expect(missed.misses["province:ilocos-norte"]).toBe(3);
  });

  it("shows the three regional acronyms in title case and still accepts the official spelling", () => {
    const calabarzon = atlas.regions.find((place) => place.id === "calabarzon");
    expect(displayName(calabarzon)).toBe("Calabarzon");
    expect(describePlace(calabarzon)).toContain("Calabarzon");
    expect(describePlace(calabarzon)).not.toContain("CALABARZON");
    const question = {
      mode: "type",
      key: "region:calabarzon",
      answerId: calabarzon.id,
      place: calabarzon,
    };
    expect(checkAnswer(question, "CALABARZON", catalogFor(atlas, question))).toBe(true);
    expect(checkAnswer(question, "Calabarzon", catalogFor(atlas, question))).toBe(true);
    const mimaropa = atlas.regions.find((place) => place.id === "mimaropa");
    const soccsksargen = atlas.regions.find((place) => place.id === "region-12");
    expect(displayName(mimaropa)).toBe("Mimaropa");
    expect(displayName(soccsksargen)).toBe("Soccsksargen");
  });

  it("rolls miss weight up to the region", () => {
    const weights = regionWeights(atlas, {
      "province:ilocos-norte": 2,
      "province:ilocos-sur": 1,
      "region:region-7": 4,
    });
    expect(weights[0]).toMatchObject({ id: "region-7", weight: 4 });
    expect(weights[1]).toMatchObject({ id: "region-1", name: "Ilocos Region", weight: 3 });
  });
});

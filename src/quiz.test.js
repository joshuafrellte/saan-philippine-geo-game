import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { applyCategoryCheck, catalogFor, categoryLabel, checkAnswer, createQuestion, describePlace, hintSteps, regionWeights, settleScore } from "./quiz.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("questions", () => {
  it("asks which province this is, with the right name among four choices", () => {
    const question = createQuestion(atlas, "mcq", ["province"], {}, () => 0.2);
    expect(question.prompt).toBe("Which province is this?");
    expect(question.promptMark).toBe("province");
    expect(question.choices).toHaveLength(4);
    expect(new Set(question.choices.map((choice) => choice.id)).size).toBe(4);
    expect(question.choices.some((choice) => choice.id === question.place.id)).toBe(true);
    expect(checkAnswer(question, question.place.id, catalogFor(atlas, question))).toBe(true);
    expect(checkAnswer(question, "not-a-province", catalogFor(atlas, question))).toBe(false);
    expect(describePlace(question.place)).toContain(question.place.capital);
  });

  it("accepts an alias in type-in mode and favors a missed province", () => {
    const province = createQuestion(atlas, "type", ["province"], {}, () => 0.5);
    expect(province.place.kind).toBe("province");
    expect(province.prompt).toBe("Type the name of this province");
    expect(checkAnswer(province, province.place.name, catalogFor(atlas, province))).toBe(true);

    const city = createQuestion(atlas, "type", ["city"], {}, () => 0.99);
    expect(city.place.kind).toBe("city");
    expect(city.map).toBe("city");
    expect(catalogFor(atlas, city)).toBe(atlas.cities);
    expect(checkAnswer(city, city.place.name, catalogFor(atlas, city))).toBe(true);
    expect(checkAnswer(city, city.place.id, catalogFor(atlas, city))).toBe(true);

    const misses = { "province:sulu": 30 };
    let sulu = 0;
    for (let i = 0; i < 40; i += 1) {
      const question = createQuestion(atlas, "locate", ["province"], misses);
      if (question.place.id === "sulu") sulu += 1;
    }
    expect(sulu).toBeGreaterThan(8);
  });

  it("asks the player to click a city or name the highlighted one", () => {
    const click = createQuestion(atlas, "locate", ["city"], {}, () => 0.2);
    expect(click.prompt).toMatch(/^Click /);
    expect(click.prompt).toContain(click.promptMark);
    expect(click.map).toBe("city");
    expect(click.choices).toBeNull();
    expect(click.key.startsWith("city:")).toBe(true);
    expect(checkAnswer(click, click.targetId, catalogFor(atlas, click))).toBe(true);

    const named = createQuestion(atlas, "mcq", ["city"], {}, () => 0.8);
    expect(named.prompt).toBe("Which city is this?");
    expect(named.promptMark).toBe("city");
    expect(named.highlightId).toBe(named.place.id);
    expect(named.choices).toHaveLength(4);
    expect(new Set(named.choices.map((choice) => choice.id)).size).toBe(4);
    expect(named.choices.some((choice) => choice.id === named.place.id)).toBe(true);
    expect(checkAnswer(named, named.place.id, catalogFor(atlas, named))).toBe(true);

    const cebu = atlas.cities.find((city) => city.id === "cebu-city");
    expect(describePlace(cebu)).toContain("Central Visayas");
    expect(describePlace(cebu)).toContain("separate from Cebu");
  });

  it("draws from the checked categories and keeps the last one on", () => {
    const mixed = ["region", "province", "city"];
    expect(createQuestion(atlas, "locate", mixed, {}, () => 0).place.kind).toBe("region");
    expect(createQuestion(atlas, "locate", mixed, {}, () => 0.4).place.kind).toBe("province");
    const city = createQuestion(atlas, "mcq", mixed, {}, () => 0.9);
    expect(city.place.kind).toBe("city");
    expect(city.choices.every((choice) => atlas.cities.some((item) => item.id === choice.id))).toBe(true);
    expect(createQuestion(atlas, "type", ["region", "city"], {}, () => 0).place.kind).toBe("region");

    const quiet = { ...atlas, cities: [] };
    expect(createQuestion(quiet, "locate", ["city"], {}, () => 0).empty).toBe(true);
    expect(createQuestion(quiet, "mcq", ["province", "city"], {}, () => 0.9).place.kind).toBe("province");

    expect(applyCategoryCheck(["region"], "region", false)).toBeNull();
    expect(applyCategoryCheck(["region", "province"], "region", false)).toEqual(["province"]);
    expect(applyCategoryCheck(["region"], "all", true)).toEqual(["region", "province", "city"]);
    expect(applyCategoryCheck(["region", "province", "city"], "all", false)).toBeNull();
    expect(categoryLabel(["region", "province", "city"])).toBe("All");
    expect(categoryLabel(["region", "city"])).toBe("Regions, Cities");
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

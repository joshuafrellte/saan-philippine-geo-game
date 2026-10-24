import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { catalogFor, checkAnswer, createQuestion, describePlace } from "./quiz.js";
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
});

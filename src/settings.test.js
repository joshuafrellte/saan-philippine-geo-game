import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import { loadLocate, loadScorePrefs, majorCityIds, resolveCities, saveLocate, saveScorePrefs } from "./settings.js";
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

  it("frames Type it unless the player turns it off", () => {
    const storage = {
      items: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.items, key) ? this.items[key] : null;
      },
      setItem(key, value) {
        this.items[key] = value;
      },
    };
    expect(loadLocate(storage)).toBe(true);
    saveLocate(false, storage);
    expect(loadLocate(storage)).toBe(false);
    saveLocate(true, storage);
    expect(loadLocate(storage)).toBe(true);
  });

  it("shows the streak, review count, and reset button until they are turned off", () => {
    const storage = {
      items: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.items, key) ? this.items[key] : null;
      },
      setItem(key, value) {
        this.items[key] = value;
      },
    };
    expect(loadScorePrefs(storage)).toEqual({ streak: true, review: true, reset: true });
    saveScorePrefs({ streak: false, review: true, reset: false }, storage);
    expect(loadScorePrefs(storage)).toEqual({ streak: false, review: true, reset: false });
  });
});

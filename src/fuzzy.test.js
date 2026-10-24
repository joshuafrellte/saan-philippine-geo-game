import { describe, expect, it } from "vitest";
import { editDistance, matchesPlace, normalizeName } from "./fuzzy.js";

const cebu = { id: "cebu", name: "Cebu", aliases: [] };
const bohol = { id: "bohol", name: "Bohol", aliases: [] };
const provinces = [cebu, bohol];

describe("fuzzy answers", () => {
  it("normalizes punctuation and the word province", () => {
    expect(normalizeName("  Province of Cebú ")).toBe("cebu");
    expect(normalizeName("Quezon Province")).toBe("quezon");
  });

  it("counts a swapped pair of letters as one typo", () => {
    expect(editDistance("cebu", "cbeu")).toBe(1);
  });

  it("accepts a short typo and rejects a different province", () => {
    expect(matchesPlace("cebo", cebu, provinces)).toBe(true);
    expect(matchesPlace("Cebu", cebu, provinces)).toBe(true);
    expect(matchesPlace("bohol", cebu, provinces)).toBe(false);
    expect(matchesPlace("   ", cebu, provinces)).toBe(false);
  });
});

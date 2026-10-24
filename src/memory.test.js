import { describe, expect, it } from "vitest";
import { loadMisses, missWeight, pickWeighted, recordAnswer, saveMisses } from "./memory.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    dump: () => data,
  };
}

describe("miss memory", () => {
  it("stores misses and lightens them after a correct answer", () => {
    const storage = memoryStorage();
    let misses = recordAnswer({}, "province:sulu", false);
    misses = recordAnswer(misses, "province:sulu", false);
    saveMisses(misses, storage);
    expect(loadMisses(storage)).toEqual({ "province:sulu": 2 });

    misses = recordAnswer(loadMisses(storage), "province:sulu", true);
    expect(misses).toEqual({ "province:sulu": 1 });
    misses = recordAnswer(misses, "province:sulu", true);
    expect(misses).toEqual({});
  });

  it("ignores corrupt saved data", () => {
    const storage = memoryStorage({ "saan-misses-v1": "{not json" });
    expect(loadMisses(storage)).toEqual({});
  });

  it("draws missed places more often", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const misses = { b: 20 };
    expect(missWeight(misses, "b")).toBeGreaterThan(missWeight(misses, "a"));
    expect(pickWeighted(items, (item) => item.id, misses, () => 0)).toEqual(items[0]);
    expect(pickWeighted(items, (item) => item.id, misses, () => 0.5).id).toBe("b");

    let heavy = 0;
    for (let i = 0; i < 200; i += 1) {
      if (pickWeighted(items, (item) => item.id, misses).id === "b") heavy += 1;
    }
    expect(heavy).toBeGreaterThan(170);
  });
});

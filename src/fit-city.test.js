import { describe, expect, it } from "vitest";
import { geoDistance } from "d3-geo";
import { fitCityToParent } from "./fit-city.js";

function km(a, b) {
  return geoDistance(a, b) * 6371;
}

describe("fitCityToParent", () => {
  it("pulls an inset edge onto the parent outline", () => {
    const parent = {
      type: "Polygon",
      coordinates: [
        [
          [120, 10],
          [120.3, 10],
          [120.3, 10.3],
          [120, 10.3],
          [120, 10],
        ],
      ],
    };
    const city = {
      type: "Polygon",
      coordinates: [
        [
          [120, 10],
          [120.27, 10],
          [120.27, 10.3],
          [120, 10.3],
          [120, 10],
        ],
      ],
    };
    const fitted = fitCityToParent(city, parent, 5);
    const ring = fitted.coordinates[0][0];
    const eastern = Math.max(...ring.map((point) => point[0]));
    expect(eastern).toBe(120.3);
    expect(ring.some((point) => point[0] === 120.3 && point[1] === 10)).toBe(true);
    expect(ring.some((point) => point[0] === 120.3 && point[1] === 10.3)).toBe(true);
  });

  it("leaves a vertex that is far from the outline where it is", () => {
    const parent = {
      type: "Polygon",
      coordinates: [
        [
          [120, 10],
          [121, 10],
          [121, 11],
          [120, 11],
          [120, 10],
        ],
      ],
    };
    const inland = [120.4, 10.4];
    const city = {
      type: "Polygon",
      coordinates: [[inland, [120.5, 10.4], [120.5, 10.5], [120.4, 10.5], inland]],
    };
    const fitted = fitCityToParent(city, parent, 5);
    const ring = fitted.coordinates[0][0];
    expect(ring.some((point) => km(point, inland) < 0.2)).toBe(true);
    expect(Math.min(...ring.map((point) => point[0]))).toBeGreaterThan(120.2);
  });
});

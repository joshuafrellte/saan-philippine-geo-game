import { describe, expect, it } from "vitest";
import { regionOutline } from "./outline.js";
import regionsGeo from "../data/regions.geojson";

function ringCount(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates.length;
  return geometry.coordinates.reduce((sum, polygon) => sum + polygon.length, 0);
}

function bounds(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const point of polygon[0]) {
      box[0] = Math.min(box[0], point[0]);
      box[1] = Math.min(box[1], point[1]);
      box[2] = Math.max(box[2], point[0]);
      box[3] = Math.max(box[3], point[1]);
    }
  }
  return box;
}

describe("region outlines", () => {
  it("drops the province borders inside a region and keeps its extent", () => {
    const region = regionsGeo.features.find((feature) => feature.properties.id === "region-3");
    const outline = regionOutline(region.geometry);
    expect(ringCount(outline)).toBeGreaterThan(0);
    expect(ringCount(outline)).toBeLessThan(ringCount(region.geometry));
    const [west, south, east, north] = bounds(region.geometry);
    const [outlineWest, outlineSouth, outlineEast, outlineNorth] = bounds(outline);
    expect(outlineWest).toBeCloseTo(west, 2);
    expect(outlineSouth).toBeCloseTo(south, 2);
    expect(outlineEast).toBeCloseTo(east, 2);
    expect(outlineNorth).toBeCloseTo(north, 2);
  });
});

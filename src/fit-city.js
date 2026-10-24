import { geoArea, geoContains, geoDistance } from "d3-geo";

const KM = 6371;

function km(a, b) {
  return geoDistance(a, b) * KM;
}

function ringsOf(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon);
}

function nearestOnSegment(point, start, end) {
  const lat = ((start[1] + end[1]) * 0.5 * Math.PI) / 180;
  const kx = Math.cos(lat);
  const ax = start[0] * kx;
  const ay = start[1];
  const bx = end[0] * kx;
  const by = end[1];
  const px = point[0] * kx;
  const py = point[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  if (t < 1e-6) return { point: start, t: 0 };
  if (t > 1 - 1e-6) return { point: end, t: 1 };
  return { point: [(ax + dx * t) / kx, ay + dy * t], t };
}

function nearest(point, rings) {
  let best = null;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    for (let index = 0; index < ring.length - 1; index += 1) {
      const hit = nearestOnSegment(point, ring[index], ring[index + 1]);
      const distanceKm = km(point, hit.point);
      if (!best || distanceKm < best.distanceKm) {
        best = { ...hit, distanceKm, ringIndex, index };
      }
    }
  }
  return best;
}

function forwardPoints(ring, start, end) {
  const count = ring.length - 1;
  let span = (end - start + count) % count;
  if (span < 1e-6) return [];
  const points = [];
  for (let vertex = Math.floor(start) + 1; vertex < start + span - 1e-8; vertex += 1) {
    points.push(ring[((vertex % count) + count) % count]);
  }
  return points;
}

function polylineKm(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += km(points[index - 1], points[index]);
  return total;
}

function boundaryArc(ring, from, to, toleranceKm, cityRings) {
  const start = from.index + from.t;
  const end = to.index + to.t;
  const forward = forwardPoints(ring, start, end);
  const backward = forwardPoints(ring, end, start).reverse();
  const forwardLength = polylineKm([from.point, ...forward, to.point]);
  const backwardLength = polylineKm([from.point, ...backward, to.point]);
  const arc = forwardLength <= backwardLength ? forward : backward;
  const length = Math.min(forwardLength, backwardLength);
  const straight = km(from.point, to.point);
  const onOutline = from.distanceKm <= 0.45 && to.distanceKm <= 0.45;
  const closer = Math.min(from.distanceKm, to.distanceKm);
  if (!onOutline && closer > 3.2) return [];
  const limit = onOutline ? 8 : Math.max(from.distanceKm, to.distanceKm) + 1.5;
  const lengthCap = onOutline ? straight * 12 + 8 : straight * 4 + 4;
  if (length > lengthCap) return [];
  if (arc.some((point) => nearestKm(point, cityRings) > limit)) return [];
  return arc;
}

function nearestKm(point, rings) {
  return nearest(point, rings).distanceKm;
}

function claimedByNeighbor(point, cityRings, blockers) {
  const mine = nearestKm(point, cityRings);
  for (const geometry of blockers) {
    if (nearestKm(point, ringsOf(geometry)) + 0.35 < mine) return true;
    if (geoContains(geometry, point) && mine > 0.2) return true;
  }
  return false;
}

function roundPoint(point) {
  return [Math.round(point[0] * 10000) / 10000, Math.round(point[1] * 10000) / 10000];
}

function cleanRing(points) {
  const cleaned = [];
  for (const point of points) {
    const rounded = roundPoint(point);
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous[0] === rounded[0] && previous[1] === rounded[1]) continue;
    cleaned.push(rounded);
  }
  if (cleaned.length < 3) return null;
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) cleaned.push(first);
  return cleaned;
}

function ringKm2(openOrClosed) {
  const ring = cleanRing(openOrClosed);
  if (!ring) return 0;
  const polygon = { type: "Polygon", coordinates: [ring] };
  const reversed = { type: "Polygon", coordinates: [ring.slice().reverse()] };
  const area = Math.min(geoArea(polygon), geoArea(reversed));
  return area * 510072000;
}

function assemble(open, replacements) {
  const out = [];
  for (let index = 0; index < open.length; index += 1) {
    const replacement = replacements.get(index);
    if (replacement) out.push(replacement.start, ...replacement.arc);
    else out.push(open[index]);
  }
  return cleanRing(out);
}

function areaIsSafe(before, after) {
  if (before <= 0 || after <= 0) return false;
  const ratio = after / before;
  return ratio >= 0.97 && ratio <= 1.22;
}

function fitRing(ring, parentRings, toleranceKm, blockers) {
  const open = ring.slice(0, -1);
  if (open.length < 3) return ring;
  const located = open.map((point) => nearest(point, parentRings));
  const cityRings = [ring];
  const candidates = new Map();
  for (let index = 0; index < open.length; index += 1) {
    const next = (index + 1) % open.length;
    const here = located[index];
    const there = located[next];
    const sameRing = here.ringIndex === there.ringIndex && here.distanceKm <= toleranceKm && there.distanceKm <= toleranceKm;
    const arc = sameRing ? boundaryArc(parentRings[here.ringIndex], here, there, toleranceKm, cityRings) : [];
    if (!arc.length || arc.some((point) => claimedByNeighbor(point, cityRings, blockers))) continue;
    const alone = assemble(open, new Map([[index, { start: here.point, arc }]]));
    if (alone && areaIsSafe(ringKm2(open), ringKm2(alone))) {
      candidates.set(index, { start: here.point, arc });
    }
  }
  const chosen = new Map();
  const before = ringKm2(open);
  for (const [index, replacement] of candidates) {
    const next = new Map(chosen);
    next.set(index, replacement);
    const trial = assemble(open, next);
    if (trial && areaIsSafe(before, ringKm2(trial)) && areaIsSafe(ringKm2(assemble(open, chosen)), ringKm2(trial))) {
      chosen.set(index, replacement);
    }
  }
  return assemble(open, chosen) || ring.map(roundPoint);
}

/**
 * Pull city edges that already run near the parent outline onto that outline,
 * so the shared border uses the parent's coordinates.
 */
export function fitCityToParent(cityGeometry, parentGeometry, toleranceKm = 3, blockers = []) {
  const parentRings = ringsOf(parentGeometry);
  const polygons = cityGeometry.type === "Polygon" ? [cityGeometry.coordinates] : cityGeometry.coordinates;
  const fitted = [];
  for (const polygon of polygons) {
    const rings = polygon
      .map((ring) => fitRing(ring, parentRings, toleranceKm, blockers))
      .filter((ring) => ring.length >= 4);
    if (rings.length) fitted.push(rings);
  }
  if (!fitted.length) return cityGeometry;
  return { type: "MultiPolygon", coordinates: fitted };
}

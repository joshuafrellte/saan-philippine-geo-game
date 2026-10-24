import { geoArea } from "d3-geo";

/** Drop province borders that are shared by two rings, leaving the region edge. */
export function regionOutline(geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.coordinates || [];
  const counts = new Map();
  const pointOf = new Map();

  function pointId(point) {
    const key = `${point[0]},${point[1]}`;
    pointOf.set(key, point);
    return key;
  }

  function edgeId(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = pointId(ring[index]);
        const end = pointId(ring[index + 1]);
        if (start === end) continue;
        const key = edgeId(start, end);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  const neighbors = new Map();
  for (const [key, count] of counts) {
    if (count !== 1) continue;
    const [start, end] = key.split("|");
    if (!neighbors.has(start)) neighbors.set(start, []);
    if (!neighbors.has(end)) neighbors.set(end, []);
    neighbors.get(start).push(end);
    neighbors.get(end).push(start);
  }

  const used = new Set();
  const rings = [];
  for (const start of neighbors.keys()) {
    const open = neighbors.get(start).find((next) => !used.has(edgeId(start, next)));
    if (!open) continue;
    const ring = [pointOf.get(start)];
    let previous = null;
    let current = start;
    for (let guard = 0; guard < counts.size + 2; guard += 1) {
      const next = neighbors
        .get(current)
        .find((candidate) => candidate !== previous && !used.has(edgeId(current, candidate)));
      if (!next) break;
      used.add(edgeId(current, next));
      ring.push(pointOf.get(next));
      if (next === start) break;
      previous = current;
      current = next;
    }
    const closed =
      ring.length >= 4 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    if (closed) rings.push(ring);
  }

  const oriented = rings.map((ring) => {
    const polygon = { type: "Polygon", coordinates: [ring] };
    const reversed = { type: "Polygon", coordinates: [ring.slice().reverse()] };
    return geoArea(polygon) > geoArea(reversed) ? reversed.coordinates[0] : ring;
  });
  return { type: "MultiPolygon", coordinates: oriented.map((ring) => [ring]) };
}

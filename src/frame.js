/** Which shape a Type it question should frame. A region uses its own shape. */
export function frameSpec(place, landmarks = []) {
  if (!place) return null;
  if (place.kind === "province") return place.regionRecord?.feature || place.feature || null;
  if (place.kind === "city") {
    if (place.provinceRecord?.feature) return place.provinceRecord.feature;
    const landmark = landmarks.find(
      (feature) => feature.properties?.kind === "landmark" && feature.properties?.id === place.region
    );
    return landmark || place.regionRecord?.feature || null;
  }
  if (place.kind === "region") return place.feature || null;
  return null;
}

/**
 * Zoom that fits a projected bbox inside the view.
 * `coverage` is the share of the shorter side the bbox may occupy.
 * A scale near 1 stays on the whole country.
 */
export function fitTransform(bounds, width, height, { coverage = 0.62, maxScale = 8, minScale = 1.15 } = {}) {
  const identity = { k: 1, x: 0, y: 0 };
  if (!bounds || width < 10 || height < 10) return identity;
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];
  if (!(dx > 0) || !(dy > 0)) return identity;
  const cx = (bounds[0][0] + bounds[1][0]) / 2;
  const cy = (bounds[0][1] + bounds[1][1]) / 2;
  let scale = Math.min((width * coverage) / dx, (height * coverage) / dy);
  scale = Math.max(1, Math.min(maxScale, scale));
  if (scale <= minScale) return identity;
  return {
    k: scale,
    x: width / 2 - scale * cx,
    y: height / 2 - scale * cy,
  };
}

export function projectPoint(transform, x, y) {
  return [transform.k * x + transform.x, transform.k * y + transform.y];
}

/** True when every corner of the bbox lands inside the view, inset by pad. */
export function boundsInside(bounds, transform, width, height, pad = 0) {
  const corners = [
    [bounds[0][0], bounds[0][1]],
    [bounds[1][0], bounds[0][1]],
    [bounds[0][0], bounds[1][1]],
    [bounds[1][0], bounds[1][1]],
  ];
  return corners.every(([x, y]) => {
    const [sx, sy] = projectPoint(transform, x, y);
    return sx >= pad && sx <= width - pad && sy >= pad && sy <= height - pad;
  });
}

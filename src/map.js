import { geoMercator, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { regionOutline } from "./outline.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const QUIET_PROVINCE_BORDERS = true;
const RING_RADIUS = 18;
const FRAME_MS = 400;

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function mountMap(svg, atlas, onPick, onHover = () => {}) {
  for (const region of atlas.regions) {
    if (!region.feature) continue;
    const outline = regionOutline(region.feature.geometry);
    if (outline.coordinates.length) region.outline = outline;
  }
  const viewport = element("g", { class: "viewport" });
  const land = element("g", { class: "land-layer" });
  viewport.append(land);
  const screen = element("g", { class: "screen-layer" });
  const ringDark = element("circle", {
    class: "target-ring target-ring-dark",
    r: RING_RADIUS,
    "pointer-events": "none",
  });
  const ringLight = element("circle", {
    class: "target-ring",
    r: RING_RADIUS,
    "pointer-events": "none",
  });
  const label = element("text", {
    class: "map-label",
    "text-anchor": "middle",
    "pointer-events": "none",
  });
  screen.append(ringDark, ringLight, label);
  svg.replaceChildren(viewport, screen);

  const selection = select(svg);
  let path = geoPath();
  let projection = null;
  let question = null;
  let wrongId = null;
  let locked = false;
  let activeCities = atlas.cities;
  let outlines = { provinces: true, cities: true };
  let study = null;
  let fitKey = "country";
  let suppressClick = false;
  let pointer = null;
  let transform = zoomIdentity;
  let fitted = { width: 0, height: 0 };
  let ringPoint = null;
  let labelPoint = null;
  let labelText = "";
  let locateEnabled = true;
  let shownKey = null;
  let framedKey = null;
  let holdCountry = false;
  let playerAdjusted = false;
  let tweenToken = 0;
  let tweenFrame = 0;

  function cancelTween() {
    tweenToken += 1;
    if (tweenFrame) cancelAnimationFrame(tweenFrame);
    tweenFrame = 0;
  }

  function applyProvinceFade(k) {
    if (!QUIET_PROVINCE_BORDERS) {
      land.style.removeProperty("--province-alpha");
      land.style.removeProperty("--province-width");
      return;
    }
    const t = Math.min(1, Math.max(0, (k - 1) / 3));
    land.style.setProperty("--province-alpha", (0.28 + 0.72 * t).toFixed(3));
    land.style.setProperty("--province-width", (0.55 + 0.7 * t).toFixed(3));
  }

  function placeOverlay() {
    const showRing = Boolean(ringPoint);
    ringDark.setAttribute("display", showRing ? "inline" : "none");
    ringLight.setAttribute("display", showRing ? "inline" : "none");
    if (showRing) {
      const x = transform.applyX(ringPoint[0]);
      const y = transform.applyY(ringPoint[1]);
      ringDark.setAttribute("cx", x);
      ringDark.setAttribute("cy", y);
      ringLight.setAttribute("cx", x);
      ringLight.setAttribute("cy", y);
    }
    const showLabel = Boolean(labelText && labelPoint);
    label.setAttribute("display", showLabel ? "inline" : "none");
    if (showLabel) {
      const x = transform.applyX(labelPoint[0]);
      const y = transform.applyY(labelPoint[1]);
      label.setAttribute("x", x);
      label.setAttribute("y", y + RING_RADIUS + 16);
      label.textContent = labelText;
    }
  }

  const behavior = zoom()
    .scaleExtent([1, 18])
    .filter((event) => {
      if (event.type === "dblclick") return false;
      return !event.button;
    })
    .on("zoom", (event) => {
      if (event.sourceEvent) cancelTween();
      transform = event.transform;
      viewport.setAttribute("transform", event.transform);
      applyProvinceFade(event.transform.k);
      placeOverlay();
      if (event.sourceEvent && question?.mode === "type") playerAdjusted = true;
    });

  selection.call(behavior);

  svg.addEventListener("pointerdown", (event) => {
    cancelTween();
    suppressClick = false;
    pointer = { x: event.clientX, y: event.clientY, moved: false };
  });
  svg.addEventListener("pointermove", (event) => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (dx * dx + dy * dy > 36) pointer.moved = true;
  });
  svg.addEventListener("pointerup", () => {
    suppressClick = Boolean(pointer?.moved);
    pointer = null;
  });
  svg.addEventListener("pointercancel", () => {
    pointer = null;
  });
  svg.addEventListener("pointerleave", () => onHover("", null));

  function collectionForFit() {
    if (question?.map === "daily" && question.place?.feature) return question.place.feature;
    return {
      type: "FeatureCollection",
      features: atlas.regions.map((region) => region.feature).filter(Boolean),
    };
  }

  function classesFor(id, { inert = false, landmark = false, underlay = false, quiet = false } = {}) {
    const classes = ["land"];
    if (landmark || underlay) classes.push("land-extra");
    if (quiet) classes.push("is-quiet");
    if (study?.selectedId === id) classes.push("is-target");
    if (study || inert) return classes.join(" ");
    if (wrongId && wrongId === id) classes.push("is-wrong");
    else if (locked && !question?.highlightId && question?.targetId === id) classes.push("is-correct");
    else if (question?.highlightId === id) {
      classes.push("is-target");
      if (locked && question.mode === "type") classes.push("is-revealed");
    } else if (question?.highlightId) classes.push("is-dim");
    return classes.join(" ");
  }

  function centroidOf(feature) {
    const [x, y] = path.centroid(feature);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
  }

  function addShape(feature, { clickable, underlay = false, noStroke = false, quiet = false, label: shapeLabel = "", anonymous = false }) {
    const id = feature.properties.id;
    let className = `${classesFor(id, {
      inert: !clickable,
      underlay,
      quiet,
      landmark: feature.properties.kind === "landmark",
    })}${noStroke ? " no-stroke" : ""}`;
    if (feature.properties.kind === "province" && !noStroke) className += " is-province";
    const shape = element("path", {
      d: path(feature) || "",
      class: className,
      "data-name": anonymous ? "" : feature.properties.name || "",
    });
    const point = centroidOf(feature);
    if (!study && question && point) {
      if (question.highlightId === id) ringPoint = point;
      if (labelText && (question.highlightId === id || question.targetId === id)) labelPoint = point;
    }
    if (!clickable || question?.mode === "type") {
      shape.setAttribute("pointer-events", "none");
    } else {
      if (study) {
        const name = shapeLabel || feature.properties.name || "";
        shape.addEventListener("pointerenter", (event) => onHover(name, event));
        shape.addEventListener("pointermove", (event) => onHover(name, event));
      }
      shape.addEventListener("click", () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (locked && !study) return;
        onPick(feature.properties);
      });
    }
    land.append(shape);
    return shape;
  }

  function labelFor(id, fallback) {
    const place = atlas.cities.find((city) => city.id === id)
      || atlas.provinces.find((province) => province.id === id)
      || atlas.regions.find((region) => region.id === id);
    return place?.label || place?.name || fallback || "";
  }

  function appendRegionOutlines() {
    for (const region of atlas.regions) {
      if (!region.outline) continue;
      land.append(element("path", {
        d: path(region.outline) || "",
        class: "region-outline",
        "pointer-events": "none",
      }));
    }
  }

  function drawStudy() {
    const level = study.level;
    const provinceBorders = outlines.provinces !== false;
    const cityBorders = outlines.cities !== false;
    for (const region of atlas.regions) {
      if (!region.feature) continue;
      addShape(region.feature, {
        clickable: level === "region",
        noStroke: level !== "region",
        label: labelFor(region.id, region.name),
      });
    }
    if (level === "region") return;

    for (const province of atlas.provinces) {
      if (!province.feature) continue;
      addShape(province.feature, {
        clickable: level === "province",
        noStroke: !provinceBorders,
        label: labelFor(province.id, province.name),
      });
    }
    if (provinceBorders) appendRegionOutlines();
    if (level !== "city") return;

    for (const city of atlas.cities) {
      if (!city.feature) continue;
      addShape(city.feature, {
        clickable: true,
        noStroke: !cityBorders,
        label: labelFor(city.id, city.name),
      });
    }
  }

  function draw() {
    ringPoint = null;
    labelPoint = null;
    labelText = !study && locked && question?.place ? question.place.label || question.place.name || "" : "";
    land.replaceChildren();
    if (!path) {
      placeOverlay();
      return;
    }
    if (study) {
      drawStudy();
      placeOverlay();
      return;
    }
    if (question?.map === "daily") {
      if (question.place?.feature) addShape(question.place.feature, { clickable: false, anonymous: true });
      placeOverlay();
      return;
    }

    if (!question || question.map === "region") {
      const provinceBorders = outlines.provinces !== false;
      for (const region of atlas.regions) {
        if (!region.feature) continue;
        addShape(region.feature, { clickable: true, noStroke: !provinceBorders });
      }
      if (!provinceBorders) appendRegionOutlines();
      placeOverlay();
      return;
    }

    if (question.map === "city") {
      const provinceBorders = outlines.provinces !== false;
      for (const feature of atlas.provincesGeo.features) {
        addShape(feature, { clickable: false, underlay: true, noStroke: !provinceBorders });
      }
      if (provinceBorders) appendRegionOutlines();
      const cityBorders = outlines.cities !== false;
      for (const city of activeCities) {
        if (!city.feature) continue;
        addShape(city.feature, { clickable: true, noStroke: !cityBorders });
      }
      placeOverlay();
      return;
    }

    const provinceBorders = outlines.provinces !== false;
    for (const feature of atlas.provincesGeo.features) {
      if (feature.properties.kind !== "landmark") continue;
      addShape(feature, { clickable: !feature.properties.inert, noStroke: !provinceBorders });
    }
    for (const province of atlas.provinces) {
      if (!province.feature) continue;
      addShape(province.feature, { clickable: true, noStroke: !provinceBorders });
    }
    if (provinceBorders) appendRegionOutlines();
    if (outlines.cities !== false && question?.map === "province") {
      for (const city of activeCities) {
        if (!city.feature) continue;
        const outline = element("path", {
          d: path(city.feature) || "",
          class: "city-outline",
          "pointer-events": "none",
        });
        land.append(outline);
      }
    }
    placeOverlay();
  }

  function geographicCenter() {
    if (!projection || !fitted.width || !transform.k) return null;
    const cx = (fitted.width / 2 - transform.x) / transform.k;
    const cy = (fitted.height / 2 - transform.y) / transform.k;
    const geo = projection.invert([cx, cy]);
    if (!geo || !Number.isFinite(geo[0]) || !Number.isFinite(geo[1])) return null;
    return { geo, k: transform.k };
  }

  function landmarkFeature(id) {
    return atlas.provincesGeo.features.find(
      (feature) => feature.properties?.kind === "landmark" && feature.properties?.id === id
    ) || null;
  }

  function frameFeature() {
    const place = question?.place;
    if (!place || question.mode !== "type") return null;
    if (place.kind === "province") return place.regionRecord?.feature || null;
    if (place.kind === "city") {
      if (place.provinceRecord?.feature) return place.provinceRecord.feature;
      return landmarkFeature(place.region) || place.regionRecord?.feature || null;
    }
    return null;
  }

  function transformFor(feature) {
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (width < 10 || height < 10) return null;
    const bounds = path.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    if (!(dx > 0) || !(dy > 0)) return null;
    const cx = (bounds[0][0] + bounds[1][0]) / 2;
    const cy = (bounds[0][1] + bounds[1][1]) / 2;
    let scale = Math.min((width * 0.62) / dx, (height * 0.62) / dy);
    scale = Math.max(1, Math.min(8, scale));
    if (scale <= 1.05) return zoomIdentity;
    return zoomIdentity.translate(width / 2 - scale * cx, height / 2 - scale * cy).scale(scale);
  }

  function applyTransform(next) {
    behavior.transform(selection, next);
  }

  function easeTo(next) {
    cancelTween();
    if (!next) return;
    if (
      Math.abs(next.k - transform.k) < 0.02 &&
      Math.hypot(next.x - transform.x, next.y - transform.y) < 2
    ) {
      return;
    }
    if (reducedMotion()) {
      applyTransform(next);
      return;
    }
    const token = tweenToken;
    const start = transform;
    const t0 = performance.now();
    const step = (now) => {
      if (token !== tweenToken) return;
      const t = Math.min(1, (now - t0) / FRAME_MS);
      const eased = 1 - (1 - t) * (1 - t);
      applyTransform(zoomIdentity.translate(
        start.x + (next.x - start.x) * eased,
        start.y + (next.y - start.y) * eased
      ).scale(start.k + (next.k - start.k) * eased));
      if (t < 1) tweenFrame = requestAnimationFrame(step);
      else tweenFrame = 0;
    };
    tweenFrame = requestAnimationFrame(step);
  }

  function maybeFrame() {
    if (study || question?.mode !== "type" || !question.key) return;
    if (framedKey === question.key) return;
    framedKey = question.key;
    if (!locateEnabled || holdCountry || playerAdjusted) return;
    const feature = frameFeature();
    if (!feature) return;
    easeTo(transformFor(feature));
  }

  function fit() {
    cancelTween();
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (width < 10 || height < 10) return;
    const saved = question?.mode === "type" && playerAdjusted ? geographicCenter() : null;
    const restoreFrame = question?.mode === "type"
      && locateEnabled
      && !holdCountry
      && !playerAdjusted
      && framedKey === question.key;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    projection = geoMercator().fitExtent(
      [
        [18, 18],
        [width - 18, height - 18],
      ],
      collectionForFit()
    );
    path = geoPath(projection);
    fitted = { width, height };
    applyTransform(zoomIdentity);
    draw();
    if (question?.mode !== "type") frameQuestion();
    if (saved) {
      const px = projection(saved.geo);
      if (px && Number.isFinite(px[0]) && Number.isFinite(px[1])) {
        const k = Math.max(1, Math.min(18, saved.k));
        applyTransform(zoomIdentity.translate(width / 2 - k * px[0], height / 2 - k * px[1]).scale(k));
      }
    } else if (restoreFrame) {
      const feature = frameFeature();
      const next = feature ? transformFor(feature) : null;
      if (next) applyTransform(next);
    }
  }

  function frameQuestion(duringAnswer = false) {
    if (!question || question.map !== "city") return;
    if (locked && duringAnswer) return;
    applyTransform(zoomIdentity);
  }

  const observer = new ResizeObserver(() => fit());
  observer.observe(svg);
  fit();

  return {
    show(nextQuestion, { wrongId: nextWrong = null, locked: nextLocked = false, cities = null, outlines: nextOutlines = null, study: nextStudy = null, locate: nextLocate = null } = {}) {
      if (typeof nextLocate === "boolean") locateEnabled = nextLocate;
      study = nextStudy;
      question = nextStudy ? null : nextQuestion;
      wrongId = nextStudy ? null : nextWrong;
      locked = nextStudy ? false : nextLocked;
      if (cities) activeCities = cities;
      if (nextOutlines) outlines = nextOutlines;
      if (!nextStudy && question?.key && question.key !== shownKey) {
        shownKey = question.key;
        holdCountry = false;
        playerAdjusted = false;
        framedKey = null;
      }
      const nextKey = question?.map === "daily" && question.place?.feature ? `daily:${question.place.id}` : "country";
      if (nextKey !== fitKey) {
        fitKey = nextKey;
        fit();
        if (!nextStudy) maybeFrame();
        return;
      }
      draw();
      if (!nextStudy && question?.mode !== "type") frameQuestion(true);
      if (!nextStudy) maybeFrame();
    },
    resetZoom() {
      cancelTween();
      holdCountry = true;
      playerAdjusted = false;
      applyTransform(zoomIdentity);
    },
    zoomBy(factor) {
      cancelTween();
      if (question?.mode === "type") playerAdjusted = true;
      behavior.scaleBy(selection, factor);
    },
  };
}

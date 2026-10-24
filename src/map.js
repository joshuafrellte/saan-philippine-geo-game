import { geoMercator, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { regionOutline } from "./outline.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
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
  svg.replaceChildren(viewport);

  const selection = select(svg);
  let path = geoPath();
  let question = null;
  let wrongId = null;
  let locked = false;
  let activeCities = atlas.cities;
  let outlines = { provinces: true, cities: true };
  let study = null;
  let fitKey = "country";
  let suppressClick = false;
  let pointer = null;

  const behavior = zoom()
    .scaleExtent([1, 18])
    .filter((event) => {
      if (event.type === "dblclick") return false;
      return !event.button;
    })
    .on("zoom", (event) => {
      viewport.setAttribute("transform", event.transform);
    });

  selection.call(behavior);

  svg.addEventListener("pointerdown", (event) => {
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
    else if (question?.highlightId === id) classes.push("is-target");
    else if (question?.highlightId) classes.push("is-dim");
    return classes.join(" ");
  }

  function addShape(feature, { clickable, underlay = false, noStroke = false, quiet = false, label = "", anonymous = false }) {
    const id = feature.properties.id;
    const shape = element("path", {
      d: path(feature) || "",
      class: `${classesFor(id, {
        inert: !clickable,
        underlay,
        quiet,
        landmark: feature.properties.kind === "landmark",
      })}${noStroke ? " no-stroke" : ""}`,
      "data-name": anonymous ? "" : feature.properties.name || "",
    });
    if (!clickable || question?.mode === "type") {
      shape.setAttribute("pointer-events", "none");
    } else {
      if (study) {
        const name = label || feature.properties.name || "";
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

  function addRing(feature) {
    const [x, y] = path.centroid(feature);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    land.append(
      element("circle", {
        class: "target-ring",
        cx: x,
        cy: y,
        r: 13,
        "pointer-events": "none",
      })
    );
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
        label: labelFor(province.id, province.name),
      });
    }
    appendRegionOutlines();
    if (level !== "city") return;

    for (const city of atlas.cities) {
      if (!city.feature) continue;
      addShape(city.feature, {
        clickable: true,
        label: labelFor(city.id, city.name),
      });
    }
  }

  function draw() {
    land.replaceChildren();
    if (!path) return;
    if (study) {
      drawStudy();
      return;
    }
    if (question?.map === "daily") {
      if (question.place?.feature) addShape(question.place.feature, { clickable: false, anonymous: true });
      return;
    }

    if (!question || question.map === "region") {
      const provinceBorders = outlines.provinces !== false;
      for (const region of atlas.regions) {
        if (!region.feature) continue;
        addShape(region.feature, { clickable: true, noStroke: !provinceBorders });
        if (question?.highlightId === region.id) addRing(region.feature);
      }
      if (!provinceBorders) {
        for (const region of atlas.regions) {
          if (!region.outline) continue;
          const outline = element("path", {
            d: path(region.outline) || "",
            class: "region-outline",
            "pointer-events": "none",
          });
          land.append(outline);
        }
      }
      return;
    }

    if (question.map === "city") {
      const provinceBorders = outlines.provinces !== false;
      for (const feature of atlas.provincesGeo.features) {
        addShape(feature, { clickable: false, underlay: true, noStroke: !provinceBorders });
      }
      const cityBorders = outlines.cities !== false;
      for (const city of activeCities) {
        if (!city.feature) continue;
        addShape(city.feature, { clickable: true, noStroke: !cityBorders });
        if (question.highlightId === city.id) addRing(city.feature);
      }
      return;
    }

    for (const feature of atlas.provincesGeo.features) {
      if (feature.properties.kind !== "landmark") continue;
      addShape(feature, { clickable: !feature.properties.inert });
    }
    for (const province of atlas.provinces) {
      if (!province.feature) continue;
      addShape(province.feature, { clickable: true });
      if (question?.highlightId === province.id) addRing(province.feature);
    }
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
  }

  function fit() {
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (width < 10 || height < 10) return;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const projection = geoMercator().fitExtent(
      [
        [18, 18],
        [width - 18, height - 18],
      ],
      collectionForFit()
    );
    path = geoPath(projection);
    behavior.transform(selection, zoomIdentity);
    draw();
    frameQuestion();
  }

  function frameQuestion(duringAnswer = false) {
    if (!question || question.map !== "city") return;
    if (locked && duringAnswer) return;
    behavior.transform(selection, zoomIdentity);
  }

  const observer = new ResizeObserver(() => fit());
  observer.observe(svg);
  fit();

  return {
    show(nextQuestion, { wrongId: nextWrong = null, locked: nextLocked = false, cities = null, outlines: nextOutlines = null, study: nextStudy = null } = {}) {
      study = nextStudy;
      question = nextStudy ? null : nextQuestion;
      wrongId = nextStudy ? null : nextWrong;
      locked = nextStudy ? false : nextLocked;
      if (cities) activeCities = cities;
      if (nextOutlines) outlines = nextOutlines;
      const nextKey = question?.map === "daily" && question.place?.feature ? `daily:${question.place.id}` : "country";
      if (nextKey !== fitKey) {
        fitKey = nextKey;
        fit();
        return;
      }
      draw();
      if (!nextStudy) frameQuestion(true);
    },
    resetZoom() {
      behavior.transform(selection, zoomIdentity);
    },
    zoomBy(factor) {
      behavior.scaleBy(selection, factor);
    },
  };
}

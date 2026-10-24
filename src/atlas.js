const GEOMETRY_TYPES = new Set(["Polygon", "MultiPolygon"]);

function hasGeometry(feature) {
  return Boolean(
    feature &&
      GEOMETRY_TYPES.has(feature.geometry?.type) &&
      feature.geometry.coordinates?.length
  );
}

/**
 * Join the hand-edited place list to region, province, and city shapes.
 * Rows match GeoJSON on id.
 */
export function buildAtlas(places, provincesGeo, regionsGeo, citiesGeo) {
  const provinceFeatures = new Map(
    (provincesGeo?.features || [])
      .filter((feature) => feature.properties?.kind === "province")
      .map((feature) => [feature.properties.id, feature])
  );
  const regionFeatures = new Map(
    (regionsGeo?.features || []).map((feature) => [feature.properties?.id, feature])
  );
  const cityFeatures = new Map(
    (citiesGeo?.features || [])
      .filter((feature) => feature.properties?.kind === "city")
      .map((feature) => [feature.properties.id, feature])
  );

  const regions = (places?.regions || []).map((region) => ({
    ...region,
    kind: "region",
    feature: regionFeatures.get(region.id) || null,
  }));
  const regionById = new Map(regions.map((region) => [region.id, region]));

  const provinces = (places?.provinces || []).map((province) => ({
    ...province,
    kind: "province",
    feature: provinceFeatures.get(province.id) || null,
    regionRecord: regionById.get(province.region) || null,
  }));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));

  const cities = (places?.cities || []).map((city) => ({
    ...city,
    kind: "city",
    feature: cityFeatures.get(city.id) || null,
    regionRecord: regionById.get(city.region) || null,
    provinceRecord: provinceById.get(city.province) || null,
  }));
  const sharedNames = new Map();
  for (const city of cities) sharedNames.set(city.name, (sharedNames.get(city.name) || 0) + 1);
  for (const city of cities) {
    city.label =
      sharedNames.get(city.name) > 1 && city.provinceRecord
        ? `${city.name}, ${city.provinceRecord.name}`
        : city.name;
  }

  return { regions, provinces, cities, provincesGeo, regionsGeo, citiesGeo };
}

/** Problems that would make a place unusable in the quiz or on the map. */
export function validateAtlas(atlas) {
  const errors = [];
  const regionIds = new Set(atlas.regions.map((region) => region.id));
  const provinceFeatures = (atlas.provincesGeo?.features || []).filter(
    (feature) => feature.properties?.kind === "province"
  );
  const geometryIds = provinceFeatures.map((feature) => feature.properties?.id);
  if (new Set(geometryIds).size !== geometryIds.length) {
    errors.push("duplicate province geometry id");
  }

  const featureById = new Map(provinceFeatures.map((feature) => [feature.properties.id, feature]));
  const placeIds = new Set();

  for (const province of atlas.provinces) {
    if (placeIds.has(province.id)) errors.push(`${province.name}: duplicate id`);
    placeIds.add(province.id);

    if (!province.region || !regionIds.has(province.region)) {
      errors.push(`${province.name}: missing region`);
    }
    if (!province.name || !province.capital || !Array.isArray(province.aliases)) {
      errors.push(`${province.name || province.id}: needs name, aliases, and capital`);
    }
    const feature = featureById.get(province.id);
    if (!hasGeometry(feature)) {
      errors.push(`${province.name}: missing geometry`);
    }
  }

  for (const feature of provinceFeatures) {
    if (!placeIds.has(feature.properties.id)) {
      errors.push(`${feature.properties.id}: geometry has no province record`);
    }
  }

  for (const region of atlas.regions) {
    if (!region.name || !region.capital || !Array.isArray(region.aliases)) {
      errors.push(`${region.name || region.id}: needs name, aliases, and capital`);
    }
    if (!hasGeometry(region.feature)) {
      errors.push(`${region.name}: missing geometry`);
    }
  }

  const cityFeatures = (atlas.citiesGeo?.features || []).filter(
    (feature) => feature.properties?.kind === "city"
  );
  const cityGeometryIds = cityFeatures.map((feature) => feature.properties?.id);
  if (new Set(cityGeometryIds).size !== cityGeometryIds.length) {
    errors.push("duplicate city geometry id");
  }
  const cityFeatureById = new Map(cityFeatures.map((feature) => [feature.properties.id, feature]));
  const cityIds = new Set();
  const provinceIds = new Set(atlas.provinces.map((province) => province.id));

  for (const city of atlas.cities || []) {
    if (cityIds.has(city.id)) errors.push(`${city.name}: duplicate id`);
    cityIds.add(city.id);
    if (!city.name || !Array.isArray(city.aliases)) {
      errors.push(`${city.name || city.id}: needs name and aliases`);
    }
    if (!city.region || !regionIds.has(city.region)) {
      errors.push(`${city.name}: missing region`);
    }
    if (city.province && !provinceIds.has(city.province)) {
      errors.push(`${city.name}: missing province`);
    }
    if (!hasGeometry(cityFeatureById.get(city.id))) {
      errors.push(`${city.name}: missing geometry`);
    }
  }

  for (const feature of cityFeatures) {
    if (!cityIds.has(feature.properties.id)) {
      errors.push(`${feature.properties.id}: geometry has no city record`);
    }
  }

  return errors;
}

const fs = require("fs");
const vm = require("vm");

const DEFAULT_SETTINGS = {
  idealDistanceKm: 160,
  nearDistanceSpreadKm: 335,
  distanceSpreadKm: 180,
  metroPenalty: 0.8,
};

const SEOUL_BASE = {
  lat: 37.5665,
  lng: 126.9780,
};

function loadRegions() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("data/regions.js", "utf8"), context);
  return context.window.CANDIDATE_REGIONS;
}

function haversineKm(a, b) {
  const earthRadiusKm = 6371.0088;
  const toRad = (degree) => degree * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(x));
}

function score(region) {
  const distanceKm = haversineKm(SEOUL_BASE, region);
  const spreadKm = distanceKm < DEFAULT_SETTINGS.idealDistanceKm
    ? DEFAULT_SETTINGS.nearDistanceSpreadKm
    : DEFAULT_SETTINGS.distanceSpreadKm;
  const distanceWeight = Math.exp(
    -Math.abs(distanceKm - DEFAULT_SETTINGS.idealDistanceKm) / spreadKm,
  );
  const typeWeight = region.type === "광역시" || region.type === "특별자치시"
    ? DEFAULT_SETTINGS.metroPenalty
    : 1;

  return {
    ...region,
    distanceKm,
    weight: distanceWeight * typeWeight,
  };
}

const scored = loadRegions().map(score);
const totalWeight = scored.reduce((sum, region) => sum + region.weight, 0);
const totalPercent = scored.reduce((sum, region) => sum + region.weight / totalWeight * 100, 0);
const topFive = scored
  .slice()
  .sort((a, b) => b.weight - a.weight)
  .slice(0, 5)
  .map((region) => ({
    region: region.fullName,
    distanceKm: Number(region.distanceKm.toFixed(1)),
    probabilityPercent: Number((region.weight / totalWeight * 100).toFixed(3)),
  }));

console.log(JSON.stringify({
  count: scored.length,
  totalWeight: Number(totalWeight.toFixed(6)),
  totalPercent: Number(totalPercent.toFixed(12)),
  topFive,
}, null, 2));

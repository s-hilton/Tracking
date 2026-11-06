// Live data sources: Census boundaries (states, counties, cities/towns/townships)
// and OpenStreetMap queries. Fetched from the browser, nothing copied into the repo.
//
// Layer ids and field names are looked up from each service when first used
// (instead of hard-coded), so a service renumbering its layers or changing the
// case of a field name doesn't break the app.
import { fromEsriRings, boundsOf, pointInRings } from './geo.js';

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
// OpenStreetMap's query servers. The main one is often busy, so each request
// falls through to the next mirror on a timeout, rate limit or server error.
export const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export async function getJson(url, params = {}, signal) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const res = await fetch(u, { signal });
  if (!res.ok) throw new Error(`${u.host} answered ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || `${u.host} reported an error`);
  return data;
}

// Case-insensitive attribute lookup: attr(a, 'NAME', 'BASENAME').
export function attr(attributes, ...names) {
  if (!attributes) return undefined;
  const lower = {};
  for (const k of Object.keys(attributes)) lower[k.toLowerCase()] = attributes[k];
  for (const n of names) { const v = lower[n.toLowerCase()]; if (v != null && v !== '') return v; }
  return undefined;
}

// ---- ArcGIS layers --------------------------------------------------------

const layerCache = new Map();
async function findLayer(service, test) {
  const key = `${service}|${test}`;
  if (!layerCache.has(key)) {
    layerCache.set(key, getJson(service, { f: 'json' }).then((d) => {
      const layer = (d.layers ?? []).find((l) => test.test(l.name));
      if (!layer) throw new Error(`No “${test.source}” layer at ${service}`);
      return `${service}/${layer.id}`;
    }).catch((err) => { layerCache.delete(key); throw err; }));
  }
  return layerCache.get(key);
}

export async function queryLayer(layerUrl, params, signal) {
  return getJson(`${layerUrl}/query`, { f: 'json', outSR: 4326, ...params }, signal);
}

export const envelope = ({ s, w, n, e }) => ({
  geometry: `${w},${s},${e},${n}`, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
});

// ---- Census boundaries (TIGERweb) ----------------------------------------

const STATE_COUNTY = `${TIGER}/State_County/MapServer`;
const PLACES = `${TIGER}/Places_CouSub_ConCity_SubMCD/MapServer`;

export async function stateShape(fips, signal) {
  const layer = await findLayer(STATE_COUNTY, /^states$/i);
  const d = await queryLayer(layer, { where: `STATE='${fips}'`, outFields: 'NAME', returnGeometry: true, maxAllowableOffset: 0.01 }, signal);
  return fromEsriRings(d.features?.[0]?.geometry?.rings);
}

export async function counties(stateFips, signal) {
  const layer = await findLayer(STATE_COUNTY, /^counties$/i);
  const d = await queryLayer(layer, { where: `STATE='${stateFips}'`, outFields: '*', returnGeometry: false }, signal);
  return (d.features ?? []).map(({ attributes: a }) => ({
    fips: String(attr(a, 'COUNTY')).padStart(3, '0'),
    name: attr(a, 'NAME', 'BASENAME'),
  })).sort((x, y) => x.name.localeCompare(y.name));
}

export async function countyShape(stateFips, countyFips, signal) {
  const layer = await findLayer(STATE_COUNTY, /^counties$/i);
  const d = await queryLayer(layer, { where: `STATE='${stateFips}' AND COUNTY='${countyFips}'`, outFields: 'NAME', returnGeometry: true, maxAllowableOffset: 0.002 }, signal);
  return fromEsriRings(d.features?.[0]?.geometry?.rings);
}

// Cities, towns, villages, boroughs and (in the Northeast and Midwest) the towns
// and townships that are county subdivisions. Only functioning governments
// (FUNCSTAT A/B/C…) are kept; census-only areas (CDPs, CCDs) are left out.
const GOVERNMENT = new Set(['A', 'B', 'C', 'G', 'I']);
export async function municipalities(stateFips, countyFips, countyRings, signal) {
  const [placeLayer, cousubLayer] = await Promise.all([
    findLayer(PLACES, /incorporated places/i),
    findLayer(PLACES, /county subdivisions/i),
  ]);
  const box = boundsOf(countyRings);
  const [places, subs] = await Promise.all([
    box ? queryLayer(placeLayer, { where: `STATE='${stateFips}'`, outFields: '*', returnGeometry: false, ...envelope(box) }, signal) : { features: [] },
    queryLayer(cousubLayer, { where: `STATE='${stateFips}' AND COUNTY='${countyFips}'`, outFields: '*', returnGeometry: false }, signal),
  ]);
  const out = new Map();
  const add = (a, layer, kind) => {
    const status = attr(a, 'FUNCSTAT');
    if (status && !GOVERNMENT.has(status)) return;
    const lat = Number(attr(a, 'CENTLAT', 'INTPTLAT')); const lng = Number(attr(a, 'CENTLON', 'INTPTLON'));
    if (kind === 'place' && countyRings.length && Number.isFinite(lat) && !pointInRings(lat, lng, countyRings)) return;
    const geoid = String(attr(a, 'GEOID'));
    out.set(`${kind}:${geoid}`, { id: `${kind}:${geoid}`, kind, layer, geoid, name: attr(a, 'NAME', 'BASENAME'), lat, lng });
  };
  (places.features ?? []).forEach((f) => add(f.attributes, placeLayer, 'place'));
  (subs.features ?? []).forEach((f) => add(f.attributes, cousubLayer, 'cousub'));
  // A town that is both an incorporated place and a county subdivision shows once.
  const seen = new Set();
  return [...out.values()].sort((x, y) => x.name.localeCompare(y.name)).filter((m) => {
    const k = m.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true;
  });
}

export async function municipalityShape(m, signal) {
  const d = await queryLayer(m.layer, { where: `GEOID='${m.geoid}'`, outFields: 'NAME', returnGeometry: true, maxAllowableOffset: 0.0005 }, signal);
  return fromEsriRings(d.features?.[0]?.geometry?.rings);
}

// ---- OpenStreetMap (Overpass) ----------------------------------------------

export async function overpass(query, signal) {
  let last = null;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal });
      if (!res.ok) throw new Error(res.status === 429 ? 'too many requests' : res.status === 504 ? 'timed out' : `answered ${res.status}`);
      const data = await res.json();
      // A query that runs out of time still answers 200, with a "remark" and no results.
      if (/runtime error|timed out|out of memory/i.test(data.remark ?? '')) throw new Error(data.remark.replace(/^runtime error:\s*/i, ''));
      return data.elements ?? [];
    } catch (err) {
      if (signal?.aborted) throw err;
      last = err;
    }
  }
  throw new Error(`OpenStreetMap servers are busy (${last?.message ?? 'no answer'}); try again in a minute`);
}

const bboxStr = ({ s, w, n, e }) => `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;

// The newest year a yearly dataset has data for. Recent years are asked at the
// same time (an empty or slow year can't hold the rest up, and one failing year
// isn't fatal); fetchYear(year) resolves to the year's rows ([] when empty).
export async function newestYear(fetchYear, years = 4) {
  const now = new Date().getFullYear();
  const list = Array.from({ length: years }, (_, i) => now - 1 - i);
  const results = await Promise.allSettled(list.map((y) => fetchYear(y)));
  for (let i = 0; i < list.length; i++) {
    if (results[i].status === 'fulfilled' && results[i].value.length) return { year: list[i], rows: results[i].value };
  }
  const failed = results.find((r) => r.status === 'rejected');
  if (failed && results.every((r) => r.status === 'rejected' || !r.value.length)) throw failed.reason;
  return { year: null, rows: [] };
}

// Every page of an Education Data API (Urban Institute) result.
export async function allPages(url) {
  const rows = [];
  while (url) {
    const page = await getJson(url);
    rows.push(...(page.results ?? []));
    url = page.next ? page.next.replace(/^http:/, 'https:') : null;
  }
  return rows;
}


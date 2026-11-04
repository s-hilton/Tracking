// Live data sources. Everything is fetched from the browser, straight from the
// public services listed on the Coverage tab; nothing is copied into this repo.
//
// Layer ids and field names are looked up from each service when first used
// (instead of hard-coded), so a service renumbering its layers or changing the
// case of a field name doesn't break the app.
import { load, save } from '../../storage.js';
import { fromEsriRings, centerOf, ringAcres, boundsOf, pointInRings, distanceToLine } from './geo.js';

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
// OpenStreetMap's query servers. The main one is often busy, so each request
// falls through to the next mirror on a timeout, rate limit or server error.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const ARCGIS_SEARCH = 'https://www.arcgis.com/sharing/rest/search';

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

// Which county a point is in (for loading parcels wherever you zoom in).
const countyAtCache = new Map();
export async function countyAt({ lat, lng }, signal) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (countyAtCache.has(key)) return countyAtCache.get(key);
  const layer = await findLayer(STATE_COUNTY, /^counties$/i);
  const d = await queryLayer(layer, {
    geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
    outFields: '*', returnGeometry: true, maxAllowableOffset: 0.005,
  }, signal);
  const f = d.features?.[0];
  const result = f ? {
    stateFips: String(attr(f.attributes, 'STATE')).padStart(2, '0'),
    fips: String(attr(f.attributes, 'COUNTY')).padStart(3, '0'),
    name: attr(f.attributes, 'NAME', 'BASENAME'),
    rings: fromEsriRings(f.geometry?.rings),
  } : null;
  countyAtCache.set(key, result);
  return result;
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

// The city / town a point is in, if any (incorporated place first, then a
// county subdivision that is a functioning government).
export async function municipalityAt({ lat, lng }, signal) {
  const point = { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: false };
  for (const [test, kind] of [[/incorporated places/i, 'place'], [/county subdivisions/i, 'cousub']]) {
    const layer = await findLayer(PLACES, test);
    const d = await queryLayer(layer, point, signal);
    const a = d.features?.[0]?.attributes;
    const status = attr(a, 'FUNCSTAT');
    if (a && (!status || GOVERNMENT.has(status))) {
      return { kind, geoid: String(attr(a, 'GEOID')), name: attr(a, 'NAME', 'BASENAME'), stateFips: String(attr(a, 'STATE')).padStart(2, '0') };
    }
  }
  return null;
}

export async function municipalityShape(m, signal) {
  const d = await queryLayer(m.layer, { where: `GEOID='${m.geoid}'`, outFields: 'NAME', returnGeometry: true, maxAllowableOffset: 0.0005 }, signal);
  return fromEsriRings(d.features?.[0]?.geometry?.rings);
}

// ---- PAD-US: public land by owner -----------------------------------------
//
// USGS publishes PAD-US through ArcGIS Online. The service is found by search the
// first time and remembered for 30 days; the layer chosen is the one whose fields
// include an owner type and acreage (the "Fee" / ownership layer).
const PADUS_KEY = 'land:padus';
const PADUS_MAX_AGE = 30 * 864e5;

async function layerInfo(url, signal) { return getJson(url, { f: 'json' }, signal); }

function fieldMap(info) {
  const names = (info.fields ?? []).map((f) => f.name);
  const find = (...want) => names.find((n) => want.some((w) => n.toLowerCase() === w.toLowerCase()));
  return {
    ownType: find('Own_Type'), ownName: find('d_Own_Name', 'Own_Name'), locOwn: find('Loc_Own'),
    manager: find('Loc_Mang', 'd_Mang_Name', 'Mang_Name'), name: find('Unit_Nm'), acres: find('GIS_Acres'),
    designation: find('d_Des_Tp', 'Des_Tp'), access: find('d_Pub_Access', 'Pub_Access'), state: find('State_Nm', 'd_State_Nm'),
  };
}

let padusPromise = null;
export function padusLayer(signal) {
  const cached = load(PADUS_KEY, null);
  if (cached && Date.now() - cached.at < PADUS_MAX_AGE) return Promise.resolve(cached);
  padusPromise ??= (async () => {
    const q = '(title:"PAD-US" OR title:"Protected Areas Database" OR title:"USA Protected Areas") AND type:"Feature Service"';
    const found = await getJson(ARCGIS_SEARCH, { f: 'json', q, num: 30, sortField: 'numviews', sortOrder: 'desc' }, signal);
    const candidates = [];
    for (const item of found.results ?? []) {
      if (!item.url) continue;
      try {
        const svc = await layerInfo(item.url, signal);
        for (const l of svc.layers ?? []) {
          const info = await layerInfo(`${item.url}/${l.id}`, signal);
          const fields = fieldMap(info);
          if (fields.ownType && fields.acres && info.geometryType === 'esriGeometryPolygon') {
            // Prefer the ownership ("Fee") layer over designations and easements.
            const score = (/fee/i.test(`${l.name} ${item.title}`) ? 2 : 0) + (/easement|designation|proclamation/i.test(`${l.name} ${item.title}`) ? -3 : 0) + (fields.locOwn ? 1 : 0);
            candidates.push({ url: `${item.url}/${l.id}`, title: `${item.title} — ${l.name}`, fields, score, max: info.maxRecordCount ?? 1000 });
          }
        }
      } catch { /* skip services we can't read */ }
      if (candidates.some((c) => c.score >= 3)) break;
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) throw new Error('Couldn’t find the PAD-US service on ArcGIS Online');
    const chosen = { ...candidates[0], at: Date.now() };
    save(PADUS_KEY, chosen);
    return chosen;
  })().finally(() => { padusPromise = null; });
  return padusPromise;
}

const OWNER_TYPE = { LOC: 'Local government', DIST: 'Special district' };
// PAD-US owner-name codes, for services that only carry the code.
const OWNER_NAME = { CITY: 'City', CNTY: 'County', REG: 'Regional agency / special district', JNT: 'Joint ownership', OTHL: 'Other local government' };

export async function publicLand(box, { minAcres = 0, maxAcres = 0, zoom = 10 } = {}, signal) {
  const svc = await padusLayer(signal);
  const f = svc.fields;
  const where = [`${f.ownType} IN ('LOC','DIST')`];
  if (minAcres > 0) where.push(`${f.acres} >= ${Number(minAcres)}`);
  if (maxAcres > 0) where.push(`${f.acres} <= ${Number(maxAcres)}`);
  const d = await queryLayer(svc.url, {
    where: where.join(' AND '),
    outFields: Object.values(f).filter(Boolean).join(','),
    returnGeometry: true,
    maxAllowableOffset: 360 / (256 * 2 ** zoom),
    resultRecordCount: Math.min(svc.max, 800),
    ...envelope(box),
  }, signal);
  const features = (d.features ?? []).map(({ attributes: a, geometry }) => {
    const rings = fromEsriRings(geometry?.rings);
    const ownType = a[f.ownType];
    return {
      id: `padus:${a.OBJECTID ?? a.objectid ?? a.FID ?? JSON.stringify(centerOf(rings))}`,
      source: 'PAD-US',
      category: 'land',
      kind: a[f.designation] || 'Public land',
      name: a[f.name] || 'Unnamed public land',
      owner: a[f.locOwn] || OWNER_NAME[a[f.ownName]] || a[f.ownName] || OWNER_TYPE[ownType] || ownType,
      ownerType: OWNER_TYPE[ownType] ?? ownType,
      manager: a[f.manager],
      access: a[f.access],
      acres: Number(a[f.acres]) || null,
      rings,
      center: centerOf(rings),
    };
  });
  return { features, more: Boolean(d.exceededTransferLimit), sourceTitle: svc.title };
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

export const BUILDING_KINDS = {
  library: { label: 'Libraries', one: 'Library', tag: '"amenity"="library"', color: '#8b5cf6' },
  townhall: { label: 'Town halls', one: 'Town hall', tag: '"amenity"="townhall"', color: '#0ea5e9' },
  community_centre: { label: 'Community centres', one: 'Community centre', tag: '"amenity"="community_centre"', color: '#f59e0b' },
  fire_station: { label: 'Fire stations', one: 'Fire station', tag: '"amenity"="fire_station"', color: '#ef4444' },
};

function osmAddress(t) {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return [street, t['addr:city'], t['addr:state'], t['addr:postcode']].filter(Boolean).join(', ');
}

export async function publicBuildings(box, kinds, signal) {
  const wanted = kinds.filter((k) => BUILDING_KINDS[k]);
  if (!wanted.length) return [];
  const b = bboxStr(box);
  const parts = wanted.map((k) => `nw[${BUILDING_KINDS[k].tag}](${b});`).join('');
  const els = await overpass(`[out:json][timeout:25];(${parts});out tags geom 600;`, signal);
  return els.map((el) => {
    const t = el.tags ?? {};
    const kind = wanted.find((k) => t.amenity === k) ?? wanted[0];
    const ring = el.geometry?.map((p) => [p.lat, p.lon]) ?? null;
    const closed = ring && ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
    const rings = closed ? [ring] : [];
    const center = el.lat != null ? { lat: el.lat, lng: el.lon } : centerOf(ring ? [ring] : []);
    return {
      id: `osm:${el.type}/${el.id}`,
      source: 'OpenStreetMap',
      osm: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      category: 'building',
      buildingKind: kind,
      kind: BUILDING_KINDS[kind].one,
      name: t.name || BUILDING_KINDS[kind].one,
      owner: t.owner || t.operator || null,
      ownerType: t['operator:type'] || t['ownership'] || null,
      address: osmAddress(t),
      website: t.website || t['contact:website'] || null,
      phone: t.phone || t['contact:phone'] || null,
      acres: closed ? ringAcres(ring) : null,
      rings,
      center,
    };
  }).filter((f) => f.center);
}

export async function powerGrid(box, signal) {
  const b = bboxStr(box);
  const els = await overpass(`[out:json][timeout:25];(way["power"="line"](${b});nw["power"="substation"](${b}););out tags geom 1500;`, signal);
  return toPower(els);
}

function toPower(els) {
  const lines = []; const substations = [];
  for (const el of els) {
    const t = el.tags ?? {};
    const pts = el.geometry?.map((p) => [p.lat, p.lon]) ?? (el.lat != null ? [[el.lat, el.lon]] : []);
    if (!pts.length) continue;
    if (t.power === 'line') lines.push({ pts, voltage: t.voltage, operator: t.operator });
    else substations.push({ pts, name: t.name, operator: t.operator, voltage: t.voltage });
  }
  return { lines, substations };
}

// Nearest power line and substation within ~15 miles of a point.
export async function nearestPower({ lat, lng }, signal) {
  const els = await overpass(`[out:json][timeout:25];(way["power"="line"](around:25000,${lat},${lng});nw["power"="substation"](around:25000,${lat},${lng}););out tags geom;`, signal);
  const { lines, substations } = toPower(els);
  const nearest = (list) => list.reduce((best, x) => {
    const d = distanceToLine(lat, lng, x.pts);
    return d < best.d ? { d, x } : best;
  }, { d: Infinity, x: null });
  return { line: nearest(lines), substation: nearest(substations) };
}

export const formatVoltage = (v) => {
  const n = Number(String(v ?? '').split(';')[0]);
  return n ? `${n >= 1000 ? Math.round(n / 1000) : n} ${n >= 1000 ? 'kV' : 'V'}` : '';
};

// FCC National Broadband Map, opened at a spot.
export const fccBroadbandUrl = ({ lat, lng }) => `https://broadbandmap.fcc.gov/location-summary/fixed?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&zoom=14`;

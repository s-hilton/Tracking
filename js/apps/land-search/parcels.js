// Stage 2: parcels (every lot, empty ones included) owned by local governments,
// for the Southwest and Northeast focus states.
//
// Free parcel data is published separately by each state or county, mostly as
// ArcGIS services. For the county you're looking at, Land Search:
//   1. uses a service pinned in config.js (PARCEL_SERVICES) if there is one, or
//   2. searches ArcGIS Online for that county's / state's parcel service and checks
//      each candidate: polygon layer, an owner-name field, and coverage of the county.
// The service it picks is remembered on this device (the Coverage tab lists them),
// and you can switch to another candidate from the map.
import { load, save } from '../../storage.js';
import { attr, getJson, queryLayer, envelope } from './sources.js';
import { fromEsriRings, centerOf, ringAcres } from './geo.js';
import { PARCEL_SERVICES, FOCUS_REGIONS } from './config.js';

const ARCGIS_SEARCH = 'https://www.arcgis.com/sharing/rest/search';
const FOUND_KEY = 'land:parcel-services'; // { 'AZ-005': { url, title, fields, … } | { none: true, at } }
const RETRY_NONE_AFTER = 7 * 864e5;

const FIELD_NAMES = {
  owner: ['OWNER', 'OWNER_NAME', 'OWNERNAME', 'OWNER1', 'OWNER_1', 'OWNER_NAME1', 'OWN1', 'OWNERNME1', 'OWN_NAME', 'OWNNAME', 'OWNER1_NAME', 'PRIMARY_OWNER', 'OWNERS', 'OWNER_FULL', 'OWNER_NAM', 'DEEDHOLDER', 'TAXPAYER', 'OWN_NAME1', 'OWNER_NME', 'OWNERNM', 'NAME_OWNER', 'OWNER_NAME_1', 'OWNERNAME1'],
  acres: ['ACRES', 'GIS_ACRES', 'CALC_ACRES', 'ACREAGE', 'DEED_ACRES', 'LAND_ACRES', 'ACRES_GIS', 'TOTAL_ACRES', 'LOT_ACRES', 'CALCACRES', 'ASSD_ACRES', 'GISACRES', 'ACRES_CALC', 'LANDACRES', 'LEGAL_ACRES'],
  id: ['PARCEL_ID', 'PARCELID', 'APN', 'PIN', 'PARCEL', 'PARCELNO', 'PARCEL_NUM', 'PARCEL_NO', 'PRCL_ID', 'MAP_PAR_ID', 'LOC_ID', 'SBL', 'PRINT_KEY', 'PRINTKEY', 'PROP_ID', 'GIS_PIN', 'SPAN', 'PAMS_PIN', 'PARCEL_NUMBER', 'ACCOUNT'],
  address: ['SITUS', 'SITE_ADDR', 'SITEADDRESS', 'SITE_ADDRESS', 'SITUS_ADDR', 'SITUSADDR', 'SITUS_ADDRESS', 'PROP_ADDR', 'PROP_ADDRESS', 'PROPERTY_ADDRESS', 'PROP_LOC', 'PHYSADDR', 'LOC_ADDR', 'FULL_ADDR', 'ADDRESS', 'LOCATION'],
  use: ['LAND_USE_DESC', 'USE_DESC', 'USEDESC', 'LANDUSE_DESC', 'LAND_USE', 'LANDUSE', 'PROP_CLASS_DESC', 'PROP_CLASS', 'PROPCLASS', 'PROPERTY_CLASS', 'CLASS_DESC', 'USE_CODE', 'USECODE', 'LUC', 'CLASS'],
};

function findFields(fields) {
  const names = fields.map((f) => f.name);
  const pick = (want) => {
    for (const w of want) { const hit = names.find((n) => n.toUpperCase() === w); if (hit) return hit; }
    return undefined;
  };
  const out = Object.fromEntries(Object.entries(FIELD_NAMES).map(([k, v]) => [k, pick(v)]));
  // Fallback: any string field whose name contains OWN (but not mailing address bits).
  out.owner ??= fields.find((f) => /own/i.test(f.name) && !/addr|city|state|zip|type|ship|occ/i.test(f.name) && /String/.test(f.type))?.name;
  return out;
}

// ---- Who counts as a local government ---------------------------------------

// Broad patterns sent to the server; the stricter check below weeds out the rest.
const SERVER_PATTERNS = ['CITY OF', ' CITY', 'COUNTY', 'TOWN OF', ' TOWN', 'TOWNSHIP', ' TWP', 'VILLAGE OF', 'BOROUGH', 'BORO OF',
  'MUNICIPAL', 'SCHOOL DIST', 'BOARD OF ED', 'PUBLIC SCHOOL', 'HOUSING AUTH', 'PARK DIST', 'PARKS', 'LIBRARY', 'FIRE DIST',
  'WATER DIST', 'SANITATION', 'REDEVELOPMENT', 'COMMISSIONERS', 'SELECTMEN', 'INHABITANTS', 'CONSERVATION COMM', 'AUTHORITY'];
const PRIVATE = /\b(L\.?L\.?C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|TRUST|TRUSTEES?|TR|CHURCH|BANK|HOMEOWNERS|HOA|ASSOC(IATION)?|PARTNERS(HIP)?|CONDO(MINIUM)?|ESTATE|FAMILY|PROPERTIES|HOLDINGS|INVESTMENTS?|VENTURES?|MINISTR(Y|IES))\b/;
const KINDS = [
  [/\bSCHOOL|BOARD OF ED|\bUSD\b|\bISD\b/, 'School district'],
  [/HOUSING AUTH/, 'Housing authority'],
  [/PARK DIST|RECREATION DIST|PARKS? (AND|&) REC/, 'Park district'],
  [/FIRE DIST|WATER DIST|SANITA|IRRIGATION|DRAINAGE|FLOOD CONTROL|UTILITY DIST|SEWER|AUTHORITY|DISTRICT/, 'Special district'],
  [/COUNTY/, 'County'],
  [/TOWNSHIP|\bTWP\b/, 'Township'],
  [/BOROUGH|\bBORO\b/, 'Borough'],
  [/VILLAGE/, 'Village'],
  [/\bTOWN\b|SELECTMEN|INHABITANTS/, 'Town'],
  [/\bCITY\b|MUNICIPAL/, 'City'],
];
const STATE_OR_FED = /\b(STATE OF|UNITED STATES|USA\b|U S A|BUREAU OF|DEPT OF THE INTERIOR|COMMONWEALTH OF|STATE LAND|STATE HIGHWAY|DEPT OF TRANSPORTATION)\b/;

export function localGovernmentKind(owner) {
  const o = String(owner ?? '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!o || PRIVATE.test(o) || STATE_OR_FED.test(o)) return null;
  const hit = KINDS.find(([re]) => re.test(o));
  if (!hit) return null;
  // "COUNTY" alone also matches things like "COUNTY ROAD FARMS"; require it to read as an owner.
  if (hit[1] === 'County' && !/(COUNTY OF|\bCOUNTY$|\bCOUNTY (BOARD|COMM|PARKS?|GOVT|GOVERNMENT|SUPERVISORS)|\w+ COUNTY\b)/.test(o)) return null;
  return hit[1];
}

// ---- Finding the service for a county ------------------------------------------

const FOCUS = new Set(Object.values(FOCUS_REGIONS).flat());
export const parcelsCovered = (abbr) => FOCUS.has(abbr) || Boolean(PARCEL_SERVICES[abbr]);

const foundAll = () => load(FOUND_KEY, {});
export const foundServices = () => Object.entries(foundAll()).filter(([, v]) => v && !v.none).map(([key, v]) => ({ key, ...v }));

function pinned(abbr, countyFips) {
  const svc = PARCEL_SERVICES[abbr];
  const p = svc?.counties?.[countyFips] ?? (svc?.statewide ? svc : null);
  return p?.url ? { ...p, pinned: true } : null;
}

// Web Mercator → lat/lng for checking a layer's extent.
function extentToLatLng(ext) {
  if (!ext) return null;
  const wkid = ext.spatialReference?.latestWkid ?? ext.spatialReference?.wkid;
  if (wkid === 4326 || wkid === 4269) return { s: ext.ymin, w: ext.xmin, n: ext.ymax, e: ext.xmax };
  if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
    const lng = (x) => (x / 6378137) * (180 / Math.PI);
    const lat = (y) => (Math.atan(Math.exp(y / 6378137)) * 2 - Math.PI / 2) * (180 / Math.PI);
    return { s: lat(ext.ymin), w: lng(ext.xmin), n: lat(ext.ymax), e: lng(ext.xmax) };
  }
  return null; // other projections (State Plane): can't check cheaply, so no bonus
}
const overlaps = (a, b) => a && b && a.s < b.n && a.n > b.s && a.w < b.e && a.e > b.w;

async function inspectService(item, county, signal) {
  const svc = await getJson(item.url, { f: 'json' }, signal);
  const layers = svc.layers ?? (svc.geometryType ? [{ id: null, name: svc.name ?? item.title }] : []);
  const ranked = layers.filter((l) => !/label|anno|line|point|lot line|dimension/i.test(l.name))
    .sort((a, b) => Number(/parcel/i.test(b.name)) - Number(/parcel/i.test(a.name))).slice(0, 3);
  const out = [];
  for (const l of ranked) {
    const url = l.id == null ? item.url : `${item.url}/${l.id}`;
    const info = await getJson(url, { f: 'json' }, signal);
    if (info.geometryType !== 'esriGeometryPolygon' || !/query/i.test(info.capabilities ?? 'Query')) continue;
    const fields = findFields(info.fields ?? []);
    if (!fields.owner) continue;
    const ext = extentToLatLng(info.extent);
    if (ext && !overlaps(ext, county.box)) continue;
    const text = `${item.title} ${l.name}`;
    const score = 3
      + (new RegExp(`\\b${county.name}\\b`, 'i').test(text) ? 3 : 0)
      + (new RegExp(`\\b${county.stateName}\\b|\\bstatewide\\b`, 'i').test(text) ? 1 : 0)
      + (/parcel/i.test(text) ? 2 : 0)
      + (ext ? 2 : 0)
      + (fields.acres ? 1 : 0) + (fields.address ? 1 : 0) + (fields.id ? 1 : 0)
      - (/sold|sales|historic|20[01]\d|zoning|easement|subdivision|plat/i.test(text) ? 4 : 0);
    out.push({
      url, title: `${item.title}${l.name && l.name !== item.title ? ` — ${l.name}` : ''}`, owner: item.owner,
      fields, score, max: info.maxRecordCount ?? 1000,
      paging: Boolean(info.advancedQueryCapabilities?.supportsPagination),
    });
  }
  return out;
}

const searching = new Map();
// county: { abbr, fips, name, stateName, box }
// → { status: 'pinned' | 'found' | 'none' | 'not-covered', service?, candidates? }
export function parcelService(county, signal) {
  if (!parcelsCovered(county.abbr)) return Promise.resolve({ status: 'not-covered' });
  const p = pinned(county.abbr, county.fips);
  if (p) return Promise.resolve({ status: 'pinned', service: p });
  const key = `${county.abbr}-${county.fips}`;
  const known = foundAll()[key];
  if (known && !known.none) return Promise.resolve({ status: 'found', service: known, candidates: known.candidates });
  if (known?.none && Date.now() - known.at < RETRY_NONE_AFTER) return Promise.resolve({ status: 'none' });
  if (!searching.has(key)) {
    searching.set(key, (async () => {
      const name = county.name.replace(/ (County|Parish|Borough|Census Area|Municipality)$/i, '');
      const queries = [
        `(parcel OR parcels OR "tax parcels") AND "${name}" AND (type:"Feature Service" OR type:"Map Service")`,
        `(parcel OR parcels OR "tax parcels") AND "${county.stateName}" AND (type:"Feature Service" OR type:"Map Service")`,
      ];
      const items = new Map();
      for (const q of queries) {
        const r = await getJson(ARCGIS_SEARCH, { f: 'json', q, num: 15, sortField: 'numviews', sortOrder: 'desc' }, signal);
        for (const it of r.results ?? []) if (it.url && !items.has(it.url)) items.set(it.url, it);
      }
      const candidates = [];
      for (const item of [...items.values()].slice(0, 14)) {
        try { candidates.push(...await inspectService(item, { ...county, name }, signal)); } catch { /* unreachable service: skip */ }
        if (candidates.some((c) => c.score >= 12)) break;
      }
      candidates.sort((a, b) => b.score - a.score);
      const all = foundAll();
      if (!candidates.length) {
        all[key] = { none: true, at: Date.now() }; save(FOUND_KEY, all);
        return { status: 'none' };
      }
      const service = { ...candidates[0], county: `${county.name}, ${county.abbr}`, at: Date.now(), candidates: candidates.slice(0, 6).map(({ url, title, score }) => ({ url, title, score })) };
      all[key] = service; save(FOUND_KEY, all);
      return { status: 'found', service, candidates: service.candidates };
    })().finally(() => searching.delete(key)));
  }
  return searching.get(key);
}

// Switch a county to another candidate (or forget it so it searches again).
export async function chooseParcelService(county, url, signal) {
  const key = `${county.abbr}-${county.fips}`;
  const all = foundAll();
  const prev = all[key];
  if (!url) { delete all[key]; save(FOUND_KEY, all); return; }
  const info = await getJson(url, { f: 'json' }, signal);
  const fields = findFields(info.fields ?? []);
  if (!fields.owner) throw new Error('That layer has no owner-name field');
  all[key] = { ...prev, url, title: prev?.candidates?.find((c) => c.url === url)?.title ?? info.name, fields, max: info.maxRecordCount ?? 1000, paging: Boolean(info.advancedQueryCapabilities?.supportsPagination), at: Date.now(), chosen: true };
  save(FOUND_KEY, all);
}

// ---- Loading parcels in view ---------------------------------------------------

export async function governmentParcels(service, box, { zoom = 15 } = {}, signal) {
  const f = service.fields;
  const like = (upper) => SERVER_PATTERNS.map((p) => `${upper ? `UPPER(${f.owner})` : f.owner} LIKE '%${p.replace(/'/g, "''")}%'`).join(' OR ');
  const params = {
    outFields: '*', returnGeometry: true, maxAllowableOffset: 360 / (256 * 2 ** zoom) / 2, ...envelope(box),
    ...(service.paging ? { resultRecordCount: Math.min(service.max, 1000) } : {}),
  };
  let d;
  try { d = await queryLayer(service.url, { ...params, where: like(true) }, signal); } catch (err) {
    if (signal?.aborted) throw err;
    d = await queryLayer(service.url, { ...params, where: like(false) }, signal); // servers without UPPER()
  }
  const features = [];
  for (const { attributes: a, geometry } of d.features ?? []) {
    const owner = a[f.owner];
    const kind = localGovernmentKind(owner);
    if (!kind) continue;
    const rings = fromEsriRings(geometry?.rings);
    if (!rings.length) continue;
    const acres = Number(f.acres && a[f.acres]) || rings.reduce((s, r) => s + ringAcres(r), 0);
    const id = f.id ? a[f.id] : null;
    features.push({
      id: `parcel:${service.url}:${id ?? attr(a, 'OBJECTID', 'FID') ?? JSON.stringify(centerOf(rings))}`,
      source: service.title,
      sourceUrl: service.url,
      category: 'parcel',
      kind: `Parcel${f.use && a[f.use] ? ` · ${a[f.use]}` : ''}`,
      name: (f.address && a[f.address]) || (id ? `Parcel ${id}` : 'Parcel'),
      owner: String(owner).trim(),
      ownerType: kind,
      parcelId: id,
      address: f.address ? a[f.address] : null,
      landUse: f.use ? a[f.use] : null,
      acres,
      rings,
      center: centerOf(rings),
    });
  }
  return { features, more: Boolean(d.exceededTransferLimit) };
}



// Stage 3 data: institutions that may host a ground station. All live and free:
//   colleges  US Dept. of Education IPEDS directory, via the Urban Institute's
//             Education Data API (falls back to OpenStreetMap if it's unreachable)
//   tribes    reservations and trust lands from Census TIGERweb (AIANNH)
//   museums   museums and planetariums from OpenStreetMap
import { attr, getJson, queryLayer, envelope } from './sources.js';
import { fromEsriRings, centerOf } from './geo.js';

const URBAN = 'https://educationdata.urban.org/api/v1/college-university/ipeds/directory';
const TIGER_AIANNH = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

export const INST_TYPES = {
  college: { label: 'Universities & colleges', one: 'College', color: '#2563eb' },
  tribe: { label: 'Tribal nations', one: 'Tribal nation', color: '#b45309' },
  museum: { label: 'Museums', one: 'Museum', color: '#7c3aed' },
};

const CONTROL = { 1: 'Public', 2: 'Private nonprofit', 3: 'Private for-profit' };
const LEVEL = { 4: '4-year', 2: '2-year', 1: 'Under 2-year' };
const SIZE = { 1: 'Under 1,000 students', 2: '1,000–4,999 students', 3: '5,000–9,999 students', 4: '10,000–19,999 students', 5: '20,000+ students' };
const yes = (v) => v === 1 || v === '1' || v === true;
const known = (v) => v != null && v !== '' && !(typeof v === 'number' && v < 0);

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn().catch((err) => { cache.delete(key); throw err; }));
  return cache.get(key);
};

// ---- Colleges ---------------------------------------------------------------

async function urbanColleges(stateFips, signal) {
  // Newest year first; the directory lags a year or two behind.
  const thisYear = new Date().getFullYear();
  for (let year = thisYear - 1; year >= thisYear - 5; year--) {
    let url = `${URBAN}/${year}/?fips=${Number(stateFips)}`;
    const rows = [];
    while (url) {
      const page = await getJson(url, {}, signal);
      rows.push(...(page.results ?? []));
      url = page.next ? page.next.replace(/^http:/, 'https:') : null;
    }
    if (rows.length) return { year, rows };
  }
  return { year: null, rows: [] };
}

function fromUrban(r, year) {
  const lat = Number(r.latitude); const lng = Number(r.longitude);
  const website = known(r.url_school) ? (/^https?:/i.test(r.url_school) ? r.url_school : `https://${r.url_school}`) : null;
  const tags = [];
  if (yes(r.hbcu)) tags.push('HBCU');
  if (yes(r.tribal_college)) tags.push('Tribal college');
  if (yes(r.land_grant)) tags.push('Land-grant');
  return {
    id: `college:${r.unitid}`,
    type: 'college',
    unitid: String(r.unitid),
    name: r.inst_name,
    kind: [CONTROL[r.inst_control], LEVEL[r.institution_level]].filter(Boolean).join(' · ') || 'College',
    control: CONTROL[r.inst_control] ?? null,
    level: LEVEL[r.institution_level] ?? null,
    size: SIZE[r.inst_size] ?? null,
    tags,
    address: [r.address, r.city, r.state_abbr, r.zip].filter(known).join(', '),
    city: r.city,
    countyFips: known(r.county_fips) ? String(r.county_fips).padStart(5, '0').slice(2) : null,
    website,
    phone: known(r.phone_number) ? String(r.phone_number).replace(/^1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : null,
    head: known(r.chief_admin_name) ? { name: r.chief_admin_name, title: known(r.chief_admin_title) ? r.chief_admin_title : 'Chief administrator' } : null,
    center: Number.isFinite(lat) && lat ? { lat, lng } : null,
    source: `US Dept. of Education IPEDS ${year} (Urban Institute Education Data API)`,
  };
}

async function overpass(query, signal) {
  const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query }), signal });
  if (res.status === 429 || res.status === 504) throw new Error('OpenStreetMap is busy; try again in a moment');
  if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status}`);
  return (await res.json()).elements ?? [];
}

function fromOsm(el, type) {
  const t = el.tags ?? {};
  const center = el.lat != null ? { lat: el.lat, lng: el.lon } : el.center ? { lat: el.center.lat, lng: el.center.lon } : null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    id: `${type}:osm:${el.type}/${el.id}`,
    type,
    name: t.name || INST_TYPES[type].one,
    kind: type === 'museum' ? (t.amenity === 'planetarium' ? 'Planetarium' : t.museum ? `${t.museum[0].toUpperCase()}${t.museum.slice(1).replace(/_/g, ' ')} museum` : 'Museum') : (t.amenity === 'college' ? 'College' : 'University'),
    science: type === 'museum' && (t.amenity === 'planetarium' || /science|technology|space|aviation|aerospace|astronom|planetar|observatory/i.test(`${t.museum ?? ''} ${t.name ?? ''}`)),
    operator: t.operator ?? null,
    address: [street, t['addr:city'], t['addr:state'], t['addr:postcode']].filter(Boolean).join(', '),
    city: t['addr:city'] ?? null,
    website: t.website || t['contact:website'] || null,
    phone: t.phone || t['contact:phone'] || null,
    wikidata: t.wikidata ?? null,
    osm: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    center,
    source: 'OpenStreetMap',
  };
}

export function colleges(st, signal) {
  return cached(`college:${st.fips}`, async () => {
    try {
      const { year, rows } = await urbanColleges(st.fips, signal);
      if (rows.length) return { items: rows.map((r) => fromUrban(r, year)).filter((c) => c.center), source: 'ipeds' };
    } catch (err) {
      if (signal?.aborted) throw err;
    }
    const els = await overpass(`[out:json][timeout:60];area["ISO3166-2"="US-${st.abbr}"]->.a;(nwr["amenity"~"^(university|college)$"](area.a););out center tags;`, signal);
    return { items: els.map((el) => fromOsm(el, 'college')).filter((c) => c.center && c.name !== 'College'), source: 'osm' };
  });
}

export function museums(st, signal) {
  return cached(`museum:${st.fips}`, async () => {
    const els = await overpass(`[out:json][timeout:60];area["ISO3166-2"="US-${st.abbr}"]->.a;(nwr["tourism"="museum"](area.a);nwr["amenity"="planetarium"](area.a););out center tags;`, signal);
    return { items: els.map((el) => fromOsm(el, 'museum')).filter((m) => m.center && m.name !== 'Museum') };
  });
}

// ---- Tribal nations -------------------------------------------------------------

export function tribes(st, stateBox, signal) {
  return cached(`tribe:${st.fips}`, async () => {
    const svc = await getJson(TIGER_AIANNH, { f: 'json' }, signal);
    const layers = (svc.layers ?? []).filter((l) => /reservation|trust land|tribal statistical|tribal designated|alaska native village/i.test(l.name) && !/label/i.test(l.name));
    const items = new Map();
    for (const l of layers) {
      const d = await queryLayer(`${TIGER_AIANNH}/${l.id}`, { where: '1=1', outFields: '*', returnGeometry: true, maxAllowableOffset: 0.005, ...envelope(stateBox) }, signal);
      for (const { attributes: a, geometry } of d.features ?? []) {
        const geoid = String(attr(a, 'GEOID'));
        const rings = fromEsriRings(geometry?.rings);
        const lat = Number(attr(a, 'CENTLAT', 'INTPTLAT')); const lng = Number(attr(a, 'CENTLON', 'INTPTLON'));
        const sqm = Number(attr(a, 'AREALAND')) || 0;
        const prev = items.get(geoid);
        items.set(geoid, {
          id: `tribe:${geoid}`,
          type: 'tribe',
          geoid,
          name: attr(a, 'NAME', 'BASENAME'),
          kind: l.name.replace(/s$/, ''),
          acres: sqm ? sqm / 4046.86 + (prev?.acres ?? 0) : prev?.acres ?? null,
          rings: [...(prev?.rings ?? []), ...rings],
          center: Number.isFinite(lat) && lat ? { lat, lng } : centerOf(rings),
          source: 'US Census Bureau TIGERweb (American Indian areas)',
        });
      }
    }
    return { items: [...items.values()] };
  });
}

export const formatInstSource = (it) => it.source;

// Stage 3 data: institutions that may host a ground station. All live and free:
//   colleges  US Dept. of Education IPEDS directory, via the Urban Institute's
//             Education Data API (falls back to OpenStreetMap if it's unreachable)
//   tribes    reservations and trust lands from Census TIGERweb (AIANNH), for the Governments tab
//   museums   museums and planetariums from OpenStreetMap + Wikidata, per county / town
import { attr, getJson, queryLayer, envelope, overpass, newestYear, allPages } from './sources.js';
import { fromEsriRings, centerOf } from './geo.js';

const URBAN = 'https://educationdata.urban.org/api/v1/college-university/ipeds/directory';
const TIGER_AIANNH = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer';
const WIKIDATA = 'https://query.wikidata.org/sparql';

export const INST_TYPES = {
  college: { label: 'Universities & colleges', one: 'College', color: '#2563eb' },
  museum: { label: 'Museums', one: 'Museum', color: '#7c3aed' },
  planetarium: { label: 'Planetariums', one: 'Planetarium', color: '#db2777' },
};

const CONTROL = { 1: 'Public', 2: 'Private nonprofit', 3: 'Private for-profit' };
const LEVEL = { 4: '4-year', 2: '2-year', 1: 'Under 2-year' };
const SIZE = { 1: 'Under 1,000 students', 2: '1,000–4,999 students', 3: '5,000–9,999 students', 4: '10,000–19,999 students', 5: '20,000+ students' };
const yes = (v) => v === 1 || v === '1' || v === true;
const known = (v) => v != null && v !== '' && !(typeof v === 'number' && v < 0);

// State-wide lists are fetched once per session. The fetch isn't tied to the
// view that asked for it, so switching filters or tabs mid-load can't leave a
// cancelled request in the cache; failures are dropped so "Try again" refetches.
const cache = new Map();
const cached = (key, fn, signal) => {
  if (!cache.has(key)) cache.set(key, fn().catch((err) => { cache.delete(key); throw err; }));
  const p = cache.get(key);
  return signal ? Promise.race([p, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))]) : p;
};

// ---- Colleges ---------------------------------------------------------------

async function urbanColleges(stateFips) {
  // The directory lags a year or two behind; use the newest year with data.
  return newestYear((y) => allPages(`${URBAN}/${y}/?fips=${Number(stateFips)}`));
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


function fromOsm(el, type) {
  const t = el.tags ?? {};
  const center = el.lat != null ? { lat: el.lat, lng: el.lon } : el.center ? { lat: el.center.lat, lng: el.center.lon } : null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    id: `${type}:osm:${el.type}/${el.id}`,
    type,
    name: t.name || INST_TYPES[type].one,
    kind: type === 'museum' || type === 'planetarium' ? (t.amenity === 'planetarium' ? 'Planetarium' : t.museum ? `${t.museum[0].toUpperCase()}${t.museum.slice(1).replace(/_/g, ' ')} museum` : 'Museum') : (t.amenity === 'college' ? 'College' : 'University'),
    science: type === 'planetarium' || (type === 'museum' && t.amenity === 'planetarium' || /science|technology|space|aviation|aerospace|astronom|planetar|observatory/i.test(`${t.museum ?? ''} ${t.name ?? ''}`)),
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
      const { year, rows } = await urbanColleges(st.fips);
      if (rows.length) return { items: rows.map((r) => fromUrban(r, year)).filter((c) => c.center), source: 'ipeds' };
    } catch { /* fall back to OpenStreetMap */ }
    const els = await overpass(`[out:json][timeout:90];area["ISO3166-2"="US-${st.abbr}"]->.a;(nwr["amenity"~"^(university|college)$"](area.a););out center tags;`);
    return { items: els.map((el) => fromOsm(el, 'college')).filter((c) => c.center && c.name !== 'College'), source: 'osm' };
  }, signal);
}

// Museums for one county or town (a whole state is too big a question for the
// free servers). OpenStreetMap first (most complete), Wikidata alongside; both
// are merged so nothing is missed, and either one alone is enough.
export function museums(st, box, signal) {
  const b = `${box.s.toFixed(4)},${box.w.toFixed(4)},${box.n.toFixed(4)},${box.e.toFixed(4)}`;
  return cached(`museum:${b}`, async () => {
    const [osm, wd] = await Promise.allSettled([
      overpass(`[out:json][timeout:40];(nwr["tourism"="museum"](${b});nwr["amenity"="planetarium"](${b}););out center tags;`),
      wikidataMuseums(box),
    ]);
    if (osm.status === 'rejected' && wd.status === 'rejected') throw new Error(`${osm.reason.message}; Wikidata: ${wd.reason.message}`);
    const items = osm.status === 'fulfilled' ? osm.value.map((el) => fromOsm(el, el.tags?.amenity === 'planetarium' ? 'planetarium' : 'museum')).filter((m) => m.center && m.name !== 'Museum' && m.name !== 'Planetarium') : [];
    const seen = new Set(items.map((m) => m.wikidata).filter(Boolean));
    const names = new Set(items.map((m) => m.name.toLowerCase()));
    for (const m of wd.status === 'fulfilled' ? wd.value : []) {
      if (!seen.has(m.wikidata) && !names.has(m.name.toLowerCase())) items.push(m);
    }
    return { items, partial: osm.status === 'rejected' ? 'OpenStreetMap was busy, so museums come from Wikidata only (fewer small museums).' : null };
  }, signal);
}

// Anything Wikidata counts as a museum (or planetarium) inside the area's
// bounding box; the view then keeps only those inside the area itself.
async function wikidataMuseums(box) {
  if (!box) throw new Error('No state outline');
  const query = `SELECT ?m ?mLabel ?coord ?website ?typeLabel WHERE {
    SERVICE wikibase:box {
      ?m wdt:P625 ?coord .
      bd:serviceParam wikibase:cornerSouthWest "Point(${box.w} ${box.s})"^^geo:wktLiteral .
      bd:serviceParam wikibase:cornerNorthEast "Point(${box.e} ${box.n})"^^geo:wktLiteral .
    }
    ?m wdt:P31 ?type .
    { ?type wdt:P279* wd:Q33506 } UNION { VALUES ?type { wd:Q148319 } }
    FILTER NOT EXISTS { ?m wdt:P576 ?closed }
    OPTIONAL { ?m wdt:P856 ?website }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 3000`;
  const res = await fetch(`${WIKIDATA}?format=json&query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  const byId = new Map();
  for (const r of (await res.json()).results?.bindings ?? []) {
    const qid = r.m.value.split('/').pop();
    const [, lng, lat] = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? '') ?? [];
    if (byId.has(qid) || !lat || /^Q\d+$/.test(r.mLabel?.value ?? 'Q1')) continue;
    const type = r.typeLabel?.value ?? 'museum';
    byId.set(qid, {
      id: `museum:wd:${qid}`,
      type: /planetarium/i.test(type) ? 'planetarium' : 'museum',
      name: r.mLabel.value,
      kind: type[0].toUpperCase() + type.slice(1),
      science: /science|technology|planetarium|aviation|aerospace|space|observatory/i.test(`${type} ${r.mLabel.value}`),
      website: r.website?.value ?? null,
      wikidata: qid,
      center: { lat: Number(lat), lng: Number(lng) },
      source: 'Wikidata',
    });
  }
  return [...byId.values()];
}

// ---- Tribal nations -------------------------------------------------------------

export function tribes(st, stateBox, signal) {
  return cached(`tribe:${st.fips}`, async () => {
    const svc = await getJson(TIGER_AIANNH, { f: 'json' });
    const layers = (svc.layers ?? []).filter((l) => /reservation|trust land|tribal statistical|tribal designated|alaska native village/i.test(l.name) && !/label/i.test(l.name));
    const items = new Map();
    for (const l of layers) {
      const d = await queryLayer(`${TIGER_AIANNH}/${l.id}`, { where: '1=1', outFields: '*', returnGeometry: true, maxAllowableOffset: 0.005, ...envelope(stateBox) });
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
  }, signal);
}

export const formatInstSource = (it) => it.source;

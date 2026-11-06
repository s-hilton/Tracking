// School districts (they often own large lots): every district in a state.
//   list        Census TIGERweb school districts (unified, secondary, elementary)
//   details     NCES Common Core of Data district directory, via the Urban
//               Institute Education Data API: phone, office address, enrollment,
//               number of schools. Census GEOID = NCES district id, so they join.
// Either source alone is enough; both are used when both answer.
import { attr, getJson, queryLayer, newestYear, allPages } from './sources.js';

const SCHOOL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer';
const DIRECTORY = 'https://educationdata.urban.org/api/v1/school-districts/ccd/directory';
const KIND = { unified: 'Unified (K–12)', secondary: 'Secondary', elementary: 'Elementary' };
const GRADE = (g) => (g === 'KG' || g === '0' || g === 0 ? 'K' : g === 'PK' || g === -1 ? 'Pre-K' : String(g).replace(/^0/, ''));

const cache = new Map();

async function censusDistricts(stateFips) {
  const svc = await getJson(SCHOOL, { f: 'json' });
  const out = [];
  for (const [kind, test] of [['unified', /^unified school districts$/i], ['secondary', /^secondary school districts$/i], ['elementary', /^elementary school districts$/i]]) {
    const layer = (svc.layers ?? []).find((l) => test.test(l.name)); // first = current vintage
    if (!layer) continue;
    const d = await queryLayer(`${SCHOOL}/${layer.id}`, { where: `STATE='${stateFips}'`, outFields: 'NAME,GEOID,CENTLAT,CENTLON,LOGRADE,HIGRADE,AREALAND', returnGeometry: false });
    for (const { attributes: a } of d.features ?? []) {
      const geoid = String(attr(a, 'GEOID'));
      if (/^\d{2}99/.test(geoid)) continue; // "School District Not Defined" areas
      out.push({
        leaid: geoid, kind, name: attr(a, 'NAME'),
        lat: Number(attr(a, 'CENTLAT')), lng: Number(attr(a, 'CENTLON')),
        grades: attr(a, 'LOGRADE') && attr(a, 'HIGRADE') ? `${GRADE(attr(a, 'LOGRADE'))}–${GRADE(attr(a, 'HIGRADE'))}` : '',
        acres: Number(attr(a, 'AREALAND')) ? Number(attr(a, 'AREALAND')) / 4046.86 : null,
      });
    }
  }
  return out;
}

async function directory(stateFips) {
  const { year, rows } = await newestYear((y) => allPages(`${DIRECTORY}/${y}/?fips=${Number(stateFips)}`));
  // 1 = regular local district, 2 = part of a supervisory union.
  return { year, rows: rows.filter((r) => r.agency_type === 1 || r.agency_type === 2) };
}

const titleCase = (s) => String(s ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function schoolDistricts(stateFips) {
  if (!cache.has(stateFips)) {
    cache.set(stateFips, (async () => {
      const [census, dir] = await Promise.allSettled([censusDistricts(stateFips), directory(stateFips)]);
      if (census.status === 'rejected' && dir.status === 'rejected') throw census.reason;
      const byId = new Map();
      for (const c of census.status === 'fulfilled' ? census.value : []) byId.set(c.leaid, { ...c });
      const year = dir.status === 'fulfilled' ? dir.value.year : null;
      for (const r of dir.status === 'fulfilled' ? dir.value.rows : []) {
        const d = byId.get(String(r.leaid)) ?? { leaid: String(r.leaid), name: r.lea_name, kind: '', lat: r.latitude, lng: r.longitude, grades: '' };
        byId.set(d.leaid, Object.assign(d, {
          phone: r.phone && r.phone !== '-2' ? r.phone : '',
          address: [r.street_location, titleCase(r.city_location), r.state_location, r.zip_location].filter(Boolean).join(', '),
          city: titleCase(r.city_location),
          countyFips: r.county_code ? String(r.county_code).slice(2) : '',
          countyName: r.county_name ?? '',
          enrollment: r.enrollment > 0 ? r.enrollment : null,
          schools: r.number_of_schools > 0 ? r.number_of_schools : null,
          officeLat: r.latitude, officeLng: r.longitude,
        }));
      }
      const items = [...byId.values()].filter((d) => d.name).sort((a, b) => a.name.localeCompare(b.name));
      return {
        items,
        sources: [census.status === 'fulfilled' ? 'Census TIGERweb' : null, year ? `NCES directory ${year}` : null].filter(Boolean).join(' + '),
        partial: census.status === 'rejected' ? 'Census list unavailable, so only districts in the NCES directory are shown.' : dir.status === 'rejected' ? 'District directory unavailable, so phone, address and enrollment are missing.' : null,
      };
    })().catch((err) => { cache.delete(stateFips); throw err; }));
  }
  return cache.get(stateFips);
}

export const districtKind = (d) => KIND[d.kind] ?? 'School district';

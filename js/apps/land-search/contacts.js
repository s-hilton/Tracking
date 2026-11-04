// Contacts and leadership from Wikidata (free, live): official website, phone,
// and who currently heads a government or institution. Wikidata is volunteer-
// edited: big cities and universities are well covered, small towns often aren't,
// so every lookup also comes with search links as a fallback.
import { stateByFips } from './config.js';

const SPARQL = 'https://query.wikidata.org/sparql';
const cache = new Map();

async function sparql(query, signal) {
  if (cache.has(query)) return cache.get(query);
  const res = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, { signal, headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  const rows = (await res.json()).results?.bindings ?? [];
  cache.set(query, rows);
  return rows;
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// The details part shared by every lookup: ?item must already be bound.
const DETAILS = `
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P1329 ?phone }
  OPTIONAL { ?item wdt:P1313 ?office }
  OPTIONAL {
    ?item p:P6|p:P488|p:P1037 ?st .
    ?st ps:P6|ps:P488|ps:P1037 ?leader .
    FILTER NOT EXISTS { ?st pq:P582 ?ended }
    OPTIONAL { ?st pq:P580 ?since }
    OPTIONAL { ?st pq:P39 ?roleItem }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;
const SELECT = 'SELECT ?item ?itemLabel ?website ?phone ?officeLabel ?leader ?leaderLabel ?since WHERE {';

function shape(rows) {
  if (!rows.length) return null;
  const first = rows[0];
  const leaders = new Map();
  for (const r of rows) {
    if (r.leader && !leaders.has(r.leader.value)) {
      leaders.set(r.leader.value, { name: r.leaderLabel?.value, since: r.since?.value?.slice(0, 4), url: r.leader.value.replace('http://', 'https://') });
    }
  }
  return {
    wikidata: first.item.value.replace('http://', 'https://'),
    name: first.itemLabel?.value,
    website: rows.find((r) => r.website)?.website.value ?? null,
    phone: rows.find((r) => r.phone)?.phone.value ?? null,
    office: rows.find((r) => r.officeLabel)?.officeLabel.value ?? null,
    leaders: [...leaders.values()].filter((l) => l.name && !/^Q\d+$/.test(l.name)),
  };
}

// A county, by its 5-digit FIPS code (Wikidata P882).
export async function countyContacts(stateFips, countyFips, signal) {
  return shape(await sparql(`${SELECT} ?item wdt:P882 "${stateFips}${countyFips}" . ${DETAILS} } LIMIT 40`, signal));
}

// A city or town: first by its Census code (FIPS 55-3, Wikidata P774), then by
// name within the state.
export async function municipalityContacts({ geoid, name, stateFips }, signal) {
  const st = stateByFips(stateFips);
  if (geoid) {
    const byCode = shape(await sparql(`${SELECT} VALUES ?code { "${esc(geoid)}" "${esc(geoid.slice(2))}" } ?item wdt:P774 ?code . ${DETAILS} } LIMIT 40`, signal));
    if (byCode) return byCode;
  }
  const base = String(name).replace(/ (city|town|village|borough|township|CDP|municipality|plantation)$/i, '').trim();
  if (!st || !base) return null;
  return shape(await sparql(`${SELECT}
    ?item rdfs:label "${esc(base)}"@en ; wdt:P17 wd:Q30 ; wdt:P131+ ?state .
    ?state wdt:P300 "US-${st.abbr}" .
    ?item wdt:P31/wdt:P279* wd:Q486972 .
    ${DETAILS} } LIMIT 40`, signal));
}

// A college by its IPEDS id (Wikidata P1771), or anything with a Wikidata id.
export async function collegeContacts(unitid, signal) {
  return shape(await sparql(`${SELECT} ?item wdt:P1771 "${esc(unitid)}" . ${DETAILS} } LIMIT 40`, signal));
}
export async function itemContacts(qid, signal) {
  if (!/^Q\d+$/.test(qid ?? '')) return null;
  return shape(await sparql(`${SELECT} BIND(wd:${qid} AS ?item) ${DETAILS} } LIMIT 40`, signal));
}

export const searchUrl = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

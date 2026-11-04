// "Check connections" on the Coverage tab: tries every live data source from
// this browser, so a failure can be reported precisely.
import { getJson, OVERPASS } from './sources.js';

const timed = async (fn) => {
  const t = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const detail = await fn(ctl.signal);
    return { ok: true, ms: Math.round(performance.now() - t), detail };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - t), detail: ctl.signal.aborted ? 'no answer in 30 s' : (/failed to fetch|networkerror|load failed/i.test(err.message) ? `${err.message} (blocked, offline, or the server doesn’t allow browser apps)` : err.message) };
  } finally { clearTimeout(timer); }
};

async function overpassPing(url, signal) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: '[out:json][timeout:10];node["amenity"="library"](40.95,-73.9,40.96,-73.89);out 1;' }), signal });
  if (!res.ok) throw new Error(`answered ${res.status}`);
  const d = await res.json();
  if (d.remark) throw new Error(d.remark);
  return 'answering';
}

export const CHECKS = [
  { name: 'Census boundaries (TIGERweb)', run: (signal) => getJson('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer', { f: 'json' }, signal).then((d) => `${d.layers?.length ?? 0} layers`) },
  { name: 'Census cities, towns & tribal lands', run: (signal) => getJson('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer', { f: 'json' }, signal).then((d) => `${d.layers?.length ?? 0} layers`) },
  ...OVERPASS.map((url) => ({ name: `OpenStreetMap server ${new URL(url).host}`, run: (signal) => overpassPing(url, signal) })),
  { name: 'Wikidata', run: async (signal) => {
    const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent('SELECT ?x WHERE { BIND(1 AS ?x) }')}`, { signal, headers: { Accept: 'application/sparql-results+json' } });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    await res.json();
    return 'answering';
  } },
  { name: 'College directory (Urban Institute)', run: (signal) => getJson('https://educationdata.urban.org/api/v1/college-university/ipeds/directory/2022/', { fips: 11 }, signal).then((d) => `${d.count ?? d.results?.length ?? 0} DC colleges`) },
];

export async function runChecks(onResult) {
  await Promise.all(CHECKS.map(async (c, i) => onResult(i, await timed(c.run))));
}

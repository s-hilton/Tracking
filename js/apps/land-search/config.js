// Land Search settings: the states list, which regions you asked to be wired up
// first, and what is actually connected where. The Coverage tab and the map's
// "not connected" labels both read from COVERAGE, so keep it up to date when
// a new data source is plugged in.

export const STATES = [
  ['01', 'AL', 'Alabama'], ['02', 'AK', 'Alaska'], ['04', 'AZ', 'Arizona'], ['05', 'AR', 'Arkansas'],
  ['06', 'CA', 'California'], ['08', 'CO', 'Colorado'], ['09', 'CT', 'Connecticut'], ['10', 'DE', 'Delaware'],
  ['11', 'DC', 'District of Columbia'], ['12', 'FL', 'Florida'], ['13', 'GA', 'Georgia'], ['15', 'HI', 'Hawaii'],
  ['16', 'ID', 'Idaho'], ['17', 'IL', 'Illinois'], ['18', 'IN', 'Indiana'], ['19', 'IA', 'Iowa'],
  ['20', 'KS', 'Kansas'], ['21', 'KY', 'Kentucky'], ['22', 'LA', 'Louisiana'], ['23', 'ME', 'Maine'],
  ['24', 'MD', 'Maryland'], ['25', 'MA', 'Massachusetts'], ['26', 'MI', 'Michigan'], ['27', 'MN', 'Minnesota'],
  ['28', 'MS', 'Mississippi'], ['29', 'MO', 'Missouri'], ['30', 'MT', 'Montana'], ['31', 'NE', 'Nebraska'],
  ['32', 'NV', 'Nevada'], ['33', 'NH', 'New Hampshire'], ['34', 'NJ', 'New Jersey'], ['35', 'NM', 'New Mexico'],
  ['36', 'NY', 'New York'], ['37', 'NC', 'North Carolina'], ['38', 'ND', 'North Dakota'], ['39', 'OH', 'Ohio'],
  ['40', 'OK', 'Oklahoma'], ['41', 'OR', 'Oregon'], ['42', 'PA', 'Pennsylvania'], ['44', 'RI', 'Rhode Island'],
  ['45', 'SC', 'South Carolina'], ['46', 'SD', 'South Dakota'], ['47', 'TN', 'Tennessee'], ['48', 'TX', 'Texas'],
  ['49', 'UT', 'Utah'], ['50', 'VT', 'Vermont'], ['51', 'VA', 'Virginia'], ['53', 'WA', 'Washington'],
  ['54', 'WV', 'West Virginia'], ['55', 'WI', 'Wisconsin'], ['56', 'WY', 'Wyoming'],
].map(([fips, abbr, name]) => ({ fips, abbr, name }));

export const stateByFips = (fips) => STATES.find((s) => s.fips === fips);

// The regions you picked to be wired up first (4 Nov 2026).
export const FOCUS_REGIONS = {
  Southwest: ['AZ', 'NM', 'NV', 'UT', 'CO'],
  Northeast: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA'],
};
const FOCUS = new Set(Object.values(FOCUS_REGIONS).flat());
export const regionOf = (abbr) => Object.keys(FOCUS_REGIONS).find((r) => FOCUS_REGIONS[r].includes(abbr)) ?? null;

// County / statewide parcel services (every parcel with its owner). Free ones
// are added one area at a time. Keyed by state abbreviation; a state entry can
// cover the whole state or list the counties that are connected.
//   AZ: { statewide: false, counties: { '013': { name: 'Maricopa', url: '…', ownerField: 'OWNER_NAME' } } }
// Pinned services always win over automatic discovery (see parcels.js). Empty for
// now: in focus states each county's service is found automatically in the browser;
// once one is confirmed to work, pin it here.
export const PARCEL_SERVICES = {};

// What the map can tell you about a state's parcels.
export function parcelStatus(abbr, countyFips = '') {
  const svc = PARCEL_SERVICES[abbr];
  if (svc?.statewide || (countyFips && svc?.counties?.[countyFips])) return 'connected';
  if (FOCUS.has(abbr)) return 'auto';
  return 'not-connected';
}

// The note shown on the Coverage tab: what Claude filled in, and what's left.
export const COVERAGE = {
  updated: '4 Nov 2026',
  nationwide: [
    { name: 'State, county and city/town boundaries', source: 'US Census Bureau TIGERweb (live)', note: 'Drives the state → county → municipality filters. Northeast towns and townships come from county subdivisions.' },
    { name: 'Public land owned by local governments', source: 'USGS PAD-US, Protected Areas Database (live)', note: 'Parks, open space, preserves and other conservation land owned by cities, counties, towns and special districts (e.g. park districts). Includes acreage, owner name and public access.' },
    { name: 'Libraries, town halls, community centres, fire stations', source: 'OpenStreetMap via Overpass (live)', note: 'Mapped by volunteers; ownership is not confirmed, so check county records before reaching out.' },
    { name: 'Power lines and substations', source: 'OpenStreetMap via Overpass (live)', note: 'Shown on the map when zoomed in; the distance to the nearest line and substation is worked out when you open a site.' },
    { name: 'Broadband / fiber', source: 'FCC National Broadband Map (link)', note: 'The FCC has no free live feed for apps, so each site links to the FCC map at that spot.' },
  ],
  parcels: 'In these states, when you zoom in to street level Land Search works out which county you’re in, searches ArcGIS Online for that county’s (or the state’s) free parcel service, and keeps the best one that has an owner-name field and covers the county. It then shows every parcel whose owner reads like a local government: cities, counties, towns, townships, boroughs, villages, school districts, housing authorities and special districts (state, federal and private owners are left out). Claude couldn’t test individual county services from its own environment, so each county’s source is found and checked in your browser the first time you look; if one is wrong you can switch it from the map, and tell Claude so it can be pinned.',
  pending: [
    { name: 'Universities & colleges, tribal nations, museums', where: 'Nationwide', when: 'Stage 3' },
    { name: 'Government website, phone and current leadership', where: 'Nationwide (where free data has it)', when: 'Stage 3' },
    { name: 'Saved sites, outreach pipeline, follow-ups on the sticky note', where: '—', when: 'Stage 4' },
  ],
};

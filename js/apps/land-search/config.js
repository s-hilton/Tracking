// Land Search settings: the states list and the Coverage tab's note of what's
// connected. Keep COVERAGE up to date when a data source is added or changed.

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

// The note shown on the Coverage tab: what Claude connected, and how the app works.
export const COVERAGE = {
  updated: '5 Nov 2026',
  how: 'You go through governments yourself: pick a state, county, city/town/township or tribal nation, add the link to their map / GIS data, their website and contacts, note parcels of interest, and mark whether they’re of interest. Anything marked Interested goes into the Pipeline, where follow-ups land on the dashboard’s to-do sticky note. Institutions work the same way from their map.',
  nationwide: [
    { name: 'States, counties, cities, towns, townships, boroughs & villages', source: 'US Census Bureau TIGERweb (live)', note: 'The Governments tab’s drop-downs. Only functioning governments are listed (census-only areas are left out).' },
    { name: 'Tribal nations', source: 'US Census Bureau TIGERweb, American Indian areas (live)', note: 'Reservations, off-reservation trust lands and tribal statistical areas in each state. Leaders: BIA Tribal Leaders Directory link.' },
    { name: 'Universities & colleges', source: 'US Dept. of Education IPEDS directory, via the Urban Institute Education Data API (live; OpenStreetMap if unreachable)', note: 'Every degree-granting college: public/private, 2- or 4-year, size, website, phone, HBCU / tribal college / land-grant flags.' },
    { name: 'Museums & planetariums', source: 'OpenStreetMap (four servers, tried in turn) + Wikidata (live)', note: 'Loaded per county or city/town; a whole state is too much for the free servers.' },
    { name: 'Websites, phones and current leadership', source: 'Wikidata (live)', note: 'Governors, mayors, county executives and university presidents where volunteers have recorded them; offered as suggestions you can accept.' },
  ],
  records: 'Everything you record (interest, pipeline stage, map-data links, websites, contacts, parcels of interest, notes, activity) syncs to your account through Supabase (table land_sites).',
};

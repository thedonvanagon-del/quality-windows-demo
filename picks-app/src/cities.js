// The cities a local room can be for. Players pick from this list; nobody
// types a room name. Each city has one room at most, keyed by its slug.
// California from the Central Coast south comes first, north to south within
// each region; then the rest of California; then major cities by state.
// Add a city by adding a line. Never change a slug: rooms and home cities point at it.

const LIST = {
  CA: {
    'Central Coast': ['Santa Cruz', 'Watsonville', 'Salinas', 'Seaside', 'Monterey', 'King City', 'Paso Robles', 'Atascadero', 'Morro Bay', 'San Luis Obispo', 'Pismo Beach & Arroyo Grande', 'Santa Maria', 'Lompoc', 'Goleta', 'Santa Barbara', 'Carpinteria'],
    'Ventura County': ['Ventura', 'Simi Valley', 'Camarillo', 'Oxnard', 'Thousand Oaks'],
    'Los Angeles area': ['Lancaster & Palmdale', 'Santa Clarita', 'San Fernando Valley', 'Burbank', 'Pasadena', 'Glendale', 'Pomona', 'Los Angeles', 'Santa Monica', 'Inglewood', 'Downey', 'Torrance', 'Long Beach'],
    'Orange County': ['Anaheim', 'Santa Ana', 'Irvine', 'Huntington Beach', 'Costa Mesa', 'Newport Beach'],
    'Inland Empire and desert': ['Victorville', 'San Bernardino', 'Rancho Cucamonga', 'Fontana', 'Ontario', 'Riverside', 'Palm Springs', 'Indio & Coachella', 'Temecula'],
    'San Diego and Imperial': ['Oceanside', 'Carlsbad', 'Escondido', 'San Diego', 'Chula Vista', 'El Centro'],
    'Northern California': ['Redding', 'Chico', 'Sacramento'],
    'Bay Area': ['Santa Rosa', 'Berkeley', 'Oakland', 'San Francisco', 'Fremont', 'San Jose'],
    'Central Valley': ['Stockton', 'Modesto', 'Fresno', 'Visalia', 'Bakersfield'],
  },
  AL: { Alabama: ['Birmingham'] },
  AK: { Alaska: ['Anchorage'] },
  AZ: { Arizona: ['Phoenix', 'Tucson'] },
  AR: { Arkansas: ['Little Rock'] },
  CO: { Colorado: ['Denver', 'Colorado Springs'] },
  CT: { Connecticut: ['Hartford', 'New Haven'] },
  DC: { 'District of Columbia': ['Washington'] },
  FL: { Florida: ['Jacksonville', 'Orlando', 'Tampa', 'Miami'] },
  GA: { Georgia: ['Atlanta'] },
  HI: { Hawaii: ['Honolulu'] },
  ID: { Idaho: ['Boise'] },
  IL: { Illinois: ['Chicago'] },
  IN: { Indiana: ['Indianapolis'] },
  IA: { Iowa: ['Des Moines'] },
  KS: { Kansas: ['Wichita'] },
  KY: { Kentucky: ['Louisville', 'Lexington'] },
  LA: { Louisiana: ['Baton Rouge', 'New Orleans'] },
  MD: { Maryland: ['Baltimore'] },
  MA: { Massachusetts: ['Boston', 'Worcester'] },
  MI: { Michigan: ['Grand Rapids', 'Detroit'] },
  MN: { Minnesota: ['Minneapolis'] },
  MS: { Mississippi: ['Jackson'] },
  MO: { Missouri: ['Kansas City', 'St. Louis'] },
  NE: { Nebraska: ['Omaha'] },
  NV: { Nevada: ['Reno', 'Las Vegas'] },
  NM: { 'New Mexico': ['Albuquerque'] },
  NY: { 'New York': ['Buffalo', 'Rochester', 'Albany', 'New York'] },
  NC: { 'North Carolina': ['Greensboro', 'Raleigh', 'Charlotte'] },
  OH: { Ohio: ['Cleveland', 'Columbus', 'Cincinnati'] },
  OK: { Oklahoma: ['Tulsa', 'Oklahoma City'] },
  OR: { Oregon: ['Portland'] },
  PA: { Pennsylvania: ['Pittsburgh', 'Philadelphia'] },
  RI: { 'Rhode Island': ['Providence'] },
  SC: { 'South Carolina': ['Greenville', 'Columbia', 'Charleston'] },
  TN: { Tennessee: ['Nashville', 'Knoxville', 'Chattanooga', 'Memphis'] },
  TX: { Texas: ['Dallas', 'Fort Worth', 'El Paso', 'Austin', 'Houston', 'San Antonio', 'Corpus Christi', 'McAllen'] },
  UT: { Utah: ['Salt Lake City'] },
  VA: { Virginia: ['Richmond', 'Virginia Beach'] },
  WA: { Washington: ['Seattle', 'Spokane'] },
  WI: { Wisconsin: ['Green Bay', 'Madison', 'Milwaukee'] },
};

const slugOf = (name, state) => `${name}-${state}`.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every city, in list order: { slug, name, state, region, label }. */
export const CITIES = Object.entries(LIST).flatMap(([state, regions]) =>
  Object.entries(regions).flatMap(([region, names]) =>
    names.map((name) => ({ slug: slugOf(name, state), name, state, region, label: `${name}, ${state}` })),
  ),
);

export const CITY = Object.fromEntries(CITIES.map((c) => [c.slug, c]));

/** What a city's group is called in lists: California's regions by name, every other state by itself. */
export function groupLabel(city) {
  return city.state === 'CA' ? `California: ${city.region}` : city.region;
}

/** The cities in their groups, in list order, for a dropdown's optgroups or the directory. */
export function cityGroups(cities = CITIES) {
  const out = new Map();
  for (const c of cities) {
    const label = groupLabel(c);
    if (!out.has(label)) out.set(label, []);
    out.get(label).push(c);
  }
  return [...out].map(([label, list]) => ({ label, cities: list }));
}

// Small geometry helpers. Shapes are Leaflet-style rings: [[[lat, lng], …], …].

const M_PER_DEG = 111320;
const SQM_PER_ACRE = 4046.86;

// ArcGIS JSON polygon rings ([x, y] = [lng, lat]) → Leaflet rings.
export const fromEsriRings = (rings = []) => rings.map((ring) => ring.map(([x, y]) => [y, x]));

export function boundsOf(rings) {
  let s = 90; let w = 180; let n = -90; let e = -180;
  for (const ring of rings) for (const [lat, lng] of ring) {
    if (lat < s) s = lat; if (lat > n) n = lat; if (lng < w) w = lng; if (lng > e) e = lng;
  }
  return s > n ? null : { s, w, n, e };
}

export const centerOf = (rings) => {
  const b = boundsOf(rings);
  return b ? { lat: (b.s + b.n) / 2, lng: (b.w + b.e) / 2 } : null;
};

// Even-odd test over every ring, so holes count as outside.
export function pointInRings(lat, lng, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i]; const [yj, xj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// Area of one closed ring in acres (flat-earth approximation, fine for parcels).
export function ringAcres(ring) {
  if (ring.length < 3) return 0;
  const k = Math.cos((ring[0][0] * Math.PI) / 180) * M_PER_DEG;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][1] * k) * (ring[i][0] * M_PER_DEG) - (ring[i][1] * k) * (ring[j][0] * M_PER_DEG);
  }
  return Math.abs(sum / 2) / SQM_PER_ACRE;
}

// Metres from a point to the nearest part of a line ([[lat, lng], …]).
export function distanceToLine(lat, lng, line) {
  const k = Math.cos((lat * Math.PI) / 180) * M_PER_DEG;
  const px = (p) => [(p[1] - lng) * k, (p[0] - lat) * M_PER_DEG];
  if (line.length === 1) return Math.hypot(...px(line[0]));
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = px(line[i - 1]); const [bx, by] = px(line[i]);
    const dx = bx - ax; const dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function formatDistance(m) {
  const miles = m / 1609.34;
  return miles < 0.2 ? `${Math.round(m * 3.281)} ft` : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export const formatAcres = (a) => (a == null ? '' : `${a < 10 ? a.toFixed(1) : Math.round(a).toLocaleString()} acres`);

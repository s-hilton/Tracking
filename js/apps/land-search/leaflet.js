// Leaflet (the map library), loaded the first time a map opens.
import { loadStyles } from '../../ui.js';

const LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist';
let leafletPromise = null;
export function loadLeaflet() {
  loadStyles(`${LEAFLET}/leaflet.css`);
  leafletPromise ??= import(`${LEAFLET}/leaflet-src.esm.js`).catch((err) => { leafletPromise = null; throw err; });
  return leafletPromise;
}

export const BASEMAPS = {
  map: { label: 'Map', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
  satellite: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
};

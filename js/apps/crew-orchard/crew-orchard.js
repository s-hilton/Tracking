// Crew Orchard folder. Self-contained: this folder (code + logo from creworchard.com).
// To put apps inside it, add their ids to `contains`, e.g. ['notes', 'web:abc123'].
// No todos: a folder only groups apps; the apps inside it feed the sticky note themselves.
import { createFolder } from '../../folder.js';

export default createFolder({
  id: 'crew-orchard',
  name: 'Crew Orchard',
  image: new URL('./crew-orchard.svg', import.meta.url).href,
  contains: [],
});

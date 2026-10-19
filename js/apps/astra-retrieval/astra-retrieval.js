// Astra Retrieval folder. Self-contained: this folder (code + logo).
// To put apps inside it, add their ids to `contains`, e.g. ['notes', 'web:abc123'].
import { createFolder } from '../../folder.js';

export default createFolder({
  id: 'astra-retrieval',
  name: 'Astra Retrieval',
  image: new URL('./astra-retrieval.png', import.meta.url).href,
  contains: [],
});

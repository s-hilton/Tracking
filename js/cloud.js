// Supabase backend: client, sign-in, and offline-first synced collections.
// If js/config.js is empty everything still works, just stored on this device only.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { load, save, remove } from './storage.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

let clientPromise = null;
let user = null;
let status = { state: 'local', message: '' }; // local | signed-out | syncing | synced | error

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const currentUser = () => user;
export const syncStatus = () => status;

function setStatus(state, message = '') {
  status = { state, message };
  window.dispatchEvent(new Event('sync-status'));
}

export function getClient() {
  if (!isConfigured()) return Promise.resolve(null);
  clientPromise ??= import(SUPABASE_JS)
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }))
    .catch((err) => {
      clientPromise = null; // probably offline; try again later
      setStatus('error', 'Could not reach Supabase');
      console.warn(err);
      return null;
    });
  return clientPromise;
}

// Call once at startup.
export async function initCloud() {
  if (!isConfigured()) return;
  setStatus('signed-out');
  const client = await getClient();
  if (!client) return;
  client.auth.onAuthStateChange((event, session) => {
    const next = session?.user ?? null;
    if (next?.id === user?.id) return;
    user = next;
    setStatus(user ? 'synced' : 'signed-out');
    window.dispatchEvent(new Event('auth-changed'));
  });
  // Pick up changes made on other devices when coming back to the app.
  window.addEventListener('online', () => window.dispatchEvent(new Event('sync-now')));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.dispatchEvent(new Event('sync-now'));
  });
}

// ---- Auth -------------------------------------------------------------------
export async function sendLoginEmail(email) {
  const client = await getClient();
  if (!client) throw new Error('Supabase is not available');
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function verifyLoginCode(email, token) {
  const client = await getClient();
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signOut() {
  const client = await getClient();
  await client?.auth.signOut();
}

// ---- Synced collections -------------------------------------------------------
// A list of records kept in localStorage (so it works offline and loads instantly)
// and mirrored to a Supabase table while signed in. Every table follows the same
// shape: primary key (user_id, id), plus whatever columns the app needs.
//
//   const store = createCollection({
//     table: 'notes', key: 'notes',
//     toRow: (note) => ({ id, title, ... }),   // JS object  -> table row
//     fromRow: (row) => ({ id, title, ... }),  // table row -> JS object
//     order: { column: 'updated_at', ascending: false },
//   });
//
// Local changes are queued in an "outbox" and pushed when online + signed in.
export function createCollection({ table, key, fallback = [], toRow, fromRow, order }) {
  const outboxKey = `${key}:outbox`;
  const saved = load(key, null);
  let fromFallback = saved == null; // still showing the built-in starter data, untouched
  let items = saved ?? fallback;
  let outbox = load(outboxKey, {}); // id -> { op: 'upsert' | 'delete', v }
  let version = 0;
  let flushTimer = null;
  let syncing = null;
  const listeners = new Set();

  const persist = () => { save(key, items); fromFallback = false; };
  const emit = () => listeners.forEach((fn) => fn(items));

  function queueAll() {
    items.forEach((item) => { if (!outbox[item.id]) outbox[item.id] = { op: 'upsert', v: ++version }; });
  }

  function queue(id, op) {
    outbox[id] = { op, v: ++version };
    save(outboxKey, outbox);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => sync(false), 800);
  }

  async function flush(client) {
    const entries = Object.entries(outbox);
    if (!entries.length) return;
    const upserts = entries
      .filter(([, e]) => e.op === 'upsert')
      .map(([id]) => items.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => ({ ...toRow(item), user_id: user.id }));
    const deletes = entries.filter(([, e]) => e.op === 'delete').map(([id]) => id);

    if (upserts.length) {
      const { error } = await client.from(table).upsert(upserts, { onConflict: 'user_id,id' });
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await client.from(table).delete().eq('user_id', user.id).in('id', deletes);
      if (error) throw error;
    }
    // Only clear entries that weren't changed again while we were uploading.
    for (const [id, entry] of entries) if (outbox[id]?.v === entry.v) delete outbox[id];
    save(outboxKey, outbox);
  }

  async function fetchRemote(client) {
    const { data, error } = await client.from(table).select('*')
      .order(order.column, { ascending: order.ascending });
    if (error) throw error;
    return data.map(fromRow);
  }

  function merge(remote) {
    // Keep local edits that haven't been uploaded yet.
    const pending = items.filter((item) => outbox[item.id]?.op === 'upsert');
    items = [
      ...pending,
      ...remote.filter((r) => !outbox[r.id]),
    ];
    persist();
    emit();
  }

  // full = also download; otherwise just upload pending changes.
  async function sync(full = true) {
    if (!user) return;
    if (syncing) return syncing;
    syncing = (async () => {
      const client = await getClient();
      if (!client) return;
      try {
        setStatus('syncing');
        // First sign-in on this device: upload what was created before signing in
        // (but not the untouched starter data, or every new device would duplicate it).
        const marker = `${key}:synced:${user.id}`;
        const firstSync = !load(marker, false);
        if (firstSync && !fromFallback) queueAll();
        await flush(client);
        if (full || firstSync) {
          const remote = await fetchRemote(client);
          if (firstSync && fromFallback && remote.length === 0) {
            queueAll(); // brand-new account: start it off with the starter data
            await flush(client);
          } else {
            merge(remote);
          }
        }
        save(marker, true);
        setStatus('synced');
      } catch (err) {
        console.warn(`Sync failed for ${table}`, err);
        setStatus('error', err.message || 'Sync failed');
      }
    })().finally(() => { syncing = null; });
    return syncing;
  }

  window.addEventListener('auth-changed', () => {
    if (user) {
      sync();
    } else {
      // Signed out: forget this account's data on this device.
      items = fallback;
      fromFallback = true;
      outbox = {};
      remove(key);
      remove(outboxKey);
      emit();
    }
  });
  window.addEventListener('sync-now', () => sync());
  window.addEventListener('pagehide', () => { if (Object.keys(outbox).length) sync(false); });

  return {
    all: () => items,
    get: (id) => items.find((item) => item.id === id),
    upsert(item) {
      const index = items.findIndex((i) => i.id === item.id);
      if (index === -1) items.unshift(item);
      else items[index] = item;
      persist();
      queue(item.id, 'upsert');
    },
    remove(id) {
      items = items.filter((item) => item.id !== id);
      persist();
      queue(id, 'delete');
    },
    // fn(items) runs whenever data arrives from the server. Returns an unsubscribe function.
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

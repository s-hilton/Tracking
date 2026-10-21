// Opening an app at a particular place: the sticky note (or anything else) can
// ask an app to show one record, e.g. a contact's card or a company page.
//
//   sendIntent('rolodex', { contact: id });       // after (or while) opening the app
//   const off = onIntent('rolodex', (intent) => …); // in the app's mount(); call off() on close
//
// An intent sent before the app has mounted waits until the app listens for it.
const pending = new Map();

export function sendIntent(appId, intent) {
  pending.set(appId, intent);
  window.dispatchEvent(new CustomEvent('app-intent', { detail: { appId } }));
}

export function onIntent(appId, handle) {
  const take = () => {
    if (!pending.has(appId)) return;
    const intent = pending.get(appId);
    pending.delete(appId);
    handle(intent);
  };
  const listener = (event) => { if (event.detail.appId === appId) take(); };
  window.addEventListener('app-intent', listener);
  queueMicrotask(take); // one sent just before the app opened
  return () => window.removeEventListener('app-intent', listener);
}

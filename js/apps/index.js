// App registry: the only place that knows which apps exist.
//
// Each app lives in its own folder (js/apps/<name>/) with its own code and styles,
// plus its own database migration in supabase/migrations/ if it stores data.
// To remove an app: delete its import + entry below, its folder, and (optionally)
// write a new migration that drops its table.
//
// An entry is either a single app { id, name, icon, color, size, mount(root, ctx) }
// or a provider { apps() } that returns several (like Web apps, one per saved site).
//
// Every app requires sign-in unless it says `requiresSignIn: false` (only Settings does,
// so you can always reach it).
import notes from './notes/notes.js';
import tasks from './tasks/tasks.js';
import calculator from './calculator/calculator.js';
import clock from './clock/clock.js';
import webApps from './web-apps/web-apps.js';
import settings from './settings/settings.js';
import astraRetrieval from './astra-retrieval/astra-retrieval.js';

const APPS = [notes, tasks, calculator, clock, settings, astraRetrieval, webApps];

const withDefaults = (app) => ('requiresSignIn' in app ? app : { ...app, requiresSignIn: true });

export function getApps() {
  return APPS
    .flatMap((entry) => (typeof entry.apps === 'function' ? entry.apps() : [entry]))
    .map(withDefaults);
}

// What shows on the desktop and in the launcher: everything except apps
// that live inside a folder (they show when the folder is opened).
export function getDesktopApps() {
  const apps = getApps();
  const inFolders = new Set(apps.flatMap((app) => app.contains ?? []));
  return apps.filter((app) => !inFolders.has(app.id));
}

export function getApp(id) {
  return getApps().find((app) => app.id === id);
}

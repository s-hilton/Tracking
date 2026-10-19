// App registry: the only place that knows which apps exist.
//
// Each app lives in its own folder (js/apps/<name>/) with its own code and styles,
// plus its own database migration in supabase/migrations/ if it stores data.
// To remove an app: delete its import + entry below, its folder, and (optionally)
// write a new migration that drops its table.
//
// An entry is either a single app { id, name, icon, color, size, mount(root, ctx) }
// or a provider { apps() } that returns several (like Web apps, one per saved site).
import notes from './notes/notes.js';
import tasks from './tasks/tasks.js';
import calculator from './calculator/calculator.js';
import clock from './clock/clock.js';
import webApps from './web-apps/web-apps.js';
import settings from './settings/settings.js';

const APPS = [notes, tasks, calculator, clock, settings, webApps];

export function getApps() {
  return APPS.flatMap((entry) => (typeof entry.apps === 'function' ? entry.apps() : [entry]));
}

export function getApp(id) {
  return getApps().find((app) => app.id === id);
}

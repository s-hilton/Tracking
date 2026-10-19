// App registry. To add a built-in app, create a module that exports
// { id, name, icon, color, size, mount(root, ctx) } and list it here.
import notes from './notes.js';
import tasks from './tasks.js';
import calculator from './calculator.js';
import clock from './clock.js';
import settings from './settings.js';
import { webApp } from './webapp.js';
import { getLinks } from '../links.js';

const BUILT_IN = [notes, tasks, calculator, clock, settings];

export function getApps() {
  return [...BUILT_IN, ...getLinks().map(webApp)];
}

export function getApp(id) {
  return getApps().find((app) => app.id === id);
}

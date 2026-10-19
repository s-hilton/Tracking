// Folders group apps on the desktop. A folder opens as a window showing the
// icons of the apps it contains; those apps are hidden from the desktop itself
// (see getDesktopApps in js/apps/index.js).
//
//   export default createFolder({ id, name, image, contains: ['notes', 'web:abc'] });
import { h, appIcon } from './ui.js';

export function createFolder({ id, name, image, icon = '📁', color = '#ffffff', contains = [] }) {
  return {
    id,
    name,
    image,
    icon,
    color,
    contains,
    size: { w: 520, h: 380 },

    mount(root, ctx) {
      const apps = contains.map((appId) => ctx.getApp(appId)).filter(Boolean);
      root.append(h('div', { class: 'app folder' },
        apps.length
          ? h('div', { class: 'icon-grid folder-grid' }, ...apps.map((app) => appIcon(app, (appId) => ctx.open(appId))))
          : h('p', { class: 'folder-empty muted' }, 'This folder is empty.')));
    },
  };
}

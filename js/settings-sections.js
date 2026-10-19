// Lets an app add its own section to the Settings app without Settings
// needing to know about it. Removing the app removes its section too.
//
//   registerSettingsSection({ title: 'Web apps', order: 20, render: () => element, cleanup? })
const sections = [];

export function registerSettingsSection(section) {
  sections.push(section);
  sections.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

export const getSettingsSections = () => sections;

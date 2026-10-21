# Notes for Claude

- Read README.md → "Adding your own app" before building or changing an app, and follow its **New app checklist**.
- Every app that has anything to do must feed the dashboard's to-do sticky note through `todos()` (see README → "To-dos on the sticky note", js/todos.js, js/intents.js). If an app has nothing to do, leave a `// No todos: …` comment next to its definition.
- Bump `VERSION` in sw.js whenever shipped files change.

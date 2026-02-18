## [0.1.2] - 2026-02-18

### ⚙️ Miscellaneous Tasks

- Update package-lock.json to reflect version 0.1.1
- Replace npm ci with npm install in CI workflows for consistency
- *(release)* Bump version to 0.1.2
- *(changelog)* Update for v0.1.2
## [0.1.1] - 2026-02-18

### 📚 Documentation

- Rewrite README and rename package to apollo-map-studio
- Add full VitePress documentation site with guide, architecture, and API reference
- Update README with new repository link and add emoji to title

### ⚙️ Miscellaneous Tasks

- Add GitHub Actions workflows, release script, and Dependabot config
- Update package-lock and package.json for version 0.1.0, adjust ESLint and TypeScript dependencies, and enhance CI workflows with Node version matrix
- Enhance package.json with project description and keywords for better discoverability
- *(release)* Bump version to 0.1.1
- *(changelog)* Update for v0.1.1
## [0.1.0] - 2026-02-18

### 🚀 Features

- *(types)* Define Apollo HD Map and editor type system
- *(proto)* Add protobuf loader and binary codec for Apollo map files
- *(store)* Add Zustand state stores with undo/redo support
- *(geo)* Add coordinate projection and spatial geometry utilities
- *(export)* Add Apollo binary export engine for base_map, sim_map, and routing_map
- *(import)* Add base_map.bin parser to restore editor state
- *(editor)* Add MapLibre GL interactive map editor with draw controls and layer rendering
- *(ui)* Add toolbar and properties panel for map element editing
- *(ui)* Add new project dialog, export/import dialogs, and status bar
- Wire up app entry point and global styles

### ⚙️ Miscellaneous Tasks

- Init Vite + React + TypeScript project
- Configure ESLint, Prettier, and Husky pre-commit hooks
- *(release)* Add CHANGELOG and git-cliff config for v0.1.0

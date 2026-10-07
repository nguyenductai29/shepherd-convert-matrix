# Shepherd Master SQL Generator

Windows desktop tool (Tauri 2 + React/TypeScript) that will generate INSERT SQL from the Shepherd customer master Excel file.
**Current phase:** desktop shell + UI only. All processing returns mock data.

## Prerequisites (Windows 10/11)

- Node.js 20+
- Rust (stable, MSVC toolchain) — https://rustup.rs
- Microsoft C++ Build Tools ("Desktop development with C++")
- WebView2 Runtime (preinstalled on Windows 11)

## Run

```bash
npm install
npm run tauri dev      # desktop window (Vite on http://localhost:1420)
npm run tauri build    # installers in src-tauri/target/release/bundle/{nsis,msi}
npm run dev            # browser-only preview (no native dialogs / local paths)
```

Regenerate icons: `npm run tauri icon src-tauri/app-icon.png`

## Structure

```text
src/
  models/              shared data contracts (SelectedFile, ValidationItem, ...)
  services/
    index.ts           <- swap placeholder services for real ones here
    processing/        interfaces.ts + placeholder.ts (mock only)
    platform/          Tauri dialogs, save/reveal, local settings (browser fallbacks)
  features/conversion/ workflow orchestration + status -> step mapping
  state/               central React context
  components/shepherd/ UI components
  routes/              screens
src-tauri/             Tauri 2 Rust shell, config, capabilities, icons
scripts/desktop.mjs    desktop dev/build helper (SPA build for Tauri)
```

## Implementing the business logic (next phase)

Implement the interfaces in `src/services/processing/interfaces.ts`
(`TableDefinitionService`, `FormatCheckService`, `MasterParserService`, `ValidationService`,
`SqlGeneratorService`) and register them in `src/services/index.ts`.
Heavy work can be done in Rust: add `#[tauri::command]`s in `src-tauri/src/lib.rs` and call them with `invoke()` from the service.

Workflow states: `idle → file-selected → checking-format → parsing → validating → (validation-error | ready-to-generate) → generating → completed`, or `failed`.

Local settings (`settings.json` in the app data folder): last table definition path, last master folder, last output folder.

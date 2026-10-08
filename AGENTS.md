# Repository instructions

- Do not rewrite published Git history. Never force-push or amend/rebase/squash already-pushed commits.
- Desktop shell is Tauri 2 (`src-tauri/`). Native APIs belong only in `src/services/platform/*`, dynamically imported behind `isDesktop()`, with browser fallbacks.
- Both desktop and browser use the standard Vite static React SPA. `npm run build` emits `dist`; Tauri bundles it. No backend or external processing services.
- Preserve the approved UI layout, typography, spacing, colors, navigation and responsive behavior.
- Data contracts live in `src/models`; pure processing lives in `src/services/processing` and runs through `services` in `src/services/index.ts` using Web Workers.
- Fixed workbook structure, mapping and business extraction rules are version-controlled in `src/config/shepherd-master.ts` and processing modules. Do not create a generic user-editable Excel mapping engine.
- Workflow orchestration lives in `src/features/conversion/run-conversion.ts`. Components render state. Changing inputs/settings must invalidate prior SQL and pending results.
- Central state is one React context in `src/state/app-state.tsx`; no external state library.
- Schema metadata is authoritative. Validation errors block SQL at workflow, generator and save boundaries. Never silently skip invalid rows or generate INSERT IGNORE.
- Source workbooks are read only. Do not commit customer Excel files, local outputs, application data, or credentials.
- Do not execute generated SQL or connect to a production database.
- Before completion run npm install, npm run lint, npm run test, npm run build, native Rust tests, and npm run tauri build. Windows artifacts must build successfully.

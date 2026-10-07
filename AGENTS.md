<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- Desktop shell is Tauri 2 (`src-tauri/`); the web preview must keep working, so every Tauri API is dynamically imported behind `isDesktop()` with a browser fallback. Why: same codebase runs in Lovable preview and as a Windows app.
- Desktop builds use TanStack Start SPA mode via `SHEPHERD_DESKTOP=1` (set by `scripts/desktop.mjs`), with nitro disabled; `_shell.html` is copied to `dist/client/index.html`. Why: Tauri needs static files, the web build stays SSR.
- Data contracts live in `src/models`; processing goes through `services` in `src/services/index.ts` (interfaces in `services/processing/interfaces.ts`). Why: placeholder implementations are swapped for real ones without touching UI.
- Native file/save/settings access lives only in `src/services/platform/*`. Why: one place for OS integration and permissions.
- Workflow orchestration lives in `src/features/conversion/run-conversion.ts`; components only render state. Why: keep business flow out of React components.
- Central state is one React context in `src/state/app-state.tsx`; no external state library. Why: state is small and single-window.
- No business rules (Excel parsing, validation, mapping, SQL generation) in this repo phase; placeholders return mock data from `src/lib/mock-data.ts`. Why: implemented later by a separate agent.

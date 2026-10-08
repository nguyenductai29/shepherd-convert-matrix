# Desktop viewport and Excel references

Implement the user's supplied refinement specification within the existing Vite/React/Tauri application. Existing schema parsing, conversion defaults, SQL safety and exclusion of user-specific output remain in place. No new framework or desktop shell.

## Implementation

- [x] Add an XLSX-only KBN reader with the five required columns, numeric-to-string values, active-row filtering and deterministic duplicate rejection. Reuse the centralized resolver.
- [x] Replace JSON file selection and worker handling; persist and reload all three reference paths. Missing or invalid sources block conversion and cannot restore stale data. Migrate obsolete JSON settings with a reselection message.
- [x] Change department lookup to exactly one active matching row, as explicitly required by the new specification; retain filename validation and numeric existing IDs.
- [x] Prevent redundant NOT NULL errors where a specific unresolved mapping already reports the same record/column; preserve unrelated checks and error blocking.
- [x] Constrain the shell to the viewport, compact existing headers/input cards, and make large results/tables/editor panels scroll internally at 1440×900 and 1100×700.
- [x] Use the full official logo in the sidebar; verify existing native icons are derived from the same source. Audit remaining Lovable/demo dependencies without removing useful fixtures.
- [x] Update browser workflows, layout tests, private-fixture acceptance and documentation. Run install, lint, full tests, web build, Rust tests and Windows desktop build.

## Verification focus

No document-level overflow in populated desktop screens; sticky headers and actions remain reachable. File replacement and startup errors invalidate pending conversion. KBN values such as zero and IF0017_A survive normalization, inactive rows never resolve, and duplicate active keys cannot load. Department lookup ignores inactive matches. Defaults are injected only into real schema columns, and unresolved quantity remains one global error. Customer source files remain unchanged.

## Completed verification — 2026-10-08

- `npm install`: successful, zero audit vulnerabilities.
- `npm run lint`: zero errors; ten existing React Fast Refresh warnings.
- `npm run test` with all four private fixture paths: 281 tests passed across 24 files, none skipped.
- `npm run build`: successful TypeScript and Vite build.
- Playwright: all five workflows passed, including both desktop sizes with 2,112 generated records and 701 actionable validation errors in the invalid fixture; no document overflow.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: three SQLite/log tests passed.
- `npm run desktop:build`: successful x64 release executable, NSIS installer and MSI installer.
- Independent review verified cascade suppression still preserves default/type/UNIQUE/reference errors and confirmed the native icon SVG embeds the exact official PNG.

The reference data still lacks `%` under `KBN_UNIT` and `部材割当系` under `KBN_PRINT_PATTERN`; these remain blocking mapping errors. Quantity is not invented. Customer fixtures and generated output are excluded from source control.

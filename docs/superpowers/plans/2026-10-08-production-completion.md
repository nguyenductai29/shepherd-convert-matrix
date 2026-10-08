# Shepherd production completion implementation plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement and verify each owned subsystem.

**Goal:** Complete the existing Windows local Excel → validation → MySQL SQL preview/save workflow while retaining the approved UI.

**Architecture:** Standard Vite React SPA and Tauri 2. Pure TypeScript processing in a Web Worker; platform services own native IO, SQLite history, settings and logs. Existing React context owns presentation state. Fixed format configuration derives from actual customer workbooks, not the prior demo.

**Tech Stack:** React, TanStack Router, Vite, Tauri 2, ExcelJS, Vitest, Rust/rusqlite.

**Spec:** User's 30-phase final implementation specification in this session; it supersedes the prior placeholder-only repository phase.

## Constraints

- Preserve screens, layout and local browser fallback; no cloud, authentication, remote processing or database execution.
- Never generate SQL after any error; never skip invalid records or use INSERT IGNORE.
- Actual workbook structure and schema are required evidence for mapping; clarify differing schema revisions.
- Original Excel files remain untouched and outside source control.
- Retain source cells/rows/original values. Honor metadata PK/UNIQUE/default/auto increment.

## Tasks

- [x] Inspect actual workbooks and record deterministic fixed format/mapping, including matrix expansion and parent references.
- [x] Replace Lovable/Start build wrapper with standard Vite SPA; preserve TanStack Router and CSS; package fonts locally.
- [x] Test and implement workbook reader, table-definition parser, format checker and master parser in processing modules.
- [x] Test and implement metadata validation, complete duplicate reports and safe dependency-ordered SQL generation.
- [x] Implement and test native file bytes, metadata, settings, SQLite history, logs and collision-safe output bundles.
- [x] Connect worker processing through services and orchestration; replace mock bindings on every existing screen.
- [x] Verify startup loading, stale-result prevention, error gates, settings, preview/copy/search/save, and history details.
- [x] Run npm install, lint, test, build, Rust tests, and Windows Tauri installer build; inspect UI and artifacts.
- [x] Remove unused mocks/Lovable assets and update README/architecture guidance to describe verified behavior.

## Review focus

- Formula cells without cached results and malformed workbook structures must produce errors.
- Duplicate and referential keys must remain deterministic across matrix rows and case/collation variants.
- Parent auto-generated IDs must not be invented or assumed; generated SQL must resolve actual inserted IDs.
- A failed or changed input invalidates all previous SQL. Save uses exactly the previewed SQL.
- Disk or persistence errors must be visible without raw stack traces; report history status truthfully.

## Verification

Business tests use synthetic in-memory workbooks matching the inspected format, plus opt-in local fixture tests for the real assets. Customer workbooks are not committed. Native persistence gets isolated temporary-directory Rust tests. UI routing and workflow tests cover empty/error/success states. Build commands and artifact paths are recorded at completion.

### Completed verification — 2026-10-08

- `npm install`: passed; dependency audit reported no vulnerabilities.
- `npm run lint`: passed with no errors; 10 nonblocking React Fast Refresh warnings remain in shared UI/context exports.
- `npm run test`: 91 passed; two private-fixture tests skipped by default. With both private fixture paths supplied, all 93 tests passed across 14 files.
- `npm run typecheck` and TypeScript unused-local/parameter checks: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: all three tests passed.
- `npm run build`: passed.
- Production-preview Playwright tests: all three passed, including full conversion with exact preview/copy/save content, format-error blocking, validation-error report export, settings, and history. No external application requests or JavaScript errors were observed in the success workflow.
- Native Windows executable smoke test: responsive application window and successful SQLite initialization through frontend/native IPC.
- `npm run tauri build`: passed after the final implementation changes. NSIS and MSI artifacts generated successfully:
  - `src-tauri/target/release/bundle/nsis/Shepherd Master SQL Generator_1.0.0_x64-setup.exe` (16,572,817 bytes)
  - `src-tauri/target/release/bundle/msi/Shepherd Master SQL Generator_1.0.0_x64_en-US.msi` (17,936,384 bytes)
- `git diff --check`: passed.

### Input and deployment findings

The newer inspected table definition supplies unambiguous AUTO_INCREMENT metadata and passes the full 17-table mapping acceptance test. The older definition contains ambiguous metadata and is rejected with diagnostics. The runtime always uses the user's selected file; no private path is embedded.

The actual master contains inconsistent process headers between item U2, group Q3, and product Y1. It is correctly rejected, and no deployable SQL is generated from that uncorrected file. Synthetic workbooks exercise successful conversion against both representative and actual schema metadata. The original customer workbooks remain unchanged and outside the repository.

Installers are unsigned pending an organizational certificate. Fully offline target machines need WebView2 installed. Existing database contents and server-specific Unicode collation behavior cannot be fully verified without database access; the application intentionally has no database connection or SQL execution capability.

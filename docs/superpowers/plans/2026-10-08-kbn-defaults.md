# Confirmed conversion defaults and local KBN definitions

> **For agentic workers:** Use test-driven-development and verification-before-completion for each owned subsystem.

**Goal:** Apply confirmed audit/date defaults and resolve every applicable KBN value from a locally imported definition, preserving the existing UI layout.

**Architecture:** A pure KbnResolver consumes validated m_kbn_definition JSON rows. Settings persist the imported snapshot and source metadata; native/browser selection stays in platform services, parsing runs in the existing worker. Conversion defaults are applied once per run and filtered by actual table columns. Missing common inputs stop at preflight before cascading record validation.

**Spec:** The user's confirmed defaults and KBN lookup requirements in this conversation.

## Constraints

- created_by and updated_by are 1; effective_from is the current local calendar date at conversion time; effective_to is 9999-12-31 only when the table contains that column.
- Resolve KBN_PRODUCT_MANAGEMENT / Shepherd through the loaded source. No production fallback code dictionaries.
- Keep department code/name unconfirmed and required. Keep quantity configurable; honor table DEFAULT when applicable.
- Missing %, 部材割当系, and other names remain actionable errors unless present in the loaded source.
- Preserve schema validation, SQL error gates, source workbooks, layout, and existing positional process-name fix.

## Tasks

- [x] Test and implement KbnDefinition JSON parsing and reusable bidirectional resolver, including malformed/inactive/conflicting rows and missing names.
- [x] Test and implement local JSON import, persisted snapshot/source metadata, legacy-settings migration, and stale-result invalidation using existing settings sections.
- [x] Test and implement schema-aware defaults, local-date calculation, required-input preflight, and all parser KBN lookups using canonical names and explicit existing format aliases.
- [x] Update fixtures/documentation and verify actual local definitions, unknown values, fresh local-date behavior, quantity DEFAULT, and schema validation.
- [x] Run install, lint, full tests, production-browser workflow, build, Rust tests, and Windows installer build; review the resulting diff.

## Review focus

- A stale saved effective date or audit ID must never override the confirmed per-run defaults.
- Numeric KBN values such as 0 must remain present, and missing or ambiguous lookups must never guess.
- An invalid or cancelled source import must retain the prior valid snapshot without reviving old SQL.
- Missing global inputs produce specific preflight errors, while row-level failures still preserve source information and block SQL.
- Source definitions may change codes; business behavior must depend on names, not numeric ranges or literals.

## Verification completed

- `npm install`: passed, zero dependency vulnerabilities reported.
- `npm run lint`: zero errors; 10 existing Fast Refresh warnings.
- `npm run test` with schema, master, and KBN private fixture paths: 171 tests passed across 18 files. Without private paths, 167 pass and four optional tests skip.
- `npm run test:e2e`: production build and three browser workflows passed, including real worker JSON import, persisted KBN reload after page refresh, exact SQL save, and error blocking.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: three tests passed.
- `npm run tauri build`: passed after review fixes, including TypeScript/Vite build and both NSIS EXE and MSI installers.
- `git diff --check`: passed. Independent review has no remaining findings.

Private-fixture verification confirms the actual customer workbook passes format validation, populated audit/effective fields do not produce missing-value errors, and product management resolves from the actual local source. `%` and `部材割当系` remain explicit unresolved mapping errors. Original private inputs are not included in the repository.

Review regressions cover navigation during a pending native settings save, later queued source updates, and exact source labels taking precedence over legacy format aliases. A committed snapshot always synchronizes the active provider; no UI redesign was introduced.

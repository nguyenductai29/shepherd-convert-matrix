# Local department references and conversion context

**Goal:** Derive the department code from the fixed master filename, resolve its existing ID from a local department workbook, and generate only the intended master SQL.

**Spec:** Pasted user request in this session. Follow-up clarification excludes user permissions and user-specific report-output assignments.

**Architecture:** Pure department parser/resolver and centralized ConversionContext; platform file access and provider-owned reference loading; orchestration resolves context before master parsing/schema validation. Workers receive a serializable context snapshot and reconstruct the KBN resolver. Preserve existing file-card layout and settings styles.

## Tasks

- [x] Test and implement filename validation, required department reference columns, exact/unique active lookup, and context defaults.
- [x] Integrate reference loading and context before parsing; inject real department IDs, remove generated departments and user-specific records, and block forbidden SQL targets.
- [x] Add department/KBN file cards, persisted native paths, read-only department display, and remove obsolete manual settings.
- [x] Apply the supplied logo to the existing sidebar and native icon assets without altering its proportions.
- [x] Update fixtures, workflow tests, and documentation; verify private references, install/lint/tests/build/Rust/Windows installers.

## Review focus

- The template prefix 部門コード is not a real department code; invalid filenames stop before master parsing.
- Duplicate matching codes remain errors even if one row is inactive; unrelated extra reference columns are ignored.
- No fake m_departments record, no department code in a numeric ID field, and no m_departments SQL at the generator boundary.
- Reference selection, replacement, loading failures, and settings changes invalidate prior results and pending work.
- User-specific scope is excluded explicitly; department report-output master definitions still resolve their print patterns through KBN data.

## Verification

- `npm install`: succeeded, audit reports zero vulnerabilities.
- `npm run lint`: zero errors, ten existing Fast Refresh warnings.
- `npm run test` with all four private fixture paths: 232 passed, none skipped.
- `npm run build`: succeeded.
- Playwright: all three production-preview workflows passed using `SHEPHERD_E2E_PORT=15420`; existing development server was left running.
- Rust library tests: three passed.
- `npm run tauri build`: succeeded; x64 NSIS EXE and MSI generated.
- Independent core/UI reviews completed; persistent schema-file diagnostics were added following review and covered by regression tests.
- Original customer files remain unchanged. The actual workbook passes format checks; unresolved reference mappings and database uniqueness errors still block SQL as intended.

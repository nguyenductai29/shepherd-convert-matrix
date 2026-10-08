# Windows desktop development and local storage

The desktop application uses Tauri 2, the MSVC Rust toolchain, and the Microsoft Edge WebView2 runtime. React, fonts, Excel parsing, SQL generation, settings, and history run locally. There is no database connection or network service used by the application.

## Windows prerequisites

- Windows 10 or Windows 11, x64.
- Node.js 22.12 or later and npm.
- Rust stable with the `x86_64-pc-windows-msvc` target (`rustup` installation recommended).
- Visual Studio Build Tools with **Desktop development with C++**, MSVC x64/x86 tools, and a Windows 10/11 SDK.
- Microsoft Edge WebView2 Runtime. Windows deployments must have this runtime installed. The installer can download the bootstrapper if it is missing; an offline deployment must provision WebView2 in advance.

Build-machine package installation and the initial Tauri installer toolchain download require internet access. Installed application processing does not.

```powershell
npm install
npm run desktop:dev
```

The browser preview remains available with `npm run dev`. Native dialogs, local paths, Explorer access, and SQLite history are available in the desktop application. Browser preview reads selected files in memory and uses browser local storage; it never uploads workbook content.

## Building and testing

```powershell
npm run lint
npm run test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run build
npm run desktop:build
```

Tauri builds the frontend automatically. Outputs use version `1.0.0`:

- `src-tauri/target/release/shepherd-master-sql-generator.exe`
- `src-tauri/target/release/bundle/nsis/Shepherd Master SQL Generator_1.0.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Shepherd Master SQL Generator_1.0.0_x64_en-US.msi`

The generated installers are unsigned unless the organization supplies its own signing configuration. Signing credentials are not stored in this repository.

## Local persistence

Tauri resolves the application data directory for identifier `jp.shepherd.master-sql-generator`; on Windows this is normally `%APPDATA%\jp.shepherd.master-sql-generator`.

| Path                  | Contents                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings.json`       | Schema/department/KBN source paths, master/output directories, SQL options, theme, confirmed quantity, KBN metadata and cached rows that are cleared/reloaded at startup |
| `history.sqlite3`     | Conversion history, validation results, source paths, and output paths                                                                                                   |
| `logs/shepherd.jsonl` | Timestamped actions and technical diagnostics                                                                                                                            |

SQLite uses WAL journaling and a five-second busy timeout. `history.sqlite3-wal` and `history.sqlite3-shm` may exist while the application is running. Close the application before backing up its whole data directory; do not copy only the SQLite main file while it is open.

Logs rotate after 1 MiB, keeping five older files. Log entries are not intended to contain workbook rows, SQL text, or credentials. Open the log directory through **設定 → ログフォルダを開く**.

All three reference workbooks remain separate local sources. Desktop startup reloads and validates the schema, department and KBN Excel files from `lastTableDefinitionPath`, `lastDepartmentReferencePath` and `lastKbnDefinitionPath`. Missing, unreadable or invalid sources produce a warning and block conversion until corrected/reselected. Department rows are not persisted as manual settings. Stored KBN rows are cleared before loading references and never authorize a conversion by themselves. Legacy JSON references and source-less cached definitions require an `.xlsx` selection.

Browser preview cannot reopen arbitrary local paths after a reload and requires all reference workbooks to be selected again. During an open session, changing an original file requires reselection through **マスタ変換 → ファイルを変更**. The UI disables conversion until reference loading is complete; stale or failed loads cannot restore previous SQL or valid cached references.

Settings no longer accept department code/name, login-to-user JSON, audit IDs or effective dates. The filename resolves the department through its reference file. Audit IDs and dates are computed automatically for each conversion; only a confirmed product-structure quantity remains configurable when the schema supplies no default. Obsolete saved manual overrides are ignored.

## Native file access and output safety

All Tauri API imports are guarded by the desktop runtime check in `src/services/platform`. Native file dialogs supply the four local inputs (schema `.xlsx`, department `.xlsx`, KBN `.xlsx`, master `.xlsm`/`.xlsx`) and the output directory. Source files are read only; macros are not executed. Selecting or replacing an input invalidates prior conversion/SQL results, including pending operations.

Each export creates a unique subdirectory of the chosen output directory. A successful export contains:

- `insert_YYYYMMDD_HHmmss.sql` when validation has no errors.
- `validation_report.json`.
- `master_snapshot.json`.
- `validation_report.xlsx`.

Text output uses UTF-8. Reports can be exported after failed validation, but SQL is explicitly rejected. The saved SQL is the exact preview text. Export files are first written to a uniquely named `.partial` staging directory; the folder receives its final name only after all writes succeed. Failed writes remove the staging directory when the filesystem allows cleanup. A power loss can leave a `.partial` folder, which is never recorded as a completed export.

The production content security policy permits local resources and Tauri IPC. The development policy additionally permits the localhost Vite connection. File permissions support the native user-selected paths, report creation, final directory rename, and removal of failed staging output. There is no HTTP client or database execution command.

## Desktop viewport layout

The existing window targets 1440×900 with a minimum of 1100×700. The application root, sidebar and main area are constrained to the viewport, with a compact fixed page header. Conversion keeps its step indicator, four compact file cards and actions above a remaining-height result panel. Format, analysis and validation tabs scroll within that panel.

Validation and history tables scroll internally with sticky headers. SQL table navigation and the virtualized code viewer scroll independently. Table definitions use bounded table-list and definition panes. Dashboard, settings, mapping and history detail have one primary inner content scroll area. Long filenames and paths use truncation with full-value tooltips. Colors, navigation and dark mode retain the approved appearance.

## Application branding

The sidebar displays the full horizontal official artwork from `assets/ShepherdSQL.png`. Its SVG viewport (`55 270 1365 520`) removes only surrounding whitespace and embeds the unchanged 1448×1086 PNG; the aspect ratio, symbol, wordmark and subtitle remain intact. A contained white surface keeps it usable in dark mode without color filters. Windows executable/installer/taskbar icons and the browser favicon use existing compact variants derived from the same source. `src-tauri/app-icon.svg` frames the original symbol without distortion, and Tauri generates the platform icon sizes. See [branding asset instructions](../assets/README.md) for regeneration commands.

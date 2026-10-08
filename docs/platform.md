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
npm run tauri dev
```

The browser preview remains available with `npm run dev`. Native dialogs, local paths, Explorer access, and SQLite history are available in the desktop application. Browser preview reads selected files in memory and uses browser local storage; it never uploads workbook content.

## Building and testing

```powershell
npm run lint
npm run test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run build
npm run tauri build
```

Tauri builds the frontend automatically. Outputs use version `1.0.0`:

- `src-tauri/target/release/shepherd-master-sql-generator.exe`
- `src-tauri/target/release/bundle/nsis/Shepherd Master SQL Generator_1.0.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Shepherd Master SQL Generator_1.0.0_x64_en-US.msi`

The generated installers are unsigned unless the organization supplies its own signing configuration. Signing credentials are not stored in this repository.

## Local persistence

Tauri resolves the application data directory for identifier `jp.shepherd.master-sql-generator`; on Windows this is normally `%APPDATA%\jp.shepherd.master-sql-generator`.

| Path                  | Contents                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `settings.json`       | Recent paths, SQL options, theme, department/quantity/user references, imported KBN snapshot and source metadata |
| `history.sqlite3`     | Conversion history, validation results, source paths, and output paths                             |
| `logs/shepherd.jsonl` | Timestamped actions and technical diagnostics                                                      |

SQLite uses WAL journaling and a five-second busy timeout. `history.sqlite3-wal` and `history.sqlite3-shm` may exist while the application is running. Close the application before backing up its whole data directory; do not copy only the SQLite main file while it is open.

Logs rotate after 1 MiB, keeping five older files. Log entries are not intended to contain workbook rows, SQL text, or credentials. Open the log directory through **設定 → ログフォルダを開く**.

## Native file access and output safety

All Tauri API imports are guarded by the desktop runtime check in `src/services/platform`. Native file dialogs supply the source files and output directory. Source workbooks are read only; macros are not executed.

Each export creates a unique subdirectory of the chosen output directory. A successful export contains:

- `insert_YYYYMMDD_HHmmss.sql` when validation has no errors.
- `validation_report.json`.
- `master_snapshot.json`.
- `validation_report.xlsx`.

Text output uses UTF-8. Reports can be exported after failed validation, but SQL is explicitly rejected. The saved SQL is the exact preview text. Export files are first written to a uniquely named `.partial` staging directory; the folder receives its final name only after all writes succeed. Failed writes remove the staging directory when the filesystem allows cleanup. A power loss can leave a `.partial` folder, which is never recorded as a completed export.

The production content security policy permits local resources and Tauri IPC. The development policy additionally permits the localhost Vite connection. File permissions support the native user-selected paths, report creation, final directory rename, and removal of failed staging output. There is no HTTP client or database execution command.

# Shepherd Master SQL Generator

Windows 10/11 向けのローカルデスクトップアプリです。確定済みの Shepherd マスタ整備 Excel とテーブル定義書を読み込み、全件検証後に MySQL INSERT SQL を生成・確認・保存します。元の Excel は変更しません。DB接続、SQL実行、認証、外部アップロードはありません。

## 必要な環境

- Windows 10 / 11、x64
- Node.js 22.12 以上（検証環境: 22.23.3）、npm
- Rust stable、`x86_64-pc-windows-msvc`
- Visual Studio Build Tools の **C++ によるデスクトップ開発**、MSVC と Windows SDK
- Microsoft Edge WebView2 Runtime

依存パッケージの取得・初回ビルドにはインターネットが必要です。アプリの通常利用はオフラインです。WebView2 がない PC ではインストーラーが取得を試みるため、完全オフライン配布では WebView2 を事前に用意してください。生成インストーラーは組織の署名証明書を設定しない限り未署名です。

## 開発

```powershell
npm install
npm run tauri dev
```

ブラウザで画面とローカル処理を確認する場合:

```powershell
npm run dev
```

ブラウザ版はファイル内容をそのブラウザ内で処理します。完全パス、ネイティブダイアログ、Explorer、SQLite はデスクトップ版の機能です。ブラウザの履歴・設定は localStorage に保存します。

## テスト

```powershell
npm run lint
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

ブラウザの実操作テスト:

```powershell
npx playwright install chromium
npm run test:e2e
```

Vitest は workbook/schema parsing、固定ヘッダー、正規化、NOT NULL、数値範囲、日時、文字長、単一・複合 UNIQUE、参照、SQLエスケープ、日本語、NULL、DEFAULT、AUTO_INCREMENT、順序、エラー時の生成禁止、設定、履歴、ファイル出力、処理中の入力変更を検証します。Rust のテストは SQLite 再オープン・更新・ログローテーションを確認します。

顧客 Excel はリポジトリに含めません。手元のファイルを使った追加テストは環境変数で有効化します:

```powershell
$env:SHEPHERD_SCHEMA_FIXTURE = 'C:\path\テーブル定義書.xlsx'
$env:SHEPHERD_MASTER_FIXTURE = 'C:\path\部門コード_Shepherd導入_マスタ整備ファイル.xlsm'
npm run test -- src/services/processing/fixtures.local.test.ts src/services/processing/full-mapping.local.test.ts
```

通常の `npm run test` ではこの2件だけをスキップします。追加テストは実スキーマで全17テーブルのマッピングを検証し、実マスタの構造判定と原本不変を確認します。

## Windows インストーラーのビルド

```powershell
npm run tauri build
```

このコマンドで TypeScript、Vite、Rust、NSIS、MSI をビルドします。

- `src-tauri/target/release/shepherd-master-sql-generator.exe`
- `src-tauri/target/release/bundle/nsis/Shepherd Master SQL Generator_1.0.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Shepherd Master SQL Generator_1.0.0_x64_en-US.msi`

## 使用方法

1. **テーブル定義** または **マスタ変換** で `.xlsx` のテーブル定義書を選択します。パスを保存し、次回起動時に自動読込します。なくなったファイルは再選択してください。
2. **設定** で部門コード・部門名・登録更新ユーザーID・適用開始日・品目管理区分・品目構成数量を入力して保存します。これらは確定 Excel に含まれない値です。既存ユーザーや追加単位、帳票パターンの参照IDも必要に応じて設定します。
3. **マスタ変換** で新しい `.xlsm` / `.xlsx` を選択して **変換を開始** を押します。構造確認、正規化、型・長さ・必須・参照・全件重複チェックを行います。
4. **検証結果** で全エラーを確認します。エラーが1件でもあれば SQL は生成できません。Excel / 設定を修正し、Excel を再選択して検証します。警告のみなら続行できます。
5. **SQL生成** を押します。親マスタを先に生成し、自動採番IDは `LAST_INSERT_ID()` によって子レコードへ渡します。自動採番IDの事前推測や `INSERT IGNORE` は行いません。
6. **SQLプレビュー** でテーブル移動・全体/選択部分コピー・検索・行番号を利用して確認します。表示中の SQL と保存内容は同一です。
7. **SQLを保存** で出力先を選びます。実行ごとの新しいフォルダに以下を UTF-8 で出力し、**フォルダを開く** から確認できます。検証画面からはエラー時もレポート一式を保存できます。

```text
insert_YYYYMMDD_HHmmss.sql
validation_report.json
master_snapshot.json
validation_report.xlsx
```

エラー時のレポート出力には SQL を含めません。書込途中の失敗は完成フォルダとして公開しません。履歴には元ファイル・検証結果・保存先を記録し、過去の検証結果も閲覧できます。

参照データ設定は名称とIDの JSON オブジェクトです。例: `{"login_id": "17"}`。実在するDBの値を管理担当者が確認して入力してください。Excel列のマッピングは固定で、画面から変更できません。

## 対応フォーマットと運用上の前提

- テーブル定義書は A5:SQL Mk-2 形式の物理/論理名・列・制約・インデックス・RDBMS情報を解析します。古い定義書で AUTO_INCREMENT の対象列を一意に判定できない場合は、安全のため拒否します。列型に `auto_increment` を含む最新エクスポートを使ってください。
- マスタは9つの固定マトリクスシートを解析します。仕様と対応列は [docs/excel-format.md](docs/excel-format.md) と `src/config/shepherd-master.ts` を参照してください。
- マクロや Excel 数式は実行しません。数式は保存済みの計算結果を読みます。計算結果がないセル、Excelエラー、構造の不一致は修正して Excel で再保存してください。
- 確定フォーマットでもデータが常に正常とは限りません。調査に使用したマスタには工程項目・工程G・品目構成間の工程見出し不一致があり、そのままでは SQL を生成しません。
- SQLの対象は MySQL です。トランザクション・コメントは既定で有効です。引用符を安全に処理し、バックスラッシュ/制御文字には UTF-8 の16進リテラルを使用するため `NO_BACKSLASH_ESCAPES` の設定に依存しません。
- DBの既存データは照合しません。SQL実行担当者が対象DB・既存データ・参照IDを確認します。ローカルの照合順序チェックは一般的な case/accent/PAD 規則を扱いますが、サーバーバージョン固有の Unicode 照合規則の完全再現はできません。

## アーキテクチャ

```text
src/models                         共通データ契約・元セル情報
src/config/shepherd-master.ts      固定形式、区分値、読取専用マッピング、テーブル順序
src/services/processing            Excel読込・正規化・検証・SQL・Web Worker
src/services/platform              ネイティブファイル、設定、履歴、ログ
src/features/conversion            ワークフローとエラー/古い結果の防止
src/state/app-state.tsx             単一React Context
src/routes                         承認済みレイアウトの各画面
src-tauri/src/storage.rs            SQLite履歴・ローテーションログ
```

React + TypeScript + Vite の静的 SPA と Tauri 2 で構成します。TanStack Router はファイルベースルーティングに使用し、TanStack Start / Nitro / Lovable の実行・ビルド依存はありません。フォントもローカルに同梱します。ビジネス処理は Web Worker で動き、大量SQLの画面は表示範囲だけを描画します。

[platform documentation](docs/platform.md) に Windows 前提条件、バックアップと保存パスを記載しています。ログは **設定 → ログフォルダを開く** から確認できます。UIは日本語のエラーと展開式の詳細情報を表示します。認証情報やDBパスワードを扱う機能はありません。

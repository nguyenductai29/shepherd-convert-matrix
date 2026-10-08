# Supported Shepherd workbook contract

The conversion uses four local files: a database table definition `.xlsx`, an existing department reference `.xlsx`, a KBN definition `.xlsx`, and the finalized nine-sheet Shepherd matrix workbook (`.xlsm` or `.xlsx`). Format knowledge and extraction rules live in `src/config/shepherd-master.ts`; the UI displays the same read-only mapping definitions used by the parser. This is not a generic Excel importer.

## Table definition workbook

The parser reads the A5:SQL Mk-2 export format:

- `B6 = 物理テーブル名`, table name in `C6`, logical name in `C5`.
- Column section: B logical name, C physical name, D datatype, E `Not Null`/`Yes (PK)`, F SQL default, G notes.
- Index section: B index name, C comma-separated columns, E primary key, F uniqueness. Both `Yes` and `制約` indicate uniqueness.
- Constraint section: `PRIMARY KEY` and `UNIQUE` definitions are merged with the index metadata without duplicating constraints.
- The RDBMS section supplies the table collation and legacy AUTO_INCREMENT information.

The selected workbook is always the schema authority. Neither the UI examples nor the fixed extraction configuration override its columns, constraints, or defaults. Non-definition sheets in a definition workbook are ignored.

Current exports explicitly include `auto_increment` in the column datatype. Some older exports omit it and only provide a table-level AUTO_INCREMENT counter. The parser can infer the column only when exactly one integer primary-key column exists. An older export with multiple possible identity columns is rejected with an explanation; export an up-to-date definition or annotate the correct column with `auto_increment`.

## Department reference and master filename

The master filename must be `<departmentCode>_Shepherd導入_マスタ整備ファイル.xlsm` or the `.xlsx` equivalent. `HPK_Shepherd導入_マスタ整備ファイル.xlsm` resolves code `HPK`. The literal template prefix `部門コード`, blank prefixes, surrounding whitespace and invalid filename characters are rejected. The prefix is a business key, not a database ID.

The selected department workbook, for example `ShepherdDB.m_departments.xlsx`, represents existing `m_departments` rows. One sheet must contain all five headers in its first nonempty row, in any order:

| Column            | Reference requirement                                          |
| ----------------- | -------------------------------------------------------------- |
| `department_id`   | Positive integer ID from the existing database                 |
| `department_code` | Nonempty business key; matched exactly to the filename prefix  |
| `department_name` | Nonempty department name                                       |
| `edit_ctrl_kbn`   | Existing edit-control value                                    |
| `invalid_flg`     | Boolean/bit `0` or `1`; the selected department must be active |

Audit and effective-date columns are not required. Unrelated extra columns are ignored. Missing or repeated required headers, multiple candidate sheets and malformed reference values are errors.

Exactly one active row (`invalid_flg = 0`) must have `department_code === extractedDepartmentCode`. Inactive rows are excluded before counting matches; one active row and any inactive rows with the same code resolve successfully. Zero active matches produce `部門コードに対応する部署が見つかりません。`; multiple active matches produce `同一の部門コードが部門マスタに複数存在します。`. The resolved department is displayed read-only. Its integer `department_id` is injected into every generated record that has a `department_id` column. No department code is substituted for that ID, and no real or synthetic `m_departments` record is generated.

All three reference workbook paths (schema, department and KBN) persist on desktop. Startup rereads and validates each saved Excel file; missing or unreadable files produce a warning and require reselection. Browser users reselect the reference workbooks after a page reload. Department rows are not stored as a saved settings dictionary, and cached KBN rows cannot replace a fresh workbook load. If a file changes while the application is open, reselect it to load the new contents.

## KBN reference workbook

The selected `.xlsx`, for example `ShepherdDB.m_kbn_definition.xlsx`, represents existing `m_kbn_definition` reference rows. Exactly one sheet must contain all five headers in its first nonempty row; column order is unrestricted:

| Column              | Reference requirement                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| `category_kbn_code` | Nonempty category string                                                |
| `kbn_value`         | Nonempty code, normalized to a string even if the Excel cell is numeric |
| `kbn_name`          | Nonempty display name                                                   |
| `order_no`          | Integer in the signed 32-bit range                                      |
| `invalid_flg`       | Boolean/bit `0` or `1`; only `0` participates in lookups                |

Missing or repeated required headers, multiple candidate sheets, blank required cells and malformed values block conversion. Completely empty rows are ignored. Audit columns (`created_at`, `created_by`, `updated_at`, `updated_by`) are not required, and unrelated extra columns are ignored. The normalized model retains `order_no` and a boolean `invalid_flg`.

Values such as numeric `0`, `1` and `10` become `"0"`, `"1"` and `"10"`; text codes such as `IF0016` and `IF0017_A` remain strings. Simple Excel zero-padding formats such as `000` preserve displayed codes such as `001`. Values are not replaced with guessed numeric defaults.

Uniqueness is checked among active rows only. `(category_kbn_code, kbn_value)` must identify exactly one active row, including when duplicate rows have identical contents. One active `(category_kbn_code, kbn_name)` cannot map to different values. Inactive rows never resolve names or values and do not cause active-key ambiguity.

External JSON definitions are no longer accepted. Legacy JSON source settings and source-less cached definitions require selection of an Excel reference. On every startup the runtime clears the cached KBN rows and loads the saved `.xlsx` again on desktop; browser users must reselect it. Settings metadata is not proof that a source has been loaded in the current session.

## Fixed master sheets

| Sheet                       | Positions                                                                                                                                                                                                                  | Extraction                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 大工程マトリクス            | A1 header; A2 onward                                                                                                                                                                                                       | `m_major_processes`, row order                                                                                                    |
| 単位マトリクス              | A1 header; A2 onward                                                                                                                                                                                                       | Allowed unit names; database unit codes come from confirmed reference data                                                        |
| 帳票属性マトリクス          | A1:I1 headers; rows 2 onward                                                                                                                                                                                               | Attribute vocabulary; `部門外管理品` is excluded as instructed by the workbook                                                    |
| 1_6_品目構成マトリクス      | Row 1 headers; rows 2 onward; D parent, E level, F code, G name, H part type, I final check, J group, K:DF process order; DG calculation helper                                                                            | Products, product/department/group relationships, hierarchical product structures                                                 |
| 2_3_4_8_工程項目マトリクス  | G:DB process columns; row 2 final name, row 3 location prefix, row 4 base name, row 5 experimental flag, row 6 major process, row 7 display type; items start row 8 with A name/B description/D unit/E option/F input type | Processes, item names, items, process/item relationships                                                                          |
| 3_選択肢マトリクス          | A1:B1 headers; rows 2 onward                                                                                                                                                                                               | Options and ordered option items                                                                                                  |
| 4_10_帳票場所マトリクス     | A:J; data starts row 2                                                                                                                                                                                                     | Validates process location references. The sheet explicitly identifies itself as review information; no printer table is invented |
| 5_9_工程Gマトリクス         | B group names, C:CX process columns; row 2 display types, row 3 names, groups start row 4                                                                                                                                  | Process groups, ordered group/process relationships, predecessor and final-process flags                                          |
| 7_権限&帳票出力先マトリクス | Row 1 headers; A login/B review name/C report pattern/D output path/E role/F warning; data starts row 2                                                                                                                    | Department report outputs from C/D; user permissions and user-specific assignments are outside the selected generation scope      |

Required sheets and fixed header text are checked before records are extracted. Header comparison normalizes whitespace and full-width character variants; explanatory lines following a fixed title are permitted. Data outside the fixed column ranges is rejected. Additional sheets are reported as warnings and do not participate in conversion.

The item and product process names must agree exactly at each corresponding column position. Group headers use the same name for its first occurrence and append `2`, `3`, etc. for subsequent occurrences of that exact logical name, counted left-to-right across the process columns. Unique names require exact equality. Blank columns do not count. Trailing numbers are never stripped: repeated `工程2` names require group headers `工程2`, `工程22`, `工程23`. Missing, reordered, or arbitrary discriminators are errors.

The supplied sample is valid at process columns 13 and 15: item `S2`/`U2` and product `W1`/`Y1` contain `陰極真空処理`, while group `O3`/`Q3` contain `陰極真空処理` and `陰極真空処理2`. Process references and group/product order comparisons use column positions so repeated logical names remain distinct. Database PK/UNIQUE constraints and all other record validations still apply without exception.

## Extraction rules

- `○`, `〇`, `◯`: required input; `□`: required and common; `●`: optional input; `■`: optional and common. Unknown symbols are errors.
- Group order values must be positive integers without duplicate positions. The preceding sorted process supplies `prev_process_id`; the final process supplies `final_process_flg`.
- Red (`FF0000`) and yellow (`FFFF00`) group cell fills encode previous-process error and warning checks. Unsupported theme colors require an explicit supported color rather than being guessed.
- Product hierarchy levels use `0`, `1____`, `_2___`, and the equivalent underscore-padded levels. The stack of preceding parent levels supplies the immediate parent; D must agree with the root product code.
- A product may occur in several BOM branches. The workbook explicitly says its first occurrence defines the product's name, part type, final check and group. Later occurrences retain their source rows; conflicting later values produce visible warnings. Duplicate relationship records remain errors under the schema's primary/unique constraints.
- Repeated option names and item names define shared parent records. Individual option items and relationships are retained for duplicate validation.
- The report-output sheet still supplies department-level report patterns and paths for `m_department_report_outputs`. The selected generation scope excludes `r_authority` and `r_user_report_outputs`; it does not require user references or a login-to-user JSON setting. User IDs are never invented.
- Registration/update timestamps and other database defaults are omitted where allowed. Generated surrogate IDs are not guessed: child records hold typed references to their inserted parent records.
- Review-only fields (including user display-name notes, printer purchase notes and review progress) do not become database columns.

## Conversion context and automatic values

`buildConversionContext` centralizes the resolved department, audit ID, local conversion date, effective end date, product management KBN and `KbnResolver`. Processing follows this order:

1. Load the local reference files and validate the master filename.
2. Resolve exactly one active department using the filename prefix.
3. Load KBN definitions and resolve `KBN_PRODUCT_MANAGEMENT / Shepherd`.
4. Build the context; validate the fixed workbook structure and parse/normalize records.
5. Inject automatic/reference values and resolve record-level KBN mappings.
6. Run database type, required, length, range, reference, PK and UNIQUE validation.
7. Generate SQL only if there are no errors.

Confirmed automatic values are applied to the columns that actually exist in each target table: `created_by = 1`, `updated_by = 1`, `effective_from = current local date`, and `effective_to = 9999-12-31`. The date is evaluated once per conversion, including after the app stays open overnight, and never loaded from a saved effective date. Manual department, audit and date inputs are removed; obsolete saved overrides are ignored. Missing departments or global KBN definitions stop before record validation, preventing cascading missing-value errors.

If one unresolved quantity policy affects many product structures, validation reports one root requirement rather than repeating a NOT NULL error for every affected row. Quantity remains configurable under `設定 → 品目構成の設定` when product structures require it and the schema supplies no applicable default. No quantity is silently assumed. If the table definition supplies a usable DEFAULT, leaving the setting blank preserves database default behavior.

`KbnResolver.resolve(categoryKbnCode, kbnName)` resolves `(category_kbn_code, kbn_name)` to a string `kbn_value`; `resolveByValue(categoryKbnCode, kbnValue)` returns the name. Both use only the active rows of the validated Excel reference. Missing names or values produce clear mapping errors with source locations where available. Changes to a file during a session require reselection; no database connection or remote refresh occurs.

All applicable parser values use the resolver: `KBN_PRODUCT_MANAGEMENT / Shepherd`, `KBN_PROCESS`, `KBN_INPUT_TYPE`, `KBN_DISPLAY`, `KBN_UNIT`, `KBN_PART_TYPE`, `KBN_PREV_PROC_CHECK`, `KBN_FINAL_PROC_CHECK`, and `KBN_PRINT_PATTERN`. `KBN_ROLE` is not required because user permission generation is excluded. Workbook-specific label aliases are centralized in the fixed format configuration and used only when the source has no exact label; no production numeric KBN fallback dictionaries remain. Option-input behavior uses canonical names, so changed codes do not bypass required option references.

The supplied source resolves SAP to `0` and Shepherd to `1`, but these values are data, not business-logic literals. It has no `KBN_UNIT / %` or `KBN_PRINT_PATTERN / 部材割当系`; these remain errors with source locations until an explicit matching definition is provided. The converter does not choose between assembly print-pattern variants.

The application never connects to a database to refresh references. The operator supplies current exports and confirms their applicability to the target database. Changing a selected source or relevant setting invalidates previous validation/SQL results.

## Workbook reading and provenance

ExcelJS reads `.xlsx` and `.xlsm` OOXML without executing macros. All changes made to ZIP/XML representations occur in memory; the selected files are never written. Japanese text, numeric and boolean values, dates, rich text, merged cells and formula caches are supported. A mapped formula without a cache or containing an Excel error produces a validation error and requires recalculation and saving in Excel.

The supplied template contains over 600,000 array formulas, mostly cached empty strings, and dropdown validations spanning more than 30 million cells. In-memory preprocessing removes blank padding and cached-empty formula cells while retaining shared-formula anchors, nonempty values, styles used for checks and merge ranges. Excel's authoring dropdown rules and the calculation chain are not loaded or executed. ZIP entry count and expanded-size limits prevent uncontrolled expansion (10,000 entries, 256 MiB per entry, 512 MiB total).

Every normalized record retains source sheet/row, original mapped values and source-cell addresses. Validation uses the complete normalized record set and reports all issues together. Any error blocks the SQL generator even if it is called directly without the UI.

## Tests without private workbooks

`src/test/fixtures/master-workbook.ts` builds a synthetic nine-sheet workbook. Unit tests cover fixed-format rejection, partial rows, extraction, references, attributes, formula caches including 0/false, merged cells, colored marks, shared formulas and malformed archive limits. Department tests cover filename extraction/rejection, required columns, absent/duplicate active matches, inactive exclusion, resolved integer IDs and generation scope. KBN tests cover the five required columns, numeric/text codes, zero-padding, order/flag validation, inactive exclusion, identical active-key duplicates, ambiguous names, resolver lookups and JSON rejection. Runtime tests cover startup reload, missing files, stale results and cached-source rejection. No customer workbook is committed.

Optional local acceptance tests read private workbooks from environment variables:

```powershell
$env:SHEPHERD_SCHEMA_FIXTURE = 'C:\local\table-definition.xlsx'
$env:SHEPHERD_MASTER_FIXTURE = 'C:\local\HPK_Shepherd導入_マスタ整備ファイル.xlsm'
$env:SHEPHERD_DEPARTMENT_FIXTURE = 'C:\local\ShepherdDB.m_departments.xlsx'
$env:SHEPHERD_KBN_FIXTURE = 'C:\local\m_kbn_definition.xlsx'
npm run test
```

These tests verify that source files remain byte-identical, invalid customer data cannot produce SQL, and a complete synthetic master can generate SQL against the real supplied schema.

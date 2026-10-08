# Supported Shepherd workbook contract

The input contract is the finalized nine-sheet Shepherd matrix workbook. It is not the earlier UI's demonstration format (`部門`, `商品`, `工程G`, etc.). Format knowledge and code lists live in `src/config/shepherd-master.ts`; the UI displays the same read-only mapping definitions used by the parser.

## Table definition workbook

The parser reads the A5:SQL Mk-2 export format:

- `B6 = 物理テーブル名`, table name in `C6`, logical name in `C5`.
- Column section: B logical name, C physical name, D datatype, E `Not Null`/`Yes (PK)`, F SQL default, G notes.
- Index section: B index name, C comma-separated columns, E primary key, F uniqueness. Both `Yes` and `制約` indicate uniqueness.
- Constraint section: `PRIMARY KEY` and `UNIQUE` definitions are merged with the index metadata without duplicating constraints.
- The RDBMS section supplies the table collation and legacy AUTO_INCREMENT information.

The selected workbook is always the schema authority. Neither the UI examples nor the fixed extraction configuration override its columns, constraints, or defaults. Non-definition sheets in a definition workbook are ignored.

Current exports explicitly include `auto_increment` in the column datatype. Some older exports omit it and only provide a table-level AUTO_INCREMENT counter. The parser can infer the column only when exactly one integer primary-key column exists. An older export with multiple possible identity columns is rejected with an explanation; export an up-to-date definition or annotate the correct column with `auto_increment`. In particular, the older definition of `r_user_report_outputs` is ambiguous, whereas its newer export identifies `dept_output_id` explicitly.

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
| 7_権限&帳票出力先マトリクス | Row 1 headers; A login/B review name/C report pattern/D output path/E role/F warning; data starts row 2                                                                                                                    | Authority, department report outputs, user/output relationships                                                                   |

Required sheets and fixed header text are checked before records are extracted. Header comparison normalizes whitespace and full-width character variants; explanatory lines following a fixed title are permitted. Data outside the fixed column ranges is rejected. Additional sheets are reported as warnings and do not participate in conversion.

The process columns must agree positionally across the item, group, and product matrices. The supplied sample contains a mismatch at `2_3_4_8_工程項目マトリクス!U2`, `5_9_工程Gマトリクス!Q3`, and `1_6_品目構成マトリクス!Y1`: the group header has a numeric suffix that the other two headers do not. This is correctly rejected. It must be corrected in Excel rather than silently renamed or deduplicated by the converter. Making the headers agree is only the format check; duplicate names and all other record problems still block SQL afterward.

## Extraction rules

- `○`, `〇`, `◯`: required input; `□`: required and common; `●`: optional input; `■`: optional and common. Unknown symbols are errors.
- Group order values must be positive integers without duplicate positions. The preceding sorted process supplies `prev_process_id`; the final process supplies `final_process_flg`.
- Red (`FF0000`) and yellow (`FFFF00`) group cell fills encode previous-process error and warning checks. Unsupported theme colors require an explicit supported color rather than being guessed.
- Product hierarchy levels use `0`, `1____`, `_2___`, and the equivalent underscore-padded levels. The stack of preceding parent levels supplies the immediate parent; D must agree with the root product code.
- A product may occur in several BOM branches. The workbook explicitly says its first occurrence defines the product's name, part type, final check and group. Later occurrences retain their source rows; conflicting later values produce visible warnings. Duplicate relationship records remain errors under the schema's primary/unique constraints.
- Repeated option names and item names define shared parent records. Individual option items and relationships are retained for duplicate validation. Repeated user rows for different report patterns share one authority record; conflicting roles or duplicate user/output assignments are errors.
- Registration/update timestamps and other database defaults are omitted where allowed. Generated surrogate IDs are not guessed: child records hold typed references to their inserted parent records.
- Review-only fields (including user display-name notes, printer purchase notes and review progress) do not become database columns.

## Required local conversion settings

The finalized file does **not** contain the department code/name, audit user ID, effective-from date, product-management classification, or BOM quantity. Set and confirm these in the existing settings screen before conversion:

- Department code and department name.
- Existing audit user ID used for `created_by` / `updated_by`.
- Effective-from date.
- Product management: `0` for SAP or `1` for Shepherd.
- Confirmed default quantity for product structures. The workbook has no quantity column, so the application does not silently assume 1.

The reference dictionaries are local business reference data, not an editable Excel mapping engine:

- `userIdByLogin`: existing database user IDs keyed by workbook login ID. User accounts, passwords and companies are not created from this workbook.
- `unitCodeByName`: confirmed database unit codes keyed by unit label. Known legacy codes are supplied centrally, but missing labels are errors. Unit row numbers are never used as database codes.
- `reportPatternIdByName`: confirmed report-pattern IDs keyed by workbook label. Known unambiguous patterns are supplied centrally; an assembly-related label with multiple database variants requires an explicit selection.

No database connection is made to resolve these values. Their existence in the target database must be confirmed by the operator. Missing values block generation.

## Workbook reading and provenance

ExcelJS reads `.xlsx` and `.xlsm` OOXML without executing macros. All changes made to ZIP/XML representations occur in memory; the selected files are never written. Japanese text, numeric and boolean values, dates, rich text, merged cells and formula caches are supported. A mapped formula without a cache or containing an Excel error produces a validation error and requires recalculation and saving in Excel.

The supplied template contains over 600,000 array formulas, mostly cached empty strings, and dropdown validations spanning more than 30 million cells. In-memory preprocessing removes blank padding and cached-empty formula cells while retaining shared-formula anchors, nonempty values, styles used for checks and merge ranges. Excel's authoring dropdown rules and the calculation chain are not loaded or executed. ZIP entry count and expanded-size limits prevent uncontrolled expansion (10,000 entries, 256 MiB per entry, 512 MiB total).

Every normalized record retains source sheet/row, original mapped values and source-cell addresses. Validation uses the complete normalized record set and reports all issues together. Any error blocks the SQL generator even if it is called directly without the UI.

## Tests without private workbooks

`src/test/fixtures/master-workbook.ts` builds a synthetic nine-sheet workbook. Unit tests cover fixed-format rejection, partial rows, extraction, references, attributes, formula caches including 0/false, merged cells, colored marks, shared formulas and malformed archive limits. No customer workbook is committed.

Optional local acceptance tests read private workbooks from environment variables:

```powershell
$env:SHEPHERD_SCHEMA_FIXTURE = 'C:\local\table-definition.xlsx'
$env:SHEPHERD_MASTER_FIXTURE = 'C:\local\customer-master.xlsm'
npm run test -- src/services/processing/fixtures.local.test.ts src/services/processing/full-mapping.local.test.ts
```

These tests verify that source files remain byte-identical, invalid customer data cannot produce SQL, and a complete synthetic master can generate SQL against the real supplied schema.

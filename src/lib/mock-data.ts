// Mock data layer. Replace these exports with API calls when the backend is implemented.

export type Status =
  | "success"
  | "error"
  | "warning"
  | "processing"
  | "idle"
  | "disconnected"
  | "failed"
  | "validation_error";

export type Scenario = "success" | "error";

export const DEFINITION_FILE = "テーブル定義書(1).xlsx";
export const MASTER_FILE = "部門コード_Shepherd導入_マスタ整備ファイル.xlsm";

export interface HistoryRow {
  id: string;
  executedAt: string;
  file: string;
  tables: number;
  records: number;
  errors: number;
  warnings: number;
  user: string;
  status: Status;
}

export const history: HistoryRow[] = [
  { id: "20261007115500", executedAt: "2026/10/07 11:55", file: MASTER_FILE, tables: 12, records: 1582, errors: 0, warnings: 2, user: "田中 健", status: "success" },
  { id: "20261007103012", executedAt: "2026/10/07 10:30", file: MASTER_FILE, tables: 12, records: 1582, errors: 7, warnings: 2, user: "田中 健", status: "validation_error" },
  { id: "20261006171544", executedAt: "2026/10/06 17:15", file: "製造部_Shepherd導入_マスタ整備ファイル.xlsm", tables: 12, records: 964, errors: 0, warnings: 0, user: "佐藤 美咲", status: "success" },
  { id: "20261006142208", executedAt: "2026/10/06 14:22", file: "品質管理_Shepherd導入_マスタ整備ファイル.xlsm", tables: 0, records: 0, errors: 1, warnings: 0, user: "佐藤 美咲", status: "failed" },
  { id: "20261005093140", executedAt: "2026/10/05 09:31", file: "部門コード_Shepherd導入_マスタ整備ファイル_v2.xlsm", tables: 12, records: 1540, errors: 0, warnings: 5, user: "鈴木 一郎", status: "success" },
  { id: "20261007120102", executedAt: "2026/10/07 12:01", file: "試作_Shepherd導入_マスタ整備ファイル.xlsm", tables: 12, records: 210, errors: 0, warnings: 0, user: "田中 健", status: "processing" },
];

export interface FormatCheck {
  label: string;
  detail: string;
  status: "success" | "error" | "warning";
}

export const formatChecks = (s: Scenario): FormatCheck[] => [
  { label: "ファイル形式", detail: ".xlsm（マクロ有効ブック）", status: "success" },
  { label: "必須シート", detail: "12 / 12 シート検出", status: "success" },
  { label: "シート名", detail: "部門, 商品, 工程G, 工程, 品目 ほか", status: "success" },
  s === "error"
    ? { label: "ヘッダー", detail: "「工程G」シート D列ヘッダーが不一致", status: "warning" }
    : { label: "ヘッダー", detail: "全シートのヘッダー行が一致", status: "success" },
  { label: "必須セル", detail: "部門コード・部門名 入力済み", status: "success" },
  { label: "テンプレート構造", detail: "テンプレート v3.2 と一致", status: "success" },
];

export interface ParsedTable {
  name: string;
  sheet: string;
  records: number;
  pk: string;
  unique: string;
  status: Status;
}

export const parsedTables = (s: Scenario): ParsedTable[] => [
  { name: "m_departments", sheet: "部門", records: 8, pk: "department_id", unique: "department_code", status: s === "error" ? "error" : "success" },
  { name: "m_products", sheet: "商品", records: 142, pk: "product_id", unique: "product_code", status: "warning" },
  { name: "m_process_groups", sheet: "工程G", records: 36, pk: "process_group_id", unique: "department_id + process_group_name", status: s === "error" ? "error" : "success" },
  { name: "m_processes", sheet: "工程", records: 218, pk: "process_id", unique: "process_group_id + process_code", status: "success" },
  { name: "m_items", sheet: "品目", records: 864, pk: "item_id", unique: "item_code", status: "success" },
  { name: "r_product_processes", sheet: "商品工程", records: 214, pk: "id", unique: "product_id + process_id", status: "success" },
  { name: "r_item_products", sheet: "品目商品", records: 100, pk: "id", unique: "item_id + product_id", status: "success" },
];

export interface ValidationIssue {
  id: string;
  level: "error" | "warning";
  sheet: string;
  row: string;
  table: string;
  column: string;
  value: string;
  message: string;
  detail: string;
  category: "intra" | "unique" | "type" | "other";
}

const errorIssues: ValidationIssue[] = [
  { id: "e1", level: "error", sheet: "部門", row: "12, 35", table: "m_departments", column: "department_code", value: "HPK", message: "重複データ", detail: "同一の部門コードがマスタ内に複数存在します。行 12 と行 35 のいずれかを修正してください。", category: "intra" },
  { id: "e2", level: "error", sheet: "工程G", row: "8", table: "m_process_groups", column: "department_id + process_group_name", value: "HPK / 陰極前工程", message: "UNIQUE制約違反", detail: "UNIQUE INDEX uq_process_groups (department_id, process_group_name) に違反します。行 8 と行 19 が同じ組み合わせです。", category: "unique" },
  { id: "e3", level: "error", sheet: "工程G", row: "19", table: "m_process_groups", column: "department_id + process_group_name", value: "HPK / 陰極前工程", message: "UNIQUE制約違反", detail: "行 8 と重複しています。", category: "unique" },
  { id: "e4", level: "error", sheet: "工程", row: "44", table: "m_processes", column: "process_group_id", value: "（空白）", message: "NOT NULL制約違反", detail: "process_group_id は NOT NULL です。工程Gの参照先が見つかりません。", category: "other" },
  { id: "e5", level: "error", sheet: "品目", row: "102", table: "m_items", column: "item_code", value: "ITM-00012345678901234567890", message: "桁数超過", detail: "varchar(20) に対して 27 文字です。", category: "type" },
  { id: "e6", level: "error", sheet: "品目", row: "317", table: "m_items", column: "unit_price", value: "１２００円", message: "データ型不一致", detail: "decimal(10,2) に変換できません。半角数字で入力してください。", category: "type" },
  { id: "e7", level: "error", sheet: "商品", row: "88", table: "m_products", column: "department_code", value: "HPX", message: "参照先なし", detail: "部門コード HPX は「部門」シートに存在しません。", category: "other" },
];

const warningIssues: ValidationIssue[] = [
  { id: "w1", level: "warning", sheet: "商品", row: "25", table: "m_products", column: "product_name", value: "ABC", message: "文字列の確認が必要", detail: "商品名が英字3文字のみです。略称でないか確認してください。", category: "other" },
  { id: "w2", level: "warning", sheet: "商品", row: "61", table: "m_products", column: "product_name", value: "ｶｿｰﾄﾞA", message: "半角カナを含む", detail: "全角カナへの変換を推奨します。", category: "other" },
];

export const validationIssues = (s: Scenario) =>
  s === "error" ? [...errorIssues, ...warningIssues] : warningIssues;

export const validationSummary = (s: Scenario) => ({
  total: 1582,
  ok: s === "error" ? 1573 : 1580,
  errors: s === "error" ? 7 : 0,
  warnings: 2,
});

export interface ColumnDef {
  name: string;
  logical: string;
  type: string;
  nullable: boolean;
  pk?: boolean;
  unique?: boolean;
  def?: string;
  ai?: boolean;
}

export interface TableDef {
  name: string;
  logical: string;
  columns: ColumnDef[];
  indexes: { type: "PRIMARY KEY" | "UNIQUE" | "INDEX"; name: string; columns: string[] }[];
}

const common: ColumnDef[] = [
  { name: "edit_ctrl_kbn", logical: "編集制御区分", type: "char(1)", nullable: false, def: "'0'" },
  { name: "invalid_flg", logical: "無効フラグ", type: "bit(1)", nullable: false, def: "b'0'" },
  { name: "created_at", logical: "作成日時", type: "datetime", nullable: false, def: "CURRENT_TIMESTAMP" },
];

export const tableDefs: TableDef[] = [
  {
    name: "m_departments", logical: "部門マスタ",
    columns: [
      { name: "department_id", logical: "部門ID", type: "int", nullable: false, pk: true, ai: true },
      { name: "department_code", logical: "部門コード", type: "varchar(255)", nullable: false, unique: true },
      { name: "department_name", logical: "部門名", type: "varchar(255)", nullable: false },
      ...common,
    ],
    indexes: [
      { type: "PRIMARY KEY", name: "PRIMARY", columns: ["department_id"] },
      { type: "UNIQUE", name: "uq_departments_code", columns: ["department_code"] },
    ],
  },
  {
    name: "m_products", logical: "商品マスタ",
    columns: [
      { name: "product_id", logical: "商品ID", type: "int", nullable: false, pk: true, ai: true },
      { name: "department_id", logical: "部門ID", type: "int", nullable: false },
      { name: "product_code", logical: "商品コード", type: "varchar(50)", nullable: false, unique: true },
      { name: "product_name", logical: "商品名", type: "varchar(255)", nullable: false },
      { name: "sort_no", logical: "表示順", type: "int", nullable: true, def: "0" },
      ...common,
    ],
    indexes: [
      { type: "PRIMARY KEY", name: "PRIMARY", columns: ["product_id"] },
      { type: "UNIQUE", name: "uq_products_code", columns: ["product_code"] },
      { type: "INDEX", name: "idx_products_department", columns: ["department_id"] },
    ],
  },
  {
    name: "m_process_groups", logical: "工程グループマスタ",
    columns: [
      { name: "process_group_id", logical: "工程グループID", type: "int", nullable: false, pk: true, ai: true },
      { name: "department_id", logical: "部門ID", type: "int", nullable: false, unique: true },
      { name: "process_group_name", logical: "工程グループ名", type: "varchar(255)", nullable: false, unique: true },
      ...common,
    ],
    indexes: [
      { type: "PRIMARY KEY", name: "PRIMARY", columns: ["process_group_id"] },
      { type: "UNIQUE", name: "uq_process_groups", columns: ["department_id", "process_group_name"] },
    ],
  },
  {
    name: "m_processes", logical: "工程マスタ",
    columns: [
      { name: "process_id", logical: "工程ID", type: "int", nullable: false, pk: true, ai: true },
      { name: "process_group_id", logical: "工程グループID", type: "int", nullable: false, unique: true },
      { name: "process_code", logical: "工程コード", type: "varchar(50)", nullable: false, unique: true },
      { name: "process_name", logical: "工程名", type: "varchar(255)", nullable: false },
      ...common,
    ],
    indexes: [
      { type: "PRIMARY KEY", name: "PRIMARY", columns: ["process_id"] },
      { type: "UNIQUE", name: "uq_processes", columns: ["process_group_id", "process_code"] },
    ],
  },
  {
    name: "m_items", logical: "品目マスタ",
    columns: [
      { name: "item_id", logical: "品目ID", type: "int", nullable: false, pk: true, ai: true },
      { name: "item_code", logical: "品目コード", type: "varchar(20)", nullable: false, unique: true },
      { name: "item_name", logical: "品目名", type: "varchar(255)", nullable: false },
      { name: "unit_price", logical: "単価", type: "decimal(10,2)", nullable: true },
      ...common,
    ],
    indexes: [
      { type: "PRIMARY KEY", name: "PRIMARY", columns: ["item_id"] },
      { type: "UNIQUE", name: "uq_items_code", columns: ["item_code"] },
    ],
  },
];

export interface Mapping { excel: string; column: string; note?: string }
export interface SheetMapping { sheet: string; table: string; mappings: Mapping[] }

export const sheetMappings: SheetMapping[] = [
  { sheet: "部門", table: "m_departments", mappings: [
    { excel: "部門コード", column: "department_code" },
    { excel: "部門名", column: "department_name" },
    { excel: "編集制御", column: "edit_ctrl_kbn", note: "既定値 '0'" },
    { excel: "無効", column: "invalid_flg", note: "○ → b'1'" },
  ]},
  { sheet: "商品", table: "m_products", mappings: [
    { excel: "部門コード", column: "department_id", note: "m_departments 参照" },
    { excel: "商品コード", column: "product_code" },
    { excel: "商品名", column: "product_name" },
    { excel: "表示順", column: "sort_no" },
  ]},
  { sheet: "工程G", table: "m_process_groups", mappings: [
    { excel: "部門コード", column: "department_id", note: "m_departments 参照" },
    { excel: "工程グループ名", column: "process_group_name" },
  ]},
  { sheet: "工程", table: "m_processes", mappings: [
    { excel: "工程グループ名", column: "process_group_id", note: "m_process_groups 参照" },
    { excel: "工程コード", column: "process_code" },
    { excel: "工程名", column: "process_name" },
  ]},
  { sheet: "品目", table: "m_items", mappings: [
    { excel: "品目コード", column: "item_code" },
    { excel: "品目名", column: "item_name" },
    { excel: "単価", column: "unit_price" },
  ]},
];

export const recordPreview = [
  { row: 5, department_code: "HPK", department_name: "HPK部門", edit_ctrl_kbn: "0", invalid_flg: "0" },
  { row: 6, department_code: "CTD", department_name: "陰極部門", edit_ctrl_kbn: "0", invalid_flg: "0" },
  { row: 7, department_code: "ANO", department_name: "陽極部門", edit_ctrl_kbn: "0", invalid_flg: "0" },
  { row: 8, department_code: "ASM", department_name: "組立部門", edit_ctrl_kbn: "0", invalid_flg: "0" },
  { row: 9, department_code: "QAS", department_name: "品質保証部門", edit_ctrl_kbn: "1", invalid_flg: "0" },
];

export const relations = [
  { from: "m_products.department_id", to: "m_departments.department_id", resolved: 142 },
  { from: "m_process_groups.department_id", to: "m_departments.department_id", resolved: 36 },
  { from: "m_processes.process_group_id", to: "m_process_groups.process_group_id", resolved: 218 },
  { from: "r_product_processes.product_id", to: "m_products.product_id", resolved: 214 },
];

const header = (t: string) => `-- =====================================\n-- ${t}\n-- =====================================`;

export const sqlSections: { table: string; logical: string; count: number; sql: string }[] = [
  { table: "m_departments", logical: "部門マスタ", count: 8, sql: `${header("Department Master")}

INSERT INTO m_departments (
  department_code,
  department_name,
  edit_ctrl_kbn,
  invalid_flg
)
VALUES
  ('HPK', 'HPK部門', '0', b'0'),
  ('CTD', '陰極部門', '0', b'0'),
  ('ANO', '陽極部門', '0', b'0'),
  ('ASM', '組立部門', '0', b'0');` },
  { table: "m_products", logical: "商品マスタ", count: 142, sql: `${header("Product Master")}

INSERT INTO m_products (
  department_id,
  product_code,
  product_name,
  sort_no
)
VALUES
  ((SELECT department_id FROM m_departments WHERE department_code = 'HPK'), 'P-0001', 'カソードA', 1),
  ((SELECT department_id FROM m_departments WHERE department_code = 'HPK'), 'P-0002', 'カソードB', 2);` },
  { table: "m_process_groups", logical: "工程グループマスタ", count: 36, sql: `${header("Process Group Master")}

INSERT INTO m_process_groups (
  department_id,
  process_group_name
)
VALUES
  ((SELECT department_id FROM m_departments WHERE department_code = 'HPK'), '陰極前工程'),
  ((SELECT department_id FROM m_departments WHERE department_code = 'HPK'), '陰極後工程');` },
  { table: "m_processes", logical: "工程マスタ", count: 218, sql: `${header("Process Master")}

INSERT INTO m_processes (
  process_group_id,
  process_code,
  process_name
)
VALUES
  (1, 'PR-010', '混練'),
  (1, 'PR-020', '塗工'),
  (2, 'PR-030', 'プレス');` },
  { table: "m_items", logical: "品目マスタ", count: 864, sql: `${header("Item Master")}

INSERT INTO m_items (
  item_code,
  item_name,
  unit_price
)
VALUES
  ('ITM-0001', '正極材 NMC811', 1200.00),
  ('ITM-0002', '負極材 黒鉛', 680.00);` },
];

export const fullSql = () =>
  ["START TRANSACTION;", ...sqlSections.map((s) => s.sql), "COMMIT;"].join("\n\n");

export const generatedFiles = [
  { name: "insert_20261007_115500.sql", size: "412 KB" },
  { name: "validation_report.xlsx", size: "38 KB" },
  { name: "validation_report.json", size: "21 KB" },
  { name: "master_snapshot.json", size: "1.2 MB" },
];

/* ---------- Adapters to the shared contracts (src/models) ---------- */
import type {
  FormatCheckResult,
  ParsedTableSummary,
  SqlGenerationResult,
  TableDefinition,
  ValidationItem,
  ValidationResult,
} from "@/models";

export const mockFormatCheck = (s: Scenario): FormatCheckResult => {
  const items = formatChecks(s).map((c) => ({ ...c, status: c.status === "success" ? ("ok" as const) : c.status }));
  return { passed: !items.some((i) => i.status === "error"), items };
};

export const mockParsedTables = (s: Scenario): ParsedTableSummary[] =>
  parsedTables(s).map((t) => ({ ...t, status: t.status === "success" ? "ok" : t.status === "error" ? "error" : "warning" }));

const categoryLabel: Record<ValidationIssue["category"], string> = {
  intra: "マスタ内重複",
  unique: "UNIQUE制約",
  type: "データ型",
  other: "その他",
};

export const mockValidationResult = (s: Scenario): ValidationResult => {
  const sum = validationSummary(s);
  const items: ValidationItem[] = validationIssues(s).map((i) => {
    const rows = i.row.split(",").map((r) => Number(r.trim())).filter((n) => !Number.isNaN(n));
    return {
      severity: i.level,
      category: categoryLabel[i.category],
      sourceSheet: i.sheet,
      ...(rows[0] != null ? { sourceRow: rows[0] } : {}),
      ...(rows.length > 1 ? { relatedRows: rows.slice(1) } : {}),
      table: i.table,
      column: i.column,
      value: i.value,
      message: i.message,
      detail: i.detail,
    };
  });
  return { totalRecords: sum.total, okCount: sum.ok, errorCount: sum.errors, warningCount: sum.warnings, items, dbComparison: "unchecked" };
};

export const mockSqlResult = (): SqlGenerationResult => ({
  generatedSql: fullSql(),
  targetDb: "shepherd_prod (MySQL 8.0)",
  generatedAt: "2026/10/07 11:55:00",
});

export const mockTableDefinitions: TableDefinition[] = tableDefs;

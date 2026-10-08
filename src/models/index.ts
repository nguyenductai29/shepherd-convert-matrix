// Shared contracts for local Excel processing and the existing UI.

/* ---------- Files ---------- */
export type ConversionFileKind =
  "tableDefinition" | "departmentReference" | "kbnDefinition" | "master";
export type FileKind = ConversionFileKind;

export interface SelectedFile {
  kind: FileKind;
  name: string;
  /** Absolute local path. null when running in the browser preview (paths are not exposed). */
  path: string | null;
  extension: string;
  /** Bytes, when available. */
  size: number | null;
  modifiedAt?: string | null;
}

/* ---------- Workflow ---------- */
export type ConversionStatus =
  | "idle"
  | "file-selected"
  | "checking-format"
  | "parsing"
  | "validating"
  | "validation-error"
  | "ready-to-generate"
  | "generating"
  | "completed"
  | "failed";

/* ---------- Format check ---------- */
export type CheckStatus = "ok" | "warning" | "error";

export interface FormatCheckItem {
  label: string;
  detail: string;
  status: CheckStatus;
}

export interface FormatCheckResult {
  passed: boolean;
  items: FormatCheckItem[];
}

/* ---------- Table definition ---------- */
export interface ColumnDefinition {
  name: string;
  logical: string;
  type: string;
  nullable: boolean;
  pk?: boolean;
  unique?: boolean;
  def?: string;
  ai?: boolean;
  length?: number;
  scale?: number;
  unsigned?: boolean;
  collation?: string;
}

export interface IndexDefinition {
  type: "PRIMARY KEY" | "UNIQUE" | "INDEX";
  name: string;
  columns: string[];
}

export interface TableDefinition {
  name: string;
  logical: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
}

export interface TableDefinitionLoadResult {
  file: SelectedFile;
  tables: TableDefinition[];
}

/* ---------- Parsed master ---------- */
export interface ParsedTableSummary {
  name: string;
  sheet: string;
  records: number;
  pk: string;
  unique: string;
  status: "ok" | "warning" | "error";
}

export interface MasterParseResult {
  file: SelectedFile;
  tables: ParsedTableSummary[];
  totalRecords: number;
  data: MasterRecord[];
  issues?: ValidationItem[];
}

/* ---------- Validation ---------- */
export type Severity = "error" | "warning" | "ok";

export type ValidationItem = {
  severity: Severity;
  category: string;
  sourceSheet?: string;
  sourceRow?: number;
  /** Other rows involved (e.g. duplicates). */
  relatedRows?: number[];
  table?: string;
  column?: string;
  value?: unknown;
  message: string;
  detail?: string;
};

export interface ValidationResult {
  totalRecords: number;
  okCount: number;
  errorCount: number;
  warningCount: number;
  items: ValidationItem[];
  /** "unchecked" until DB comparison exists. */
  dbComparison: "unchecked" | "ok" | "error";
}

/* ---------- SQL ---------- */
export interface SqlGenerationResult {
  generatedSql: string;
  targetDb: string;
  generatedAt: string;
}

export type ScalarValue = string | number | boolean | null;

/** Reference to an inserted parent record, resolved without assuming database IDs. */
export interface RecordReference {
  kind: "reference";
  recordId: string;
  column: string;
}

export interface MasterRecord {
  id: string;
  entity: string;
  targetTable: string;
  sourceSheet: string;
  sourceRow: number;
  values: Record<string, ScalarValue | RecordReference>;
  originalValues: Record<string, unknown>;
  sourceCells?: Record<string, string>;
}

export interface SqlOptions {
  sqlTransaction: boolean;
  sqlComments: boolean;
}

export type Status =
  | "success"
  | "error"
  | "warning"
  | "processing"
  | "idle"
  | "disconnected"
  | "failed"
  | "validation_error";

export interface SheetMapping {
  sheet: string;
  table: string;
  mappings: { excel: string; column: string; note?: string }[];
}

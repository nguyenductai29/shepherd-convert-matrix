// Shared data contracts between the UI and the (future) processing services.
// Real implementations must return exactly these shapes.

/* ---------- Files ---------- */
export type FileKind = "tableDefinition" | "master";

export interface SelectedFile {
  kind: FileKind;
  name: string;
  /** Absolute local path. null when running in the browser preview (paths are not exposed). */
  path: string | null;
  extension: string;
  /** Bytes, when available. */
  size: number | null;
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
  /** Raw parsed rows per table — shape decided by the real parser. */
  data: unknown;
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

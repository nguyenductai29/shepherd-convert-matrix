// Processing contracts. Replace the placeholder implementations in ./placeholder.ts
// with real ones (Excel parsing, validation, SQL generation) without touching the UI.
import type {
  FormatCheckResult,
  MasterParseResult,
  SelectedFile,
  SqlGenerationResult,
  TableDefinitionLoadResult,
  ValidationResult,
} from "@/models";

export interface TableDefinitionService {
  load(file: SelectedFile): Promise<TableDefinitionLoadResult>;
}

export interface FormatCheckService {
  check(master: SelectedFile): Promise<FormatCheckResult>;
}

export interface MasterParserService {
  parse(master: SelectedFile, definition: TableDefinitionLoadResult): Promise<MasterParseResult>;
}

export interface ValidationService {
  validate(parsed: MasterParseResult, definition: TableDefinitionLoadResult): Promise<ValidationResult>;
}

export interface SqlGeneratorService {
  generate(parsed: MasterParseResult, definition: TableDefinitionLoadResult): Promise<SqlGenerationResult>;
}

export interface ProcessingServices {
  tableDefinition: TableDefinitionService;
  formatCheck: FormatCheckService;
  masterParser: MasterParserService;
  validation: ValidationService;
  sqlGenerator: SqlGeneratorService;
}

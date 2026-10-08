// Async boundary between worker processing and the UI orchestration.
import type { ConversionOptions } from "@/config/shepherd-master";
import type { KbnDefinition } from "@/models/kbn";
import type {
  DepartmentReferenceLoadResult,
  SerializableConversionContext,
} from "@/models/references";
import type {
  FormatCheckResult,
  MasterParseResult,
  SelectedFile,
  SqlGenerationResult,
  TableDefinitionLoadResult,
  ValidationResult,
  SqlOptions,
} from "@/models";

export interface TableDefinitionService {
  load(file: SelectedFile): Promise<TableDefinitionLoadResult>;
}

export interface FormatCheckService {
  check(master: SelectedFile): Promise<FormatCheckResult>;
}

export interface MasterParserService {
  parse(
    master: SelectedFile,
    definition: TableDefinitionLoadResult,
    options: ConversionOptions,
    context?: SerializableConversionContext,
  ): Promise<MasterParseResult>;
}

export interface ValidationService {
  validate(
    parsed: MasterParseResult,
    definition: TableDefinitionLoadResult,
  ): Promise<ValidationResult>;
}

export interface SqlGeneratorService {
  generate(
    parsed: MasterParseResult,
    definition: TableDefinitionLoadResult,
    options: SqlOptions,
  ): Promise<SqlGenerationResult>;
}

export interface ProcessingServices {
  departmentReference: { load(file: SelectedFile): Promise<DepartmentReferenceLoadResult> };
  kbnDefinition: { load(file: SelectedFile): Promise<KbnDefinition[]> };
  tableDefinition: TableDefinitionService;
  formatCheck: FormatCheckService;
  masterParser: MasterParserService;
  validation: ValidationService;
  sqlGenerator: SqlGeneratorService;
}

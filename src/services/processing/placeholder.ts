// PLACEHOLDER implementations — return mock data only. No Excel parsing, validation rules
// or SQL generation happens here. Replace each object with a real implementation later.
import {
  mockFormatCheck,
  mockParsedTables,
  mockSqlResult,
  mockTableDefinitions,
  mockValidationResult,
  type Scenario,
} from "@/lib/mock-data";
import type { ProcessingServices } from "./interfaces";

/** Demo switch used by the placeholders (正常 / エラー シナリオ). */
export const mockConfig: { scenario: Scenario; delayMs: number } = { scenario: "success", delayMs: 600 };

const wait = () => new Promise((r) => setTimeout(r, mockConfig.delayMs));

export const placeholderServices: ProcessingServices = {
  tableDefinition: {
    async load(file) {
      await wait();
      return { file, tables: mockTableDefinitions };
    },
  },
  formatCheck: {
    async check() {
      await wait();
      return mockFormatCheck(mockConfig.scenario);
    },
  },
  masterParser: {
    async parse(file) {
      await wait();
      const tables = mockParsedTables(mockConfig.scenario);
      return { file, tables, totalRecords: tables.reduce((a, t) => a + t.records, 0), data: null };
    },
  },
  validation: {
    async validate() {
      await wait();
      return mockValidationResult(mockConfig.scenario);
    },
  },
  sqlGenerator: {
    async generate() {
      await wait();
      return mockSqlResult();
    },
  },
};

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateConversion, runAnalysis, runGeneration, saveConversion } from "./run-conversion";
import { initialConversion } from "@/state/app-state";
import { defaultSettings } from "@/services/platform/local-settings";
import type { ConversionState } from "@/state/app-state";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  check: vi.fn(),
  parse: vi.fn(),
  validate: vi.fn(),
  generate: vi.fn(),
  history: vi.fn(),
  getHistory: vi.fn(),
  artifacts: vi.fn(),
}));
vi.mock("@/services", () => ({
  services: {
    tableDefinition: { load: mocks.load },
    formatCheck: { check: mocks.check },
    masterParser: { parse: mocks.parse },
    validation: { validate: mocks.validate },
    sqlGenerator: { generate: mocks.generate },
  },
}));
vi.mock("@/services/platform/history", () => ({
  saveHistory: mocks.history,
  getHistory: mocks.getHistory,
}));
vi.mock("@/services/platform/logging", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/platform/files", () => ({
  saveConversionArtifacts: mocks.artifacts,
  fileFromPath: vi.fn(),
}));
const file = {
  kind: "master" as const,
  name: "test.xlsm",
  path: null,
  extension: ".xlsm",
  size: 1,
};
describe("conversion error gates", () => {
  const validState = (): ConversionState => ({
    ...initialConversion,
    historyId: "run",
    masterFile: file,
    tableDefinitionFile: { ...file, kind: "tableDefinition" },
    conversionStatus: "ready-to-generate",
    tableDefinition: { file: { ...file, kind: "tableDefinition" }, tables: [] },
    parsedData: { file, tables: [], data: [], totalRecords: 1 },
    formatCheckResult: { passed: true, items: [] },
    validationResult: {
      totalRecords: 1,
      okCount: 1,
      errorCount: 0,
      warningCount: 0,
      items: [],
      dbComparison: "unchecked",
    },
  });
  it("records generation failures against the original run", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("worker failed"));
    mocks.getHistory.mockResolvedValueOnce({ executedAt: "2026-10-08T00:00:00Z" });
    const patch = vi.fn();
    expect(await runGeneration(validState(), patch, defaultSettings)).toBe(false);
    expect(mocks.history).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run", status: "failed", executedAt: "2026-10-08T00:00:00Z" }),
    );
    expect(patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ generatedSql: null, errorMessage: "SQL生成に失敗しました。" }),
    );
  });
  it("exports reports without deployable SQL when validation failed", async () => {
    const state = validState();
    state.validationResult!.errorCount = 1;
    state.conversionStatus = "validation-error";
    mocks.artifacts.mockResolvedValueOnce({
      directory: "C:/reports/run",
      sqlPath: null,
      files: ["validation_report.xlsx"],
    });
    expect(await saveConversion(state, vi.fn(), defaultSettings, true)).not.toBeNull();
    expect(mocks.artifacts).toHaveBeenCalledWith(expect.objectContaining({ sql: null }));
    expect(mocks.history).toHaveBeenCalledWith(
      expect.objectContaining({ status: "validation_error", generatedSqlPath: null }),
    );
  });
  it("discards a pending analysis when inputs or settings change", async () => {
    let resolve!: (value: unknown) => void;
    mocks.check.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const state: ConversionState = {
      ...initialConversion,
      masterFile: file,
      tableDefinitionFile: { ...file, kind: "tableDefinition" },
      tableDefinition: { file: { ...file, kind: "tableDefinition" }, tables: [] },
    };
    const patch = vi.fn();
    const run = runAnalysis(state, patch, defaultSettings);
    await Promise.resolve();
    invalidateConversion();
    patch.mockClear();
    resolve({ passed: true, items: [] });
    await run;
    expect(patch).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.history.mockResolvedValue(undefined);
  });
  it("does not parse or generate when workbook format fails", async () => {
    let state: ConversionState = {
      ...initialConversion,
      masterFile: file,
      tableDefinitionFile: { ...file, kind: "tableDefinition" },
    };
    mocks.load.mockResolvedValue({ file: state.tableDefinitionFile, tables: [] });
    mocks.check.mockResolvedValue({
      passed: false,
      items: [{ label: "必須シート", status: "error", detail: "missing" }],
    });
    await runAnalysis(
      state,
      (p) => {
        state = { ...state, ...p };
      },
      defaultSettings,
    );
    expect(state.generatedSql).toBeNull();
    expect(state.conversionStatus).toBe("failed");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("blocks generation even when a stale ready status has validation errors", async () => {
    const state: ConversionState = {
      ...initialConversion,
      conversionStatus: "ready-to-generate",
      parsedData: { file, tables: [], totalRecords: 1, data: [] },
      tableDefinition: { file: { ...file, kind: "tableDefinition" }, tables: [] },
      validationResult: {
        totalRecords: 1,
        okCount: 0,
        errorCount: 1,
        warningCount: 0,
        items: [],
        dbComparison: "unchecked",
      },
    };
    await runGeneration(state, vi.fn(), defaultSettings);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

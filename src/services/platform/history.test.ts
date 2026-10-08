import { beforeEach, describe, expect, it } from "vitest";
import { getHistory, listHistory, saveHistory, type HistoryEntry } from "./history";

const entry: HistoryEntry = {
  id: "run-1",
  executedAt: "2026-10-08T10:00:00Z",
  file: "部門.xlsm",
  tables: 2,
  records: 7,
  errors: 0,
  warnings: 1,
  user: "ローカル",
  status: "success",
  masterFilepath: null,
  tableDefinitionFilename: "テーブル定義.xlsx",
  generatedSqlPath: null,
  outputDirectory: null,
  outputFiles: [],
};

describe("local history persistence", () => {
  beforeEach(() => localStorage.clear());

  it("persists a conversion and updates its output without creating a duplicate", async () => {
    await saveHistory(entry);
    expect(await getHistory(entry.id)).toEqual(entry);
    await saveHistory({ ...entry, generatedSqlPath: "C:\\出力\\insert.sql" });
    expect(await listHistory()).toHaveLength(1);
    expect((await getHistory(entry.id))?.generatedSqlPath).toBe("C:\\出力\\insert.sql");
  });

  it("orders most recent runs first and retains validation errors", async () => {
    await saveHistory(entry);
    await saveHistory({
      ...entry,
      id: "run-2",
      executedAt: "2026-10-08T11:00:00Z",
      status: "validation_error",
      errors: 4,
    });
    expect((await listHistory()).map((row) => row.id)).toEqual(["run-2", "run-1"]);
    expect((await getHistory("run-2"))?.errors).toBe(4);
    expect(await getHistory("missing")).toBeNull();
  });

  it("preserves simultaneous saves", async () => {
    await Promise.all([saveHistory(entry), saveHistory({ ...entry, id: "run-2" })]);
    expect(await listHistory()).toHaveLength(2);
  });
});

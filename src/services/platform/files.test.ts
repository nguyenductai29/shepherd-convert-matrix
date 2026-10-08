import { describe, expect, it } from "vitest";
import { fromBrowserFile, readSelectedFile, saveConversionArtifacts } from "./files";

describe("local file handling", () => {
  it("retains browser workbook bytes and Japanese filename without network access", async () => {
    const file = new File([new Uint8Array([80, 75, 3, 4])], "部門.xlsm", {
      lastModified: 172800000,
    });
    const selected = fromBrowserFile("master", file);
    expect(selected.modifiedAt).toBe(new Date(file.lastModified).toISOString());
    expect(selected.path).toBeNull();
    expect(new Uint8Array(await readSelectedFile(selected))).toEqual(
      new Uint8Array([80, 75, 3, 4]),
    );
  });

  it("refuses to export deployable SQL with validation errors", async () => {
    await expect(
      saveConversionArtifacts({
        sql: "INSERT INTO x VALUES (1);",
        validation: {
          totalRecords: 1,
          okCount: 0,
          errorCount: 1,
          warningCount: 0,
          items: [],
          dbComparison: "unchecked",
        },
        snapshot: [],
      }),
    ).rejects.toThrow("SQL");
  });
});

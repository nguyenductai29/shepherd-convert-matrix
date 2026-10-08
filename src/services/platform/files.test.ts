import { describe, expect, it } from "vitest";
import { fromBrowserFile, isAllowed, readSelectedFile, saveConversionArtifacts } from "./files";

describe("local file handling", () => {
  it("accepts only xlsx department reference workbooks", async () => {
    const selected = fromBrowserFile(
      "departmentReference",
      new File(["reference"], "ShepherdDB.m_departments.xlsx"),
    );
    expect(isAllowed("departmentReference", selected.name)).toBe(true);
    expect(isAllowed("departmentReference", "departments.xlsm")).toBe(false);
    expect(new TextDecoder().decode(await readSelectedFile(selected))).toBe("reference");
  });
  it("reads only XLSX KBN sources and rejects legacy JSON before reading", async () => {
    const selected = fromBrowserFile("kbnDefinition", new File(["workbook"], "区分.XLSX"));
    expect(new TextDecoder().decode(await readSelectedFile(selected))).toBe("workbook");
    expect(isAllowed("kbnDefinition", "区分.json")).toBe(false);
    expect(isAllowed("kbnDefinition", "区分.xlsm")).toBe(false);
    await expect(
      readSelectedFile(fromBrowserFile("kbnDefinition", new File(["[]"], "区分.json"))),
    ).rejects.toThrow("対応していない");
    expect(isAllowed("master", "区分.json")).toBe(false);
    expect(isAllowed("tableDefinition", "区分.json")).toBe(false);
  });
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

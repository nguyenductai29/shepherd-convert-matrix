// Optional private acceptance fixtures. Workbook contents are never checked in.
// Set SHEPHERD_SCHEMA_FIXTURE / SHEPHERD_MASTER_FIXTURE to local absolute paths.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "./workbook";
import { parseTableDefinition } from "./table-definition";
import { parseMaster, validateMasterFormat } from "./master-parser";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";

const schemaPath = process.env["SHEPHERD_SCHEMA_FIXTURE"];
const masterPath = process.env["SHEPHERD_MASTER_FIXTURE"];
describe.skipIf(!schemaPath || !masterPath)("private local workbook acceptance", () => {
  it("reads the complete schema and customer format without modifying their files", async () => {
    const schemaBytes = await readFile(schemaPath!);
    const masterBytes = await readFile(masterPath!);
    const schema = await readWorkbook(
      schemaBytes.buffer.slice(
        schemaBytes.byteOffset,
        schemaBytes.byteOffset + schemaBytes.byteLength,
      ) as ArrayBuffer,
    );
    const master = await readWorkbook(
      masterBytes.buffer.slice(
        masterBytes.byteOffset,
        masterBytes.byteOffset + masterBytes.byteLength,
      ) as ArrayBuffer,
    );
    const tables = parseTableDefinition(schema);
    expect(tables.length).toBeGreaterThan(10);
    expect(
      tables
        .find((table) => table.name === "m_departments")
        ?.columns.some((column) => column.name === "department_code"),
    ).toBe(true);
    const result = validateMasterFormat(master, masterPath!);
    // A customer workbook with inconsistent headings must be rejected before parsing.
    const parsed = parseMaster(
      master,
      {
        kind: "master",
        name: masterPath!,
        path: masterPath!,
        extension: "xlsm",
        size: masterBytes.byteLength,
      },
      tables,
    );
    if (!result.passed) {
      expect(parsed.data).toHaveLength(0);
      expect(parsed.issues?.every((issue) => issue.category === "format")).toBe(true);
    } else expect(parsed.issues?.some((issue) => issue.sourceSheet === "変換設定")).toBe(true);
    const loadedDefinition = {
      file: { ...parsed.file, kind: "tableDefinition" as const, name: schemaPath! },
      tables,
    };
    expect(validateMaster(parsed, loadedDefinition).errorCount).toBeGreaterThan(0);
    expect(() =>
      generateSql(parsed, loadedDefinition, { sqlTransaction: true, sqlComments: true }),
    ).toThrow();
    expect((await readFile(schemaPath!)).equals(schemaBytes)).toBe(true);
    expect((await readFile(masterPath!)).equals(masterBytes)).toBe(true);
  }, 30000);
});

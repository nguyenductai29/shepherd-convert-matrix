// Optional private acceptance fixtures. Workbook contents are never checked in.
// Set SHEPHERD_SCHEMA_FIXTURE / SHEPHERD_MASTER_FIXTURE to local absolute paths.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "./workbook";
import { parseTableDefinition } from "./table-definition";
import { parseMaster, validateMasterFormat } from "./master-parser";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";
import { parseKbnReferenceWorkbook } from "./kbn-reference";
import { localDate } from "./conversion-defaults";
import { masterFixtureOptions } from "@/test/fixtures/master-workbook";
import { parseDepartmentReferenceWorkbook, resolveDepartment } from "./department-reference";

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
    const result = validateMasterFormat(master, "35_Shepherd導入_マスタ整備ファイル.xlsm");
    expect(result.items.filter((item) => item.status === "error")).toEqual([]);
    expect(result.passed).toBe(true);
    // The valid customer format passes; unresolved common inputs stop at preflight.
    const parsed = parseMaster(
      master,
      {
        kind: "master",
        name: "35_Shepherd導入_マスタ整備ファイル.xlsm",
        path: masterPath!,
        extension: "xlsm",
        size: masterBytes.byteLength,
      },
      tables,
    );
    expect(parsed.data).toHaveLength(0);
    expect(parsed.issues?.some((issue) => issue.sourceSheet === "変換設定")).toBe(true);
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

  it.skipIf(!process.env["SHEPHERD_KBN_FIXTURE"])(
    "applies confirmed defaults with the real KBN source and keeps genuinely missing mappings visible",
    async () => {
      const loadWorkbook = async (path: string) => {
        const bytes = await readFile(path);
        return readWorkbook(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        );
      };
      const tables = parseTableDefinition(await loadWorkbook(schemaPath!));
      const kbnPath = process.env["SHEPHERD_KBN_FIXTURE"]!;
      const kbnBytes = await readFile(kbnPath);
      const definitions = parseKbnReferenceWorkbook(
        await readWorkbook(new Uint8Array(kbnBytes).buffer),
      );
      const departmentPath = process.env["SHEPHERD_DEPARTMENT_FIXTURE"];
      const departmentBytes = departmentPath ? await readFile(departmentPath) : null;
      const departmentReferences = departmentBytes
        ? parseDepartmentReferenceWorkbook(
            await readWorkbook(new Uint8Array(departmentBytes).buffer),
          )
        : masterFixtureOptions.departmentReferences;
      const expectedDepartmentId = resolveDepartment("35", departmentReferences).departmentId;
      const file = {
        kind: "master" as const,
        name: "35_Shepherd導入_マスタ整備ファイル.xlsm",
        path: masterPath!,
        extension: "xlsm",
        size: null,
      };
      const parsed = parseMaster(await loadWorkbook(masterPath!), file, tables, {
        ...masterFixtureOptions,
        departmentReferences,
        kbnDefinitions: definitions,
      });
      expect(parsed.data.length).toBeGreaterThan(0);
      expect(
        parsed.data.some((record) =>
          ["m_departments", "r_authority", "r_user_report_outputs"].includes(record.targetTable),
        ),
      ).toBe(false);
      const today = localDate();
      for (const record of parsed.data) {
        const columns = new Set(
          tables
            .find((table) => table.name === record.targetTable)
            ?.columns.map((column) => column.name),
        );
        for (const [key, value] of Object.entries({
          created_by: 1,
          updated_by: 1,
          effective_from: today,
          effective_to: "9999-12-31",
        })) {
          if (columns.has(key)) expect(record.values[key]).toBe(value);
          else expect(record.values).not.toHaveProperty(key);
        }
        if (record.targetTable === "m_products")
          expect(record.values["product_management_kbn"]).toBe("1");
        if (columns.has("department_id"))
          expect(record.values["department_id"]).toBe(expectedDepartmentId);
      }
      expect(parsed.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            column: "unit_kbn",
            value: "%",
            message: expect.stringContaining("KBN_UNIT"),
          }),
          expect.objectContaining({
            column: "report_pattern_id",
            value: "部材割当系",
            message: expect.stringContaining("KBN_PRINT_PATTERN"),
          }),
        ]),
      );
      const checked = validateMaster(parsed, { file, tables });
      expect(
        checked.items.filter((issue) =>
          [
            "created_by",
            "updated_by",
            "effective_from",
            "effective_to",
            "product_management_kbn",
          ].includes(issue.column ?? ""),
        ),
      ).toEqual([]);
      if (departmentPath && departmentBytes)
        expect((await readFile(departmentPath)).equals(departmentBytes)).toBe(true);
      expect((await readFile(kbnPath)).equals(kbnBytes)).toBe(true);
    },
    30000,
  );
});

// Optional private acceptance fixtures. Workbook contents are never checked in.
// Set SHEPHERD_SCHEMA_FIXTURE / SHEPHERD_MASTER_FIXTURE to local absolute paths.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "./workbook";
import { parseTableDefinition } from "./table-definition";
import { parseMaster, validateMasterFormat } from "./master-parser";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";
import { parseKbnDefinitions } from "./kbn-resolver";
import { localDate } from "./conversion-defaults";
import { masterFixtureOptions } from "@/test/fixtures/master-workbook";

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
    expect(result.items.filter((item) => item.status === "error")).toEqual([]);
    expect(result.passed).toBe(true);
    // The valid customer format passes; unresolved common inputs stop at preflight.
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
      const definitions = parseKbnDefinitions(
        JSON.parse(await readFile(process.env["SHEPHERD_KBN_FIXTURE"]!, "utf8")),
      );
      const file = {
        kind: "master" as const,
        name: masterPath!,
        path: masterPath!,
        extension: "xlsm",
        size: null,
      };
      const parsed = parseMaster(await loadWorkbook(masterPath!), file, tables, {
        ...masterFixtureOptions,
        kbnDefinitions: definitions,
      });
      expect(parsed.data.length).toBeGreaterThan(0);
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
    },
    30000,
  );
});

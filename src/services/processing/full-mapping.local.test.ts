// Opt-in acceptance against a private schema. No customer data is saved in the repository.
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CONVERSION_OPTIONS,
  SHEPHERD_TABLE_ORDER,
  shepherdMasterDefinition,
} from "@/config/shepherd-master";
import type { SelectedFile } from "@/models";
import { parseMaster, validateMasterFormat } from "./master-parser";
import { parseTableDefinition } from "./table-definition";
import { readWorkbook } from "./workbook";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";

function completeMasterFixture(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  for (const definition of Object.values(shepherdMasterDefinition.sheets)) {
    const sheet = workbook.addWorksheet(definition.name);
    for (const [address, header] of Object.entries(definition.headers))
      sheet.getCell(address).value = header;
  }
  const sheets = shepherdMasterDefinition.sheets;
  workbook.getWorksheet(sheets.major.name)!.getCell("A2").value = "検査";
  workbook.getWorksheet(sheets.units.name)!.getCell("A2").value = "kV";
  const attributes = workbook.getWorksheet(sheets.reportAttributes.name)!;
  attributes.getCell("A2").value = "帳票無し";
  attributes.getCell("B2").value = "なし";
  attributes.getCell("I2").value = "実績系";
  workbook.getWorksheet(sheets.options.name)!.getRow(2).values = ["判定", "合格"];
  workbook.getWorksheet(sheets.locations.name)!.getRow(2).values = [
    "HPK-01",
    "HPK",
    "第一棟",
    "1F",
    "PRINTER",
    "127.0.0.1",
  ];
  const items = workbook.getWorksheet(sheets.items.name)!;
  items.getCell("G2").value = "電気検査";
  items.getCell("G3").value = "HPK-01";
  items.getCell("G4").value = "電気検査";
  items.getCell("G6").value = "検査";
  items.getCell("G7").value = "個別入力";
  items.getRow(8).values = ["判定値", "説明", null, "kV", "判定", "選択肢(ラジオボタン)", "□"];
  const groups = workbook.getWorksheet(sheets.groups.name)!;
  groups.getCell("C2").value = "個別入力";
  groups.getCell("C3").value = "電気検査";
  groups.getCell("B4").value = "検査工程";
  groups.getCell("C4").value = 1;
  const products = workbook.getWorksheet(sheets.products.name)!;
  products.getCell("K1").value = "電気検査";
  products.getRow(2).values = [
    1,
    "帳票無し",
    null,
    "A100",
    0,
    "A100",
    "試験品",
    null,
    null,
    "検査工程",
    1,
  ];
  products.getRow(3).values = [
    2,
    "帳票無し",
    null,
    "A100",
    "1____",
    "B100",
    "子品目",
    "主要部品",
    null,
    "検査工程",
    1,
  ];
  workbook.getWorksheet(sheets.permissions.name)!.getRow(2).values = [
    "worker",
    "作業者",
    "実績系",
    "C:\\Shepherd\\帳票",
    "作業者(HPK)",
  ];
  return workbook;
}

const schemaPath = process.env["SHEPHERD_SCHEMA_FIXTURE"];
const file: SelectedFile = {
  kind: "master",
  name: "acceptance.xlsm",
  path: null,
  extension: "xlsm",
  size: null,
};
describe.skipIf(!schemaPath)("complete mapping against private schema", () => {
  it("validates all produced tables and generates every normalized row using the real metadata", async () => {
    const bytes = await readFile(schemaPath!);
    const workbook = await readWorkbook(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    const definition = {
      file: { ...file, kind: "tableDefinition" as const },
      tables: parseTableDefinition(workbook),
    };
    const master = completeMasterFixture();
    expect(validateMasterFormat(master, file.name).passed).toBe(true);
    const parsed = parseMaster(master, file, definition, {
      ...EMPTY_CONVERSION_OPTIONS,
      departmentCode: "35",
      departmentName: "試験部門",
      auditUserId: "1",
      effectiveFrom: "2026-10-08",
      productManagementKbn: "0",
      defaultQuantity: "1",
      userIdByLogin: { worker: "17" },
    });
    expect(new Set(parsed.data.map((record) => record.targetTable))).toEqual(
      new Set(SHEPHERD_TABLE_ORDER),
    );
    const result = validateMaster(parsed, definition);
    expect(result.items.filter((item) => item.severity === "error")).toEqual([]);
    expect(result.okCount).toBe(parsed.data.length);
    const sql = generateSql(parsed, definition, {
      sqlComments: true,
      sqlTransaction: true,
    }).generatedSql;
    expect(sql.match(/INSERT INTO/g)).toHaveLength(parsed.data.length);
    for (const table of SHEPHERD_TABLE_ORDER) expect(sql).toContain(`INSERT INTO \`${table}\``);
    expect(sql.indexOf("INSERT INTO `m_departments`")).toBeLessThan(
      sql.indexOf("INSERT INTO `r_authority`"),
    );
    expect(sql.indexOf("INSERT INTO `m_department_report_outputs`")).toBeLessThan(
      sql.indexOf("INSERT INTO `r_user_report_outputs`"),
    );
  }, 30000);
});

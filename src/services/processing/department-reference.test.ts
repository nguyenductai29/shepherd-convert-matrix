import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SelectedFile } from "@/models";
import type { DepartmentRow } from "@/models/references";
import {
  extractDepartmentCode,
  parseDepartmentReferenceFile,
  parseDepartmentReferenceWorkbook,
  resolveDepartment,
} from "./department-reference";

const headers = [
  "department_id",
  "department_code",
  "department_name",
  "edit_ctrl_kbn",
  "invalid_flg",
];
const selected: SelectedFile = {
  kind: "departmentReference",
  name: "ShepherdDB.m_departments.xlsx",
  path: null,
  extension: "xlsx",
  size: null,
};
const department: DepartmentRow = {
  departmentId: 123,
  departmentCode: "HPK",
  departmentName: "製造部門",
  editCtrlKbn: "0",
  invalidFlg: false,
};

function workbook(row: ExcelJS.CellValue[] = [123, "HPK", "製造部門", "0", 0]) {
  const result = new ExcelJS.Workbook();
  const sheet = result.addWorksheet("Sheet1");
  sheet.addRow(headers);
  sheet.addRow(row);
  return result;
}

describe("department filename and exact lookup", () => {
  it.each([
    ["HPK_Shepherd導入_マスタ整備ファイル.xlsm", "HPK"],
    ["C:\\local\\D4_Shepherd導入_マスタ整備ファイル.xlsx", "D4"],
    ["/local/026_Shepherd導入_マスタ整備ファイル.XLSM", "026"],
    ["工場_A_Shepherd導入_マスタ整備ファイル.xlsx", "工場_A"],
  ])("extracts the exact department code from %s", (name, expected) => {
    expect(extractDepartmentCode(name)).toBe(expected);
  });

  it.each([
    "部門コード_Shepherd導入_マスタ整備ファイル.xlsm",
    "_Shepherd導入_マスタ整備ファイル.xlsm",
    " HPK_Shepherd導入_マスタ整備ファイル.xlsm",
    "HPK _Shepherd導入_マスタ整備ファイル.xlsm",
    "HPK_Shepherd導入_マスタ整備ファイル (1).xlsm",
    "HPK_Shepherd導入_マスタ整備ファイル.xls",
    "unrelated.xlsx",
  ])("rejects template or invalid filename %s", (name) => {
    expect(() => extractDepartmentCode(name)).toThrow(
      "ファイル名がShepherdマスタの命名規則と一致しません。",
    );
  });

  it("returns the real existing numeric department ID", () => {
    expect(resolveDepartment("HPK", [department])).toEqual(department);
  });

  it.each(["hpk", " HPK", "HPK ", "MISSING"])("does not normalize an unmatched code %s", (code) => {
    expect(() => resolveDepartment(code, [department])).toThrow(
      "部門コードに対応する部署が見つかりません。",
    );
  });

  it("rejects duplicate active department codes", () => {
    expect(() =>
      resolveDepartment("HPK", [department, { ...department, departmentId: 124 }]),
    ).toThrow("同一の部門コードが部門マスタに複数存在します。");
  });

  it("ignores inactive duplicates when exactly one matching active department exists", () => {
    expect(
      resolveDepartment("HPK", [
        { ...department, departmentId: 124, invalidFlg: true },
        department,
      ]),
    ).toEqual(department);
  });

  it("reports no active match when only inactive departments exist", () => {
    expect(() => resolveDepartment("HPK", [{ ...department, invalidFlg: true }])).toThrow(
      "部門コードに対応する部署が見つかりません。",
    );
  });
});

describe("department reference workbook", () => {
  it("reads only the five required columns without audit/date columns", () => {
    expect(parseDepartmentReferenceWorkbook(workbook())).toEqual([department]);
  });

  it("accepts reordered headers and ignores unrelated cells", () => {
    const input = new ExcelJS.Workbook();
    const sheet = input.addWorksheet("m_departments");
    sheet.addRow([
      "invalid_flg",
      "department_name",
      "created_at",
      "department_code",
      "department_id",
      "edit_ctrl_kbn",
    ]);
    sheet.addRow([false, "製造部門", { error: "#VALUE!" }, "HPK", 123, 0]);
    sheet.addRow([null, null, "unrelated note"]);
    expect(parseDepartmentReferenceWorkbook(input)).toEqual([department]);
  });

  it.each(headers)("reports a missing required column %s", (header) => {
    const input = workbook();
    input.worksheets[0]!.getCell(1, headers.indexOf(header) + 1).value = "unrelated";
    expect(() => parseDepartmentReferenceWorkbook(input)).toThrow(
      "部門マスタに必要な列が不足しています。",
    );
    expect(() => parseDepartmentReferenceWorkbook(input)).toThrow(header);
  });

  it("rejects duplicate required headers and ambiguous reference worksheets", () => {
    const duplicate = workbook();
    duplicate.worksheets[0]!.getCell("F1").value = "department_code";
    expect(() => parseDepartmentReferenceWorkbook(duplicate)).toThrow("重複");
    const ambiguous = workbook();
    ambiguous.addWorksheet("Another").addRow(headers);
    expect(() => parseDepartmentReferenceWorkbook(ambiguous)).toThrow("複数");
  });

  it.each([0, -1, 1.5, 2147483648, "HPK", null])("rejects unusable department ID %s", (id) => {
    expect(() =>
      parseDepartmentReferenceWorkbook(workbook([id, "HPK", "製造部門", "0", 0])),
    ).toThrow("department_id");
  });

  it("preserves code whitespace so lookup cannot silently match a different code", () => {
    const rows = parseDepartmentReferenceWorkbook(workbook([123, " HPK ", "製造部門", "0", 0]));
    expect(rows[0]!.departmentCode).toBe(" HPK ");
    expect(() => resolveDepartment("HPK", rows)).toThrow("見つかりません");
  });

  it("rejects partial reference rows and invalid active flags", () => {
    expect(() => parseDepartmentReferenceWorkbook(workbook([123, "HPK", null, "0", 0]))).toThrow(
      "department_name",
    );
    expect(() =>
      parseDepartmentReferenceWorkbook(workbook([123, "HPK", "製造部門", "0", 2])),
    ).toThrow("invalid_flg");
  });

  it("reads cached formulas without executing them and retains the inactive flag", () => {
    const input = workbook([
      { formula: "100+23", result: 123 },
      "HPK",
      "製造部門",
      "0",
      { formula: "1=1", result: true },
    ]);
    expect(parseDepartmentReferenceWorkbook(input)).toEqual([{ ...department, invalidFlg: true }]);
  });

  it("loads a real xlsx byte stream and rejects a different extension", async () => {
    const bytes = await workbook().xlsx.writeBuffer();
    const data = new Uint8Array(bytes).buffer;
    expect(await parseDepartmentReferenceFile(selected, data)).toEqual({
      file: selected,
      rows: [department],
    });
    await expect(
      parseDepartmentReferenceFile({ ...selected, name: "data.xlsm", extension: "xlsm" }, data),
    ).rejects.toThrow(".xlsx");
  });

  it.skipIf(!process.env["SHEPHERD_DEPARTMENT_FIXTURE"])(
    "reads the opt-in local customer reference without requiring audit fields",
    async () => {
      const bytes = await readFile(process.env["SHEPHERD_DEPARTMENT_FIXTURE"]!);
      const result = await parseDepartmentReferenceFile(selected, new Uint8Array(bytes).buffer);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.every((row) => Number.isSafeInteger(row.departmentId))).toBe(true);
    },
  );
});

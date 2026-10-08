import type ExcelJS from "exceljs";
import type { ScalarValue, SelectedFile } from "@/models";
import type { DepartmentReferenceLoadResult, DepartmentRow } from "@/models/references";
import { cellValue, readWorkbook } from "./workbook";

const REQUIRED_COLUMNS = [
  "department_id",
  "department_code",
  "department_name",
  "edit_ctrl_kbn",
  "invalid_flg",
] as const;

/** The exact filename prefix is a reference key, never an inferred database ID. */
export function extractDepartmentCode(name: string): string {
  const basename = name.split(/[\\/]/).at(-1) ?? "";
  const code = /^(.+)_Shepherd導入_マスタ整備ファイル\.(xlsm|xlsx)$/i.exec(basename)?.[1];
  if (
    !code ||
    code === "部門コード" ||
    code !== code.trim() ||
    /[<>:"|?*]/.test(code) ||
    Array.from(code).some((character) => character.charCodeAt(0) < 32) ||
    Array.from(code).length > 255
  ) {
    throw new Error(
      "マスタファイル名から部門コードを取得できませんでした。<部門コード>_Shepherd導入_マスタ整備ファイル.xlsm または .xlsx の形式で指定してください。テンプレートの「部門コード」は実際のコードに置き換えてください。",
    );
  }
  return code;
}

export function resolveDepartment(code: string, rows: readonly DepartmentRow[]): DepartmentRow {
  const matches = rows.filter((row) => row.departmentCode === code);
  if (matches.length === 0) {
    throw new Error(`部門コードに対応する部署が見つかりません。部門コード: ${code}`);
  }
  if (matches.length > 1) {
    throw new Error(`同一の部門コードが部門マスタに複数存在します。部門コード: ${code}`);
  }
  const department = matches[0]!;
  if (department.invalidFlg !== false) {
    throw new Error(
      `部門マスタの部署が無効です。部門コード: ${code}。有効な部門を確認してください。`,
    );
  }
  if (
    !Number.isInteger(department.departmentId) ||
    department.departmentId <= 0 ||
    department.departmentId > 2147483647
  ) {
    throw new Error(`部門マスタの department_id が不正です。部門コード: ${code}`);
  }
  if (!department.departmentName?.trim()) {
    throw new Error(`部門マスタの department_name が空白です。部門コード: ${code}`);
  }
  return { ...department };
}

function referenceText(
  value: ScalarValue | undefined,
  column: string,
  row: number,
  maxLength: number,
): string {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "number" && !Number.isFinite(value)) ||
    !String(value).trim() ||
    Array.from(String(value)).length > maxLength
  ) {
    throw new Error(
      `部門マスタ ${row} 行目: ${column} は空白でない ${maxLength} 文字以内の値が必要です。`,
    );
  }
  // Do not normalize business keys: department_code matching is deliberately exact.
  return String(value);
}

function activeFlag(value: ScalarValue | undefined, row: number): boolean {
  if (value === false || value === 0 || value === "0" || value === "b'0'") return false;
  if (value === true || value === 1 || value === "1" || value === "b'1'") return true;
  throw new Error(`部門マスタ ${row} 行目: invalid_flg は 0 または 1 で指定してください。`);
}

export function parseDepartmentReferenceWorkbook(workbook: ExcelJS.Workbook): DepartmentRow[] {
  const candidates = workbook.worksheets.map((sheet) => {
    const columns = new Map<string, number>();
    const duplicates: string[] = [];
    let headerRow = 0;
    sheet.eachRow((row, number) => {
      if (headerRow) return;
      headerRow = number;
      row.eachCell((cell, column) => {
        const name = String(cellValue(cell) ?? "").trim();
        if (!REQUIRED_COLUMNS.some((required) => required === name)) return;
        if (columns.has(name)) duplicates.push(name);
        columns.set(name, column);
      });
    });
    return { sheet, columns, duplicates, headerRow };
  });
  const matching = candidates.filter(({ columns }) =>
    REQUIRED_COLUMNS.every((name) => columns.has(name)),
  );
  if (matching.length === 0) {
    const best = candidates.sort((left, right) => right.columns.size - left.columns.size)[0];
    const missing = REQUIRED_COLUMNS.filter((name) => !best?.columns.has(name));
    throw new Error(`部門マスタに必要な列が不足しています。\n不足列:\n${missing.join("\n")}`);
  }
  if (matching.length > 1) {
    throw new Error(
      "部門マスタの対象シートが複数存在します。必要な列を含むシートは1つにしてください。",
    );
  }
  const { sheet, columns, duplicates, headerRow } = matching[0]!;
  if (duplicates.length)
    throw new Error(`部門マスタの列が重複しています: ${duplicates.join(", ")}`);
  const result: DepartmentRow[] = [];
  sheet.eachRow((row, number) => {
    if (number <= headerRow) return;
    const values = REQUIRED_COLUMNS.map((name) => cellValue(row.getCell(columns.get(name)!)));
    if (values.every((value) => value === null || value === "")) return;
    const [id, code, name, edit, invalid] = values;
    const departmentId =
      typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id)) ? Number(id) : NaN;
    if (!Number.isInteger(departmentId) || departmentId <= 0 || departmentId > 2147483647) {
      throw new Error(
        `部門マスタ ${number} 行目: department_id は 1～2147483647 の整数で指定してください。`,
      );
    }
    result.push({
      departmentId,
      departmentCode: referenceText(code, "department_code", number, 255),
      departmentName: referenceText(name, "department_name", number, 255),
      editCtrlKbn: referenceText(edit, "edit_ctrl_kbn", number, 10),
      invalidFlg: activeFlag(invalid, number),
    });
  });
  return result;
}

export async function parseDepartmentReferenceFile(
  file: SelectedFile,
  bytes: ArrayBuffer,
): Promise<DepartmentReferenceLoadResult> {
  if (!/\.xlsx$/i.test(file.name) || file.extension.toLowerCase().replace(/^\./, "") !== "xlsx") {
    throw new Error("部門マスタは .xlsx ファイルを選択してください。");
  }
  return { file, rows: parseDepartmentReferenceWorkbook(await readWorkbook(bytes)) };
}

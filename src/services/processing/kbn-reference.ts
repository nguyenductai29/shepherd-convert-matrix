import type ExcelJS from "exceljs";
import type { SelectedFile } from "@/models";
import type { KbnDefinition } from "@/models/kbn";
import { parseKbnDefinitions } from "./kbn-resolver";
import { cellValue, readWorkbook } from "./workbook";

const REQUIRED_COLUMNS = [
  "category_kbn_code",
  "kbn_value",
  "kbn_name",
  "order_no",
  "invalid_flg",
] as const;

/** Preserve simple Excel code formats such as 000 without interpreting dates,
 * currencies or other display formats as business keys. */
function referenceValue(cell: ExcelJS.Cell): ReturnType<typeof cellValue> {
  const value = cellValue(cell);
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    /^0+$/.test(cell.numFmt)
  ) {
    return String(value).padStart(cell.numFmt.length, "0");
  }
  return value;
}

export function parseKbnReferenceWorkbook(workbook: ExcelJS.Workbook): KbnDefinition[] {
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
    throw new Error(`区分名称マスタに必要な列が不足しています。\n不足列:\n${missing.join("\n")}`);
  }
  if (matching.length > 1) {
    throw new Error(
      "区分名称マスタの対象シートが複数存在します。必要な列を含むシートは1つにしてください。",
    );
  }
  const { sheet, columns, duplicates, headerRow } = matching[0]!;
  if (duplicates.length) {
    throw new Error(`区分名称マスタの列が重複しています: ${duplicates.join(", ")}`);
  }
  const definitions: KbnDefinition[] = [];
  sheet.eachRow((row, number) => {
    if (number <= headerRow) return;
    const entries = REQUIRED_COLUMNS.map((name) => {
      const cell = row.getCell(columns.get(name)!);
      return [name, name === "kbn_value" ? referenceValue(cell) : cellValue(cell)] as const;
    });
    const empty = (value: unknown) =>
      value === null || (typeof value === "string" && !value.trim());
    if (entries.every(([, value]) => empty(value))) return;
    for (const [name, value] of entries) {
      if (empty(value)) {
        throw new Error(`区分名称マスタ ${number} 行目: ${name} に値が必要です。`);
      }
    }
    try {
      definitions.push(...parseKbnDefinitions([Object.fromEntries(entries)]));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new Error(error.message.replace(/^区分定義の 1 行目/, `区分名称マスタ ${number} 行目`));
    }
  });
  // Validate active uniqueness across rows only after every required cell is read.
  return parseKbnDefinitions(definitions);
}

export async function parseKbnReferenceFile(
  file: SelectedFile,
  bytes: ArrayBuffer,
): Promise<KbnDefinition[]> {
  if (!/\.xlsx$/i.test(file.name) || file.extension.toLowerCase().replace(/^\./, "") !== "xlsx") {
    throw new Error("区分名称マスタは .xlsx ファイルを選択してください。");
  }
  return parseKbnReferenceWorkbook(await readWorkbook(bytes));
}

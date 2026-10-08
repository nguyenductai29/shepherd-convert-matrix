import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SelectedFile } from "@/models";
import { parseKbnReferenceFile, parseKbnReferenceWorkbook } from "./kbn-reference";
import { KbnResolver } from "./kbn-resolver";

const headers = ["category_kbn_code", "kbn_value", "kbn_name", "order_no", "invalid_flg"];
const selected: SelectedFile = {
  kind: "kbnDefinition",
  name: "ShepherdDB.m_kbn_definition.xlsx",
  path: null,
  extension: "xlsx",
  size: null,
};
const definition = {
  category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
  kbn_value: "1",
  kbn_name: "Shepherd",
  order_no: 10,
  invalid_flg: false,
};

function workbook(row: ExcelJS.CellValue[] = ["KBN_PRODUCT_MANAGEMENT", 1, "Shepherd", 10, 0]) {
  const result = new ExcelJS.Workbook();
  const sheet = result.addWorksheet("m_kbn_definition");
  sheet.addRow(headers);
  sheet.addRow(row);
  return result;
}

describe("KBN reference workbook", () => {
  it("reads the five required columns without audit columns", () => {
    expect(parseKbnReferenceWorkbook(workbook())).toEqual([definition]);
  });

  it("accepts reordered headers, Japanese rich text and ignores unrelated cells", () => {
    const input = new ExcelJS.Workbook();
    input.addWorksheet("説明").addRow(["区分名称マスタの使い方"]);
    const sheet = input.addWorksheet("区分名称マスタ");
    sheet.addRow([
      "invalid_flg",
      "kbn_name",
      "created_at",
      "category_kbn_code",
      "order_no",
      "kbn_value",
    ]);
    sheet.addRow([
      false,
      { richText: [{ text: "日" }, { text: "本語" }] },
      { error: "#VALUE!" },
      "KBN_TEST",
      "10",
      "IF0017_A",
    ]);
    sheet.addRow([null, null, { error: "#VALUE!" }]);
    expect(parseKbnReferenceWorkbook(input)).toEqual([
      {
        category_kbn_code: "KBN_TEST",
        kbn_value: "IF0017_A",
        kbn_name: "日本語",
        order_no: 10,
        invalid_flg: false,
      },
    ]);
  });

  it.each(headers)("reports the missing required column %s", (header) => {
    const input = workbook();
    input.worksheets[0]!.getCell(1, headers.indexOf(header) + 1).value = "unrelated";
    expect(() => parseKbnReferenceWorkbook(input)).toThrow(
      "区分名称マスタに必要な列が不足しています。",
    );
    expect(() => parseKbnReferenceWorkbook(input)).toThrow(header);
  });

  it("rejects repeated required headers and ambiguous reference worksheets", () => {
    const duplicate = workbook();
    duplicate.worksheets[0]!.getCell("F1").value = "kbn_value";
    expect(() => parseKbnReferenceWorkbook(duplicate)).toThrow("重複");
    const ambiguous = workbook();
    ambiguous.addWorksheet("Another").addRow(headers);
    expect(() => parseKbnReferenceWorkbook(ambiguous)).toThrow("複数");
  });

  it("keeps numeric zero, literal leading zeros and formatted zero-padded values as strings", () => {
    const input = workbook(["KBN_TEST", 0, "ゼロ", 0, 0]);
    const sheet = input.worksheets[0]!;
    sheet.addRow(["KBN_TEST", "001", "文字列", 1, 0]);
    sheet.addRow(["KBN_TEST", 2, "数値書式", 2, 0]);
    sheet.getCell("B4").numFmt = "000";
    expect(parseKbnReferenceWorkbook(input).map((row) => row.kbn_value)).toEqual([
      "0",
      "001",
      "002",
    ]);
  });

  it("reads cached formula strings, numeric zero and false flags without evaluating formulas", async () => {
    const input = workbook([
      { formula: '"KBN_TEST"', result: "KBN_TEST" },
      { formula: "0+0", result: 0 },
      { formula: '"日本語"', result: "日本語" },
      { formula: "1+1", result: 2 },
      { formula: "1=0", result: false },
    ]);
    const bytes = new Uint8Array(await input.xlsx.writeBuffer()).buffer;
    expect(await parseKbnReferenceFile(selected, bytes)).toEqual([
      {
        category_kbn_code: "KBN_TEST",
        kbn_value: "0",
        kbn_name: "日本語",
        order_no: 2,
        invalid_flg: false,
      },
    ]);
  });

  it("rejects formulas without a cached result and Excel errors in required cells", () => {
    expect(() =>
      parseKbnReferenceWorkbook(workbook(["KBN_TEST", { formula: "1+1" }, "名称", 0, 0])),
    ).toThrow("計算結果");
    expect(() =>
      parseKbnReferenceWorkbook(workbook(["KBN_TEST", { error: "#VALUE!" }, "名称", 0, 0])),
    ).toThrow("Excelエラー");
  });

  it.each([
    [0, null, "category_kbn_code"],
    [1, null, "kbn_value"],
    [1, Number.MAX_SAFE_INTEGER + 1, "kbn_value"],
    [2, "", "kbn_name"],
    [3, null, "order_no"],
    [3, 1.5, "order_no"],
    [3, "not-a-number", "order_no"],
    [4, null, "invalid_flg"],
    [4, 2, "invalid_flg"],
  ] as const)("rejects invalid required data in column %s", (index, value, field) => {
    const row: ExcelJS.CellValue[] = ["KBN_TEST", "1", "名称", 0, 0];
    row[index] = value;
    expect(() => parseKbnReferenceWorkbook(workbook(row))).toThrow(field);
  });

  it.each([false, 0, "0", "b'0'"])("normalizes active flag %s", (flag) => {
    expect(
      parseKbnReferenceWorkbook(workbook(["KBN_TEST", "1", "名称", 0, flag]))[0]?.invalid_flg,
    ).toBe(false);
  });

  it("retains inactive rows but ignores their duplicate keys during resolution", () => {
    const input = workbook(["KBN_TEST", "1", "有効", 0, 0]);
    input.worksheets[0]!.addRow(["KBN_TEST", "1", "無効", 1, 1]);
    input.worksheets[0]!.addRow(["KBN_TEST", "1", "無効", 1, "b'1'"]);
    const definitions = parseKbnReferenceWorkbook(input);
    expect(definitions).toHaveLength(3);
    expect(definitions[2]?.invalid_flg).toBe(true);
    const resolver = new KbnResolver(definitions);
    expect(resolver.resolve("KBN_TEST", "有効")).toBe("1");
    expect(resolver.resolveByValue("KBN_TEST", "1")).toBe("有効");
    expect(() => resolver.resolve("KBN_TEST", "無効")).toThrow("無効");
  });

  it.each([
    ["KBN_PRODUCT_MANAGEMENT", "1", "Shepherd", 10, 0],
    ["KBN_PRODUCT_MANAGEMENT", "1", "別名", 10, 0],
    ["KBN_PRODUCT_MANAGEMENT", "2", "Shepherd", 10, 0],
  ])("rejects duplicate active values or ambiguous active names", (...row) => {
    const input = workbook();
    input.worksheets[0]!.addRow(row);
    expect(() => parseKbnReferenceWorkbook(input)).toThrow(/(?:競合|重複).*KBN_PRODUCT_MANAGEMENT/);
  });

  it.each([
    ["reference.json", "json"],
    ["reference.xlsm", "xlsm"],
    ["reference.xlsx", "json"],
  ])("rejects non-xlsx input %s", async (name, extension) => {
    await expect(
      parseKbnReferenceFile({ ...selected, name, extension }, new ArrayBuffer(0)),
    ).rejects.toThrow(".xlsx");
  });

  it.skipIf(!process.env["SHEPHERD_KBN_FIXTURE"])(
    "reads the opt-in private XLSX reference",
    async () => {
      const bytes = await readFile(process.env["SHEPHERD_KBN_FIXTURE"]!);
      const definitions = await parseKbnReferenceFile(selected, new Uint8Array(bytes).buffer);
      const resolver = new KbnResolver(definitions);
      expect(resolver.resolve("KBN_PRODUCT_MANAGEMENT", "SAP")).toBe("0");
      expect(resolver.resolve("KBN_PRODUCT_MANAGEMENT", "Shepherd")).toBe("1");
      expect(resolver.resolve("KBN_INPUT_TYPE", "選択肢(コンボボックス)(編集可)")).toBe("3");
      expect(resolver.resolve("KBN_DISPLAY", "部材割当")).toBe("2");
      expect(resolver.resolve("KBN_PART_TYPE", "主要部品")).toBe("0");
      expect(resolver.resolve("KBN_UNIT", "個")).toBe("1");
    },
  );
});

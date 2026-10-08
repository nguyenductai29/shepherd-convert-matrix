import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { cellValue, readWorkbook } from "./workbook";
import { parseTableDefinition } from "./table-definition";

describe("local workbook reader", () => {
  it("reads Japanese, merged cells, cached formulas, booleans and dates without changing input", async () => {
    const source = new ExcelJS.Workbook();
    const sheet = source.addWorksheet("日本語");
    sheet.getCell("A1").value = "部門";
    sheet.mergeCells("A1:B1");
    sheet.getCell("A2").value = { formula: "1+2", result: 3 };
    sheet.getCell("A3").value = true;
    sheet.getCell("A4").value = new Date("2026-10-08T00:00:00Z");
    const bytes = await source.xlsx.writeBuffer();
    const loaded = await readWorkbook(bytes as ArrayBuffer);
    const actual = loaded.getWorksheet("日本語")!;
    expect(cellValue(actual.getCell("B1"))).toBe("部門");
    expect(cellValue(actual.getCell("A2"))).toBe(3);
    expect(cellValue(actual.getCell("A3"))).toBe(true);
    expect(cellValue(actual.getCell("A4"))).toBe("2026-10-08 00:00:00");
    expect(cellValue(actual.getCell("Z50"))).toBe(null);
    expect(source.getWorksheet("日本語")!.getCell("A1").value).toBe("部門");
  });

  it("never substitutes a missing formula cache or Excel error", () => {
    const sheet = new ExcelJS.Workbook().addWorksheet("Sheet");
    sheet.getCell("A1").value = { formula: "1+2" };
    sheet.getCell("A2").value = { error: "#REF!" };
    expect(() => cellValue(sheet.getCell("A1"))).toThrow(/再計算/);
    expect(() => cellValue(sheet.getCell("A2"))).toThrow(/#REF!/);
  });

  it("compacts cached-empty template padding while preserving zero, false, uncached formulas and colored data cells", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("matrix");
    sheet.getCell("A1").value = { formula: 'IF(1=1,"",1)', result: "" };
    sheet.getCell("A2").value = { formula: "1-1", result: 0 };
    sheet.getCell("A3").value = { formula: "1=2", result: false };
    sheet.getCell("A4").value = { formula: "SUM(B1:B4)" };
    sheet.getCell("A5").value = { formula: "1/0", result: { error: "#DIV/0!" } };
    sheet.getCell("B2").value = 1;
    sheet.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    sheet.getCell("Z6000").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF0000" },
    };
    const loaded = await readWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const actual = loaded.getWorksheet("matrix")!;
    expect(cellValue(actual.getCell("A1"))).toBe(null);
    expect(cellValue(actual.getCell("A2"))).toBe(0);
    expect(cellValue(actual.getCell("A3"))).toBe(false);
    expect(() => cellValue(actual.getCell("A4"))).toThrow(/再計算/);
    expect(() => cellValue(actual.getCell("A5"))).toThrow(/#DIV\/0!/);
    expect(actual.getCell("B2").fill).toMatchObject({ fgColor: { argb: "FFFFFF00" } });
    expect(actual.rowCount).toBeLessThan(6000);
  });

  it("rejects ZIPs advertising an excessive expansion size before decompressing", async () => {
    const zip = new JSZip();
    zip.file("xl/worksheets/sheet1.xml", "<worksheet/>");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 28; i++)
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 300 * 1024 * 1024, true);
    await expect(readWorkbook(bytes.buffer as ArrayBuffer)).rejects.toThrow(/展開サイズ/);
  });

  it("preserves an empty shared-formula anchor required by a nonempty follower", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Shared");
    sheet.getCell("B1").value = "";
    sheet.getCell("B2").value = "日本語";
    sheet.fillFormula("A1:A2", 'IF(B1="","",B1)', (row) => (row === 1 ? "" : "日本語"));
    const loaded = await readWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(cellValue(loaded.getWorksheet("Shared")!.getCell("A1"))).toBe("");
    expect(cellValue(loaded.getWorksheet("Shared")!.getCell("A2"))).toBe("日本語");
  });
});

describe("A5 table definition format", () => {
  it("reads AUTO_INCREMENT, defaults, collation and UNIQUE constraints marked 制約", () => {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet("部門マスタ");
    s.getCell("B5").value = "論理テーブル名";
    s.getCell("C5").value = "部門マスタ";
    s.getCell("B6").value = "物理テーブル名";
    s.getCell("C6").value = "m_departments";
    s.getRow(13).values = ["No.", "論理名", "物理名", "データ型", "Not Null", "デフォルト", "備考"];
    s.getRow(14).values = [1, "部門ID", "department_id", "int auto_increment", "Yes (PK)"];
    s.getRow(15).values = [2, "部門コード", "department_code", "varchar(20)", "Yes"];
    s.getRow(16).values = [3, "無効", "invalid_flg", "bit(1)", "Yes", "'b'0''"];
    s.getRow(18).values = ["インデックス情報"];
    s.getRow(19).values = [
      "No.",
      "インデックス名",
      "カラムリスト",
      null,
      "主キー",
      "ユニーク",
      "オプション",
    ];
    s.getRow(20).values = [1, "PRIMARY", "department_id", null, "Yes", "Yes"];
    s.getRow(21).values = [2, "uk_dept", "department_code,invalid_flg", null, null, "制約"];
    s.getRow(23).values = ["制約情報"];
    s.getRow(24).values = ["No.", "制約名", "種類", "制約定義"];
    s.getRow(25).values = [1, "uk_dept", "UNIQUE", "department_code,invalid_flg"];
    s.getRow(27).values = ["RDBMS固有の情報"];
    s.getRow(28).values = [1, "TABLE_COLLATION", null, "utf8mb4_unicode_ci"];
    const table = parseTableDefinition(wb)[0]!;
    expect(table.name).toBe("m_departments");
    expect(table.columns[0]).toMatchObject({
      name: "department_id",
      type: "int",
      pk: true,
      ai: true,
      nullable: false,
    });
    expect(table.columns[1]).toMatchObject({ length: 20, collation: "utf8mb4_unicode_ci" });
    expect(table.columns[2]!.def).toBe("'b'0''");
    expect(table.indexes.filter((i) => i.type === "UNIQUE")).toEqual([
      { name: "uk_dept", type: "UNIQUE", columns: ["department_code", "invalid_flg"] },
    ]);
  });

  it("rejects workbooks without schema sheets", () => {
    expect(() => parseTableDefinition(new ExcelJS.Workbook())).toThrow(/テーブル定義/);
  });
});

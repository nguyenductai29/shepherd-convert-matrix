import { describe, expect, it } from "vitest";
import { shepherdMasterDefinition } from "@/config/shepherd-master";
import { parseMaster, validateMasterFormat } from "./master-parser";
import type { SelectedFile } from "@/models";
import { masterFixture, masterFixtureOptions as settings } from "@/test/fixtures/master-workbook";

const file: SelectedFile = {
  kind: "master",
  name: "35_Shepherd導入_マスタ整備ファイル.xlsm",
  path: null,
  extension: "xlsm",
  size: null,
};

describe("fixed finalized Shepherd matrix", () => {
  it("validates all required sheets and fixed header positions", () => {
    const wb = masterFixture();
    expect(validateMasterFormat(wb, file.name).passed).toBe(true);
    wb.getWorksheet(shepherdMasterDefinition.sheets.items.name)!.getCell("A7").value = "changed";
    wb.removeWorksheet(shepherdMasterDefinition.sheets.major.name);
    const result = validateMasterFormat(wb, file.name);
    expect(result.passed).toBe(false);
    expect(result.items.filter((i) => i.status === "error").length).toBeGreaterThanOrEqual(2);
    expect(validateMasterFormat(masterFixture(), "master.csv").passed).toBe(false);
  });
  it("extracts normalized masters, relations, source locations and first-row product definitions", () => {
    const result = parseMaster(masterFixture(), file, [], settings);
    expect(result.issues?.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.data.find((r) => r.targetTable === "m_items")!.values).toMatchObject({
      input_type: 1,
      unit_kbn: "2",
      description: "説明",
    });
    expect(result.data.find((r) => r.targetTable === "r_process_items")!.values).toMatchObject({
      required_flg: true,
      common_flg: true,
    });
    expect(result.data.find((r) => r.targetTable === "r_product_structures")!.values).toMatchObject(
      {
        parent_product_code: "A100",
        child_product_code: "B100",
        quantity: "1",
        part_type_kbn: "0",
      },
    );
    const product = result.data.find((r) => r.targetTable === "m_products")!;
    expect(product.sourceRow).toBe(2);
    expect(product.sourceCells?.["product_code"]).toBe("F2");
    expect(
      result.data.find((r) => r.targetTable === "m_processes")!.values["major_process_id"],
    ).toMatchObject({ kind: "reference", column: "major_process_id" });
  });
  it("blocks absent conversion inputs and collects unrelated data issues together", () => {
    const wb = masterFixture();
    const sheet = wb.getWorksheet(shepherdMasterDefinition.sheets.items.name)!;
    sheet.getCell("D8").value = "unknown-unit";
    sheet.getCell("G8").value = "?";
    const result = parseMaster(wb, file, []);
    expect(result.issues!.filter((i) => i.severity === "error").length).toBeGreaterThanOrEqual(8);
    expect(result.issues!.some((i) => i.column === "unit_kbn")).toBe(true);
  });
  it("does not parse records when the format differs", () => {
    const wb = masterFixture();
    wb.removeWorksheet(shepherdMasterDefinition.sheets.groups.name);
    const result = parseMaster(wb, file, [], settings);
    expect(result.data).toHaveLength(0);
    expect(result.issues?.some((i) => i.category === "format")).toBe(true);
  });

  it("reports partial rows, unexpected symbols and missing group references instead of silently ignoring data", () => {
    const wb = masterFixture();
    const s = shepherdMasterDefinition.sheets;
    wb.getWorksheet(s.items.name)!.getCell("D9").value = "kV";
    wb.getWorksheet(s.products.name)!.getCell("K4").value = 1;
    wb.getWorksheet(s.products.name)!.getCell("J2").value = null;
    wb.getWorksheet(s.products.name)!.getCell("B3").value = "UNKNOWN_ATTRIBUTE";
    const result = parseMaster(wb, file, [], settings);
    expect(result.issues?.some((i) => i.sourceRow === 9 && i.column === "item_name")).toBe(true);
    expect(result.issues?.some((i) => i.sourceRow === 4 && i.column === "product_code")).toBe(true);
    expect(result.issues?.some((i) => i.sourceRow === 2 && i.column === "process_group_id")).toBe(
      true,
    );
    expect(result.issues?.some((i) => i.column === "report_attribute")).toBe(true);
  });

  it("rejects renamed header suffixes and meaningful cells outside fixed column ranges", () => {
    const wb = masterFixture();
    const s = shepherdMasterDefinition.sheets;
    wb.getWorksheet(s.options.name)!.getCell("A1").value = "選択肢名称_CHANGED";
    wb.getWorksheet(s.options.name)!.getCell("C2").value = "unexpected";
    const result = validateMasterFormat(wb, file.name);
    expect(result.passed).toBe(false);
    expect(result.items.filter((i) => i.status === "error")).toHaveLength(2);
  });
});

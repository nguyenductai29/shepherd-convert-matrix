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

function repeatedProcessFixture() {
  const wb = masterFixture();
  const s = shepherdMasterDefinition.sheets;
  const items = wb.getWorksheet(s.items.name)!;
  for (const row of [2, 4, 6, 7]) items.getCell(row, 8).value = items.getCell(row, 7).value;
  const groups = wb.getWorksheet(s.groups.name)!;
  groups.getCell("D3").value = "電気検査2";
  groups.getCell("D4").value = 2;
  const products = wb.getWorksheet(s.products.name)!;
  products.getCell("L1").value = "電気検査";
  products.getCell("L2").value = 2;
  products.getCell("L3").value = 2;
  return wb;
}

describe("process-column duplicate discriminators", () => {
  it.each([
    { label: "single name", names: ["陰極真空処理"], groups: ["陰極真空処理"], errors: [] },
    {
      label: "second occurrence",
      names: ["陰極真空処理", "陰極真空処理"],
      groups: ["陰極真空処理", "陰極真空処理2"],
      errors: [],
    },
    {
      label: "third occurrence",
      names: ["工程", "工程", "工程"],
      groups: ["工程", "工程2", "工程3"],
      errors: [],
    },
    {
      label: "interleaved occurrences",
      names: ["工程", "別工程", "工程", "別工程", "工程"],
      groups: ["工程", "別工程", "工程2", "別工程2", "工程3"],
      errors: [],
    },
    {
      label: "blank between occurrences",
      names: ["工程", "", "工程"],
      groups: ["工程", "", "工程2"],
      errors: [],
    },
    { label: "natural trailing number", names: ["工程2"], groups: ["工程2"], errors: [] },
    {
      label: "repeated natural trailing number",
      names: ["工程2", "工程2"],
      groups: ["工程2", "工程22"],
      errors: [],
    },
    {
      label: "distinct naturally numbered name",
      names: ["工程", "工程2", "工程"],
      groups: ["工程", "工程2", "工程2"],
      errors: [],
    },
    {
      label: "suffix on a unique name",
      names: ["陰極真空処理"],
      groups: ["陰極真空処理2"],
      errors: [1],
    },
    {
      label: "wrong second suffix",
      names: ["陰極真空処理", "陰極真空処理"],
      groups: ["陰極真空処理", "陰極真空処理5"],
      errors: [2],
    },
    {
      label: "missing second suffix",
      names: ["工程", "工程"],
      groups: ["工程", "工程"],
      errors: [2],
    },
    {
      label: "numbered first occurrence",
      names: ["工程", "工程"],
      groups: ["工程1", "工程2"],
      errors: [1],
    },
    {
      label: "reversed suffix sequence",
      names: ["工程", "工程"],
      groups: ["工程2", "工程"],
      errors: [1, 2],
    },
    {
      label: "zero-padded suffix",
      names: ["工程", "工程"],
      groups: ["工程", "工程02"],
      errors: [2],
    },
    {
      label: "wrong third suffix",
      names: ["工程", "工程", "工程"],
      groups: ["工程", "工程2", "工程2"],
      errors: [3],
    },
    { label: "stripped natural trailing number", names: ["工程2"], groups: ["工程"], errors: [1] },
    {
      label: "incremented natural trailing number",
      names: ["工程2", "工程2"],
      groups: ["工程2", "工程3"],
      errors: [2],
    },
    { label: "missing group header", names: ["工程"], groups: [""], errors: [1] },
    { label: "group without a logical process", names: [""], groups: ["工程2"], errors: [1] },
  ])("validates $label by exact base name and column order", ({ names, groups, errors }) => {
    const wb = masterFixture();
    const s = shepherdMasterDefinition.sheets;
    names.forEach((name, offset) => {
      wb.getWorksheet(s.items.name)!.getCell(2, 7 + offset).value = name;
      wb.getWorksheet(s.products.name)!.getCell(1, 11 + offset).value = name;
      wb.getWorksheet(s.groups.name)!.getCell(3, 3 + offset).value = groups[offset]!;
    });
    const result = validateMasterFormat(wb, file.name);
    expect(result.passed).toBe(errors.length === 0);
    expect(
      result.items.filter((item) => item.status === "error").map((item) => item.label),
    ).toEqual(errors.map((column) => `工程列 ${column}`));
  });

  it("still requires exact item/product names when the group discriminator is valid", () => {
    const wb = repeatedProcessFixture();
    wb.getWorksheet(shepherdMasterDefinition.sheets.products.name)!.getCell("L1").value =
      "電気検査2";
    const result = validateMasterFormat(wb, file.name);
    expect(result.passed).toBe(false);
    expect(
      result.items.filter((item) => item.status === "error").map((item) => item.label),
    ).toEqual(["工程列 2"]);
    expect(parseMaster(wb, file, [], settings).data).toEqual([]);
  });

  it("accepts the customer workbook's non-adjacent process columns 13 and 15", () => {
    const wb = masterFixture();
    const s = shepherdMasterDefinition.sheets;
    const items = wb.getWorksheet(s.items.name)!;
    const groups = wb.getWorksheet(s.groups.name)!;
    const products = wb.getWorksheet(s.products.name)!;
    items.getCell("S2").value = items.getCell("U2").value = "陰極真空処理";
    products.getCell("W1").value = products.getCell("Y1").value = "陰極真空処理";
    groups.getCell("O3").value = "陰極真空処理";
    groups.getCell("Q3").value = "陰極真空処理2";
    const result = validateMasterFormat(wb, file.name);
    expect(result.items.filter((item) => item.status === "error")).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("keeps repeated logical processes and group orders distinct by column position", () => {
    const result = parseMaster(repeatedProcessFixture(), file, [], settings);
    expect(result.issues?.filter((item) => item.severity === "error")).toEqual([]);
    const processes = result.data.filter((record) => record.targetTable === "m_processes");
    expect(processes.map((record) => record.values["process_name"])).toEqual([
      "電気検査",
      "電気検査",
    ]);
    const relations = result.data.filter((record) => record.targetTable === "r_process_groups");
    expect(relations.map((record) => record.values["order_no"])).toEqual([1, 2]);
    expect(relations.map((record) => record.values["process_id"])).toEqual(
      processes.map((record) => ({ kind: "reference", recordId: record.id, column: "process_id" })),
    );
  });

  it("rejects swapped product orders even when their logical process names are equal", () => {
    const wb = repeatedProcessFixture();
    const products = wb.getWorksheet(shepherdMasterDefinition.sheets.products.name)!;
    products.getCell("K2").value = 2;
    products.getCell("L2").value = 1;
    const result = parseMaster(wb, file, [], settings);
    const errors = result.issues?.filter((item) => item.severity === "error");
    expect(errors).toHaveLength(2);
    expect(
      errors?.every(
        (item) =>
          item.sourceSheet === products.name &&
          item.sourceRow === 2 &&
          item.column === "process_group_id",
      ),
    ).toBe(true);
  });
});

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
      input_type: "1",
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
  it("collects unrelated row-level data issues together after common inputs pass", () => {
    const wb = masterFixture();
    const sheet = wb.getWorksheet(shepherdMasterDefinition.sheets.items.name)!;
    sheet.getCell("D8").value = "unknown-unit";
    sheet.getCell("G8").value = "?";
    const result = parseMaster(wb, file, [], settings);
    expect(result.issues!.filter((i) => i.severity === "error")).toHaveLength(2);
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

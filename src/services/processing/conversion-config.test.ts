import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColumnDefinition, SelectedFile, TableDefinition } from "@/models";
import { masterFixture, masterFixtureOptions } from "@/test/fixtures/master-workbook";
import { kbnFixture } from "@/test/fixtures/kbn-definitions";
import { shepherdMasterDefinition as config } from "@/config/shepherd-master";
import { parseMaster } from "./master-parser";
import { validateMaster } from "./validation";

const file: SelectedFile = {
  kind: "master",
  name: "test.xlsm",
  path: null,
  extension: "xlsm",
  size: null,
};
const options = { ...masterFixtureOptions, kbnDefinitions: kbnFixture };
const column = (
  name: string,
  type = "date",
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({ name, logical: name, type, nullable: false, ...extra });
const table = (name: string, columns: ColumnDefinition[]): TableDefinition => ({
  name,
  logical: name,
  columns,
  indexes: [],
});

afterEach(() => vi.useRealTimers());

describe("confirmed defaults and KBN-backed conversion", () => {
  it("populates confirmed defaults only on actual columns and ignores legacy saved overrides", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 0, 15));
    const schema = [
      table("m_products", [
        column("created_by", "int"),
        column("updated_by", "int"),
        column("effective_from"),
        column("effective_to"),
      ]),
      table("m_processes", [
        column("created_by", "int"),
        column("updated_by", "int"),
        column("effective_from"),
      ]),
      table("m_items", []),
    ];
    const legacy = {
      ...options,
      auditUserId: "99",
      effectiveFrom: "2000-01-01",
      productManagementKbn: "0",
    };
    const parsed = parseMaster(masterFixture(), file, schema, legacy);
    const products = parsed.data.filter((record) => record.targetTable === "m_products");
    expect(products).toHaveLength(2);
    for (const product of products)
      expect(product.values).toMatchObject({
        created_by: 1,
        updated_by: 1,
        effective_from: "2026-10-08",
        effective_to: "9999-12-31",
        product_management_kbn: "1",
      });
    const process = parsed.data.find((record) => record.targetTable === "m_processes")!;
    expect(process.values).toMatchObject({
      created_by: 1,
      updated_by: 1,
      effective_from: "2026-10-08",
    });
    expect(process.values).not.toHaveProperty("effective_to");
    const item = parsed.data.find((record) => record.targetTable === "m_items")!;
    for (const key of ["created_by", "updated_by", "effective_from", "effective_to"])
      expect(item.values).not.toHaveProperty(key);
    const checked = validateMaster(parsed, { file, tables: schema });
    expect(
      checked.items.filter((issue) =>
        ["created_by", "updated_by", "effective_from", "effective_to"].includes(issue.column ?? ""),
      ),
    ).toEqual([]);
    vi.setSystemTime(new Date(2026, 9, 9, 0, 15));
    const next = parseMaster(masterFixture(), file, schema, legacy);
    expect(
      next.data.find((record) => record.targetTable === "m_products")!.values["effective_from"],
    ).toBe("2026-10-09");
  });

  it("uses loaded codes rather than numeric literals for every applicable KBN field", () => {
    const wb = masterFixture();
    const sheets = config.sheets;
    wb.getWorksheet(sheets.groups.name)!.getCell("C4").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF0000" },
    };
    wb.getWorksheet(sheets.products.name)!.getCell("I3").value = "警告";
    wb.getWorksheet(sheets.permissions.name)!.getRow(2).values = [
      "worker",
      "作業者",
      "実績系",
      "C:/reports",
      "作業者(HPK)",
    ];
    const rows = kbnFixture.map((entry) => ({ ...entry, kbn_value: `loaded:${entry.kbn_value}` }));
    const parsed = parseMaster(wb, file, [], {
      ...options,
      kbnDefinitions: rows,
      userIdByLogin: { worker: "17" },
    });
    expect(parsed.issues?.filter((issue) => issue.severity === "error")).toEqual([]);
    const values = (name: string) =>
      parsed.data.find((record) => record.targetTable === name)!.values;
    expect(values("m_products")["product_management_kbn"]).toBe("loaded:1");
    expect(values("m_processes")).toMatchObject({
      process_kbn: "loaded:0",
      display_kbn: "loaded:0",
    });
    expect(values("m_items")).toMatchObject({ input_type: "loaded:1", unit_kbn: "loaded:2" });
    expect(values("r_product_structures")).toMatchObject({
      part_type_kbn: "loaded:0",
      final_proc_check_kbn: "loaded:WARNING",
    });
    expect(values("r_process_groups")["prev_proc_check_kbn"]).toBe("loaded:ERROR");
    expect(values("r_authority")["role_kbn"]).toBe("loaded:2");
    expect(values("m_department_report_outputs")["report_pattern_id"]).toBe("loaded:IF0016");
  });

  it("requires option references based on the input name even when the source changes its code", () => {
    const wb = masterFixture();
    wb.getWorksheet(config.sheets.items.name)!.getCell("F8").value =
      "選択肢(コンボボックス 編集可)";
    const kbnDefinitions = kbnFixture.map((row) =>
      row.category_kbn_code === "KBN_INPUT_TYPE"
        ? { ...row, kbn_value: `value-${row.kbn_value}` }
        : row,
    );
    const parsed = parseMaster(wb, file, [], { ...options, kbnDefinitions });
    expect(
      parsed.data.find((record) => record.targetTable === "m_items")!.values["input_type"],
    ).toBe("value-3");
    expect(
      parsed.issues?.some(
        (issue) => issue.column === "option_id" && issue.message.includes("選択肢入力タイプ"),
      ),
    ).toBe(true);
  });

  it("prefers an explicitly defined workbook label over its legacy format alias", () => {
    const wb = masterFixture();
    wb.getWorksheet(config.sheets.items.name)!.getCell("G7").value = "組立";
    const parsed = parseMaster(wb, file, [], {
      ...options,
      kbnDefinitions: [
        ...kbnFixture,
        { category_kbn_code: "KBN_DISPLAY", kbn_name: "組立", kbn_value: "8" },
      ],
    });
    expect(parsed.issues?.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(
      parsed.data.find((record) => record.targetTable === "m_processes")!.values["display_kbn"],
    ).toBe("8");
  });

  it("reports unresolved unit and print-pattern names with source locations without guessing", () => {
    const wb = masterFixture();
    wb.getWorksheet(config.sheets.items.name)!.getCell("D8").value = "%";
    wb.getWorksheet(config.sheets.permissions.name)!.getRow(2).values = [
      "worker",
      "作業者",
      "部材割当系",
      "C:/reports",
      "作業者(HPK)",
    ];
    const parsed = parseMaster(wb, file, [], { ...options, userIdByLogin: { worker: "17" } });
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          category: "mapping",
          sourceSheet: config.sheets.items.name,
          sourceRow: 8,
          column: "unit_kbn",
          value: "%",
          message: expect.stringContaining("KBN_UNIT"),
        }),
        expect.objectContaining({
          severity: "error",
          category: "mapping",
          sourceSheet: config.sheets.permissions.name,
          sourceRow: 2,
          column: "report_pattern_id",
          value: "部材割当系",
          message: expect.stringContaining("KBN_PRINT_PATTERN"),
        }),
      ]),
    );
    const resolved = parseMaster(wb, file, [], {
      ...options,
      userIdByLogin: { worker: "17" },
      kbnDefinitions: [
        ...kbnFixture,
        { category_kbn_code: "KBN_UNIT", kbn_name: "%", kbn_value: "percent" },
        { category_kbn_code: "KBN_PRINT_PATTERN", kbn_name: "部材割当系", kbn_value: "allocation" },
      ],
    });
    expect(resolved.issues?.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("preflights only missing departments and does not produce per-record NOT NULL cascades", () => {
    const parsed = parseMaster(masterFixture(), file, [], {
      ...options,
      departmentCode: "",
      departmentName: "",
    });
    expect(parsed.data).toEqual([]);
    const checked = validateMaster(parsed, { file, tables: [] });
    expect(checked.errorCount).toBe(2);
    expect(checked.items.map((issue) => issue.column)).toEqual([
      "departmentCode",
      "departmentName",
    ]);
  });

  it("reports a missing Shepherd definition once at preflight", () => {
    const parsed = parseMaster(masterFixture(), file, [], {
      ...options,
      kbnDefinitions: kbnFixture.filter(
        (row) => row.category_kbn_code !== "KBN_PRODUCT_MANAGEMENT",
      ),
    });
    expect(parsed.data).toEqual([]);
    expect(parsed.issues?.filter((issue) => issue.severity === "error")).toEqual([
      expect.objectContaining({
        category: "configuration",
        message: expect.stringContaining("KBN_PRODUCT_MANAGEMENT"),
      }),
    ]);
  });

  it("honors a quantity DEFAULT and still requires configurable quantity when no default exists", () => {
    const schema = [
      table("r_product_structures", [column("quantity", "decimal(8,2)", { def: "2" })]),
    ];
    const parsed = parseMaster(masterFixture(), file, schema, { ...options, defaultQuantity: "" });
    expect(parsed.issues?.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(
      parsed.data.find((record) => record.targetTable === "r_product_structures")!.values,
    ).not.toHaveProperty("quantity");
    const missing = parseMaster(
      masterFixture(),
      file,
      [table("r_product_structures", [column("quantity", "decimal(8,2)")])],
      { ...options, defaultQuantity: "" },
    );
    expect(missing.issues?.filter((issue) => issue.severity === "error")).toEqual([
      expect.objectContaining({ category: "configuration", column: "defaultQuantity" }),
    ]);
    expect(missing.data).toEqual([]);
  });
});

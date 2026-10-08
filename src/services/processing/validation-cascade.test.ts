import { describe, expect, it } from "vitest";
import type {
  MasterParseResult,
  MasterRecord,
  SelectedFile,
  TableDefinitionLoadResult,
  ValidationItem,
} from "@/models";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";

const file: SelectedFile = {
  kind: "master",
  name: "35_Shepherd導入_マスタ整備ファイル.xlsm",
  path: null,
  extension: "xlsm",
  size: null,
};
const parent: MasterRecord = {
  id: "p1",
  entity: "製品",
  targetTable: "m_products",
  sourceSheet: "品目",
  sourceRow: 8,
  values: { product_code: "P1", unit_kbn: null, product_name: 123 },
  originalValues: { unit_kbn: "%" },
  sourceCells: { unit_kbn: "D8" },
};
const root: ValidationItem = {
  severity: "error",
  category: "mapping",
  sourceSheet: "品目",
  sourceRow: 8,
  column: "unit_kbn",
  value: "%",
  message: "KBN_UNIT / % を解決できません。",
};
const definition: TableDefinitionLoadResult = {
  file,
  tables: [
    {
      name: "m_products",
      logical: "製品",
      columns: [
        { name: "product_code", logical: "コード", type: "varchar(20)", nullable: false, pk: true },
        { name: "unit_kbn", logical: "単位", type: "varchar(10)", nullable: false },
        { name: "product_name", logical: "名前", type: "varchar(1)", nullable: false },
      ],
      indexes: [],
    },
  ],
};
const parsed = (data: MasterRecord[], issues: ValidationItem[] = [root]): MasterParseResult => ({
  file,
  tables: [],
  data,
  totalRecords: data.length,
  issues,
});

describe("root mapping error reporting", () => {
  it("still checks literal database defaults and their UNIQUE values when a source mapping failed", () => {
    const omitted = { ...parent, values: { ...parent.values } };
    delete omitted.values["unit_kbn"];
    const schema = structuredClone(definition);
    const unit = schema.tables[0]!.columns.find((column) => column.name === "unit_kbn")!;
    unit.type = "int";
    unit.def = "'bad'";
    expect(
      validateMaster(parsed([omitted]), schema).items.some(
        (item) => item.category === "default-datatype" && item.column === "unit_kbn",
      ),
    ).toBe(true);
    unit.def = "1";
    unit.unique = true;
    const second = {
      ...omitted,
      id: "p2",
      sourceRow: 9,
      sourceCells: { unit_kbn: "D9" },
      values: { ...omitted.values, product_code: "P2" },
    };
    expect(
      validateMaster(parsed([omitted, second]), schema).items.filter(
        (item) => item.category === "duplicate" && item.column === "unit_kbn",
      ),
    ).toHaveLength(2);
  });
  it("still reports a reference to a nonexistent schema column", () => {
    const child = {
      ...parent,
      id: "p2",
      sourceRow: 9,
      values: {
        ...parent.values,
        product_code: "P2",
        unit_kbn: { kind: "reference" as const, recordId: "p1", column: "missing_column" },
      },
    };
    const result = validateMaster(
      parsed([parent, child], [{ ...root, column: "missing_column" }]),
      definition,
    );
    expect(result.items.some((item) => item.category === "reference" && item.sourceRow === 8)).toBe(
      true,
    );
  });
  it("keeps the specific root error without a redundant NOT NULL error and still checks other columns", () => {
    const result = validateMaster(parsed([parent]), definition);
    expect(result.items.filter((i) => i.column === "unit_kbn")).toEqual([root]);
    expect(result.items.some((i) => i.column === "product_name" && i.category === "datatype")).toBe(
      true,
    );
    expect(() =>
      generateSql(parsed([parent]), definition, { sqlComments: true, sqlTransaction: true }),
    ).toThrow();
  });
  it("does not suppress null validation for a different row, column or a warning", () => {
    for (const issue of [
      { ...root, sourceRow: 9 },
      { ...root, column: "other" },
      { ...root, severity: "warning" as const },
    ]) {
      expect(
        validateMaster(parsed([parent], [issue]), definition).items.some(
          (i) => i.column === "unit_kbn" && i.category === "required",
        ),
      ).toBe(true);
    }
  });
  it("does not cascade through child references to the same unresolved parent value", () => {
    const child: MasterRecord = {
      ...parent,
      id: "p2",
      sourceRow: 9,
      sourceCells: {},
      values: {
        product_code: "P2",
        product_name: "B",
        unit_kbn: { kind: "reference", recordId: "p1", column: "unit_kbn" },
      },
    };
    const result = validateMaster(parsed([parent, child]), definition);
    expect(result.items.filter((i) => i.column === "unit_kbn")).toEqual([root]);
    expect(result.okCount).toBe(0);
  });
  it("keeps unique errors unrelated to the unresolved mapping", () => {
    const second = { ...parent, id: "p2", sourceRow: 9, sourceCells: { unit_kbn: "D9" } };
    const result = validateMaster(parsed([parent, second]), definition);
    expect(result.items.filter((i) => i.category === "duplicate")).toHaveLength(2);
    expect(result.items.some((i) => i.category === "required" && i.sourceRow === 9)).toBe(true);
  });
});

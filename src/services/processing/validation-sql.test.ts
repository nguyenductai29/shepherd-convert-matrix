import { describe, expect, it } from "vitest";
import type {
  ColumnDefinition,
  MasterParseResult,
  MasterRecord,
  SelectedFile,
  TableDefinition,
  TableDefinitionLoadResult,
} from "@/models";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";

const file: SelectedFile = {
  kind: "master",
  name: "master.xlsm",
  extension: "xlsm",
  path: null,
  size: 1,
};
const col = (
  name: string,
  type = "varchar(20)",
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({ name, logical: name, type, nullable: false, ...extra });
const table = (
  columns: ColumnDefinition[],
  extra: Partial<TableDefinition> = {},
): TableDefinition => ({ name: "m_departments", logical: "部門", columns, indexes: [], ...extra });
const definition = (...tables: TableDefinition[]): TableDefinitionLoadResult => ({
  file: { ...file, kind: "tableDefinition" },
  tables,
});
const record = (
  values: MasterRecord["values"],
  row = 8,
  targetTable = "m_departments",
): MasterRecord => ({
  id: `${targetTable}:${row}`,
  entity: targetTable,
  targetTable,
  sourceSheet: "部門",
  sourceRow: row,
  values,
  originalValues: { ...values },
});
const parsed = (...data: MasterRecord[]): MasterParseResult => ({
  file,
  data,
  tables: [],
  totalRecords: data.length,
});
const options = { sqlTransaction: true, sqlComments: true };

describe("master validation", () => {
  it("allows omitted AUTO_INCREMENT columns even if the export lists DEFAULT NULL", () => {
    const schema = definition(
      table([col("id", "int", { pk: true, ai: true, def: "NULL" }), col("code")]),
    );
    expect(validateMaster(parsed(record({ code: "HPK" })), schema).errorCount).toBe(0);
  });
  it("reports the original cell row when a matrix record spans multiple header rows", () => {
    const row = record({ code: "too-long" }, 2);
    row.sourceCells = { code: "G7" };
    row.originalValues = { code: "too-long" };
    const result = validateMaster(parsed(row), definition(table([col("code", "varchar(2)")])));
    expect(result.items[0]).toMatchObject({ sourceRow: 7, detail: "部門!G7", value: "too-long" });
    expect(result.okCount).toBe(0);
  });
  it("blocks mixed explicit/generated AUTO_INCREMENT IDs that can collide on a fresh database", () => {
    const schema = definition(table([col("id", "int", { pk: true, ai: true }), col("name")]));
    expect(
      validateMaster(
        parsed(record({ name: "generated" }, 8), record({ id: 1, name: "explicit" }, 9)),
        schema,
      ).errorCount,
    ).toBeGreaterThan(0);
  });
  it("validates an omitted literal default against the column's datatype", () => {
    const schema = definition(table([col("number", "int", { def: "'oops'" })]));
    expect(validateMaster(parsed(record({})), schema).errorCount).toBeGreaterThan(0);
  });
  it("reports missing primary-key columns even if their column metadata says nullable", () => {
    const schema = definition(
      table([col("code", "int", { nullable: true })], {
        indexes: [{ type: "PRIMARY KEY", name: "PRIMARY", columns: ["code"] }],
      }),
    );
    expect(validateMaster(parsed(record({ code: null })), schema).errorCount).toBe(1);
  });
  it("rejects narrower integer destinations for generated foreign keys", () => {
    const parent = record({ code: "HPK" });
    const child = record(
      { department_id: { kind: "reference", recordId: parent.id, column: "id" } },
      9,
      "m_products",
    );
    const schema = definition(
      table([col("id", "bigint", { ai: true, pk: true }), col("code")]),
      table([col("department_id", "int")], { name: "m_products" }),
    );
    expect(
      validateMaster(parsed(child, parent), schema).items.some(
        (item) => item.category === "reference-type",
      ),
    ).toBe(true);
  });
  it("rejects malformed Unicode rather than replacing bytes in saved SQL", () => {
    expect(
      validateMaster(parsed(record({ value: "\ud800" })), definition(table([col("value")])))
        .errorCount,
    ).toBe(1);
  });
  it("does not collapse trailing spaces in MySQL 8 NO PAD collations", () => {
    const schema = definition(
      table([col("code", "varchar(20)", { unique: true, collation: "utf8mb4_0900_ai_ci" })]),
    );
    expect(
      validateMaster(parsed(record({ code: "HPK" }, 8), record({ code: "HPK " }, 9)), schema)
        .errorCount,
    ).toBe(0);
  });
  it("reports all missing required mappings and explicit NULL even if a default exists", () => {
    const result = validateMaster(
      parsed(record({ name: null })),
      definition(
        table([
          col("code"),
          col("name", "text", { def: "'default'" }),
          col("id", "bigint", { ai: true }),
          col("created", "datetime", { def: "CURRENT_TIMESTAMP" }),
        ]),
      ),
    );
    expect(result.errorCount).toBe(2);
    expect(result.items.filter((i) => i.severity === "error").map((i) => i.column)).toEqual([
      "code",
      "name",
    ]);
    expect(result.okCount).toBe(0);
  });
  it.each([
    ["int", "2147483648"],
    ["int unsigned", -1],
    ["bigint", "9223372036854775808"],
    ["bigint", 9007199254740992],
    ["int", "1e2"],
    ["int", 1.5],
    ["decimal(5,2)", "1000.00"],
    ["decimal(5,2)", "1.123"],
    ["date", "2025-02-29"],
    ["date", "0000-01-01"],
    ["datetime", "2026-01-01 24:00:00"],
    ["boolean", "maybe"],
    ["bit(1)", 2],
    ["varchar(2)", "部門名"],
  ])("rejects invalid %s value %s", (type, value) => {
    const result = validateMaster(
      parsed(record({ value })),
      definition(table([col("value", type)])),
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.items[0]).toMatchObject({ sourceSheet: "部門", sourceRow: 8, value });
  });
  it.each([
    ["bigint", "9223372036854775807"],
    ["bigint unsigned", "18446744073709551615"],
    ["decimal(20,3)", "12345678901234567.123"],
    ["decimal(3,3)", ".123"],
    ["date", "2024-02-29"],
    ["datetime", "2026-10-08 12:13:14"],
    ["boolean", "TRUE"],
    ["bit(4)", 15],
    ["varchar(2)", "😀部"],
  ])("accepts valid %s value %s", (type, value) => {
    expect(
      validateMaster(parsed(record({ value })), definition(table([col("value", type)]))).errorCount,
    ).toBe(0);
  });
  it("permits empty text but rejects an empty integer instead of silently treating it as NULL", () => {
    const result = validateMaster(
      parsed(record({ text: "", number: "" })),
      definition(table([col("text"), col("number", "int", { nullable: true })])),
    );
    expect(result.items.filter((i) => i.severity === "error").map((i) => i.column)).toEqual([
      "number",
    ]);
  });
  it("reports every row of a metadata single UNIQUE duplicate", () => {
    const result = validateMaster(
      parsed(record({ code: "HPK" }, 8), record({ code: "DEN" }, 9), record({ code: "HPK" }, 21)),
      definition(table([col("code", "varchar(20)", { unique: true })])),
    );
    expect(result.errorCount).toBe(2);
    expect(result.okCount).toBe(1);
    expect(result.items.map((i) => i.sourceRow)).toEqual([8, 21]);
    expect(result.items[0]?.relatedRows).toEqual([8, 21]);
  });
  it("uses composite UNIQUE metadata and normalizes integer representations", () => {
    const result = validateMaster(
      parsed(
        record({ department_id: "01", name: "陰極前工程" }, 8),
        record({ department_id: 1, name: "陰極前工程" }, 21),
        record({ department_id: 2, name: "陰極前工程" }, 22),
      ),
      definition(
        table([col("department_id", "int"), col("name")], {
          indexes: [{ name: "uk_group", type: "UNIQUE", columns: ["department_id", "name"] }],
        }),
      ),
    );
    expect(result.errorCount).toBe(2);
    expect(result.items[0]?.message).toContain("department_id + name");
  });
  it("allows repeated NULLs in nullable UNIQUE keys", () => {
    expect(
      validateMaster(
        parsed(record({ code: null }, 8), record({}, 9)),
        definition(table([col("code", "varchar(20)", { nullable: true, unique: true })])),
      ).errorCount,
    ).toBe(0);
  });
  it("detects duplicate omitted literal defaults", () => {
    expect(
      validateMaster(
        parsed(record({}, 8), record({ code: "HPK" }, 9)),
        definition(table([col("code", "varchar(20)", { unique: true, def: "'HPK'" })])),
      ).errorCount,
    ).toBe(2);
  });
  it("detects case/accent/trailing-space collisions for unicode_ci metadata", () => {
    expect(
      validateMaster(
        parsed(record({ code: "Café " }, 8), record({ code: "CAFE" }, 9)),
        definition(
          table([col("code", "varchar(20)", { unique: true, collation: "utf8mb4_unicode_ci" })]),
        ),
      ).errorCount,
    ).toBe(2);
  });
  it("preserves case distinctions for binary collation", () => {
    expect(
      validateMaster(
        parsed(record({ code: "HPK" }, 8), record({ code: "hpk" }, 9)),
        definition(table([col("code", "varchar(20)", { unique: true, collation: "utf8mb4_bin" })])),
      ).errorCount,
    ).toBe(0);
  });
  it("validates composite primary keys without treating individual members as unique", () => {
    const schema = definition(
      table([col("id", "int", { pk: true }), col("effective_from", "date", { pk: true })]),
    );
    expect(
      validateMaster(
        parsed(
          record({ id: 1, effective_from: "2026-01-01" }, 8),
          record({ id: 1, effective_from: "2026-02-01" }, 9),
        ),
        schema,
      ).errorCount,
    ).toBe(0);
  });
  it("reports unknown tables, columns, and parser errors instead of dropping records", () => {
    const master = parsed(record({ typo: "x" }), record({}, 10, "unknown"));
    master.issues = [
      {
        severity: "error",
        category: "formula",
        sourceSheet: "部門",
        sourceRow: 12,
        message: "cached value missing",
      },
    ];
    expect(validateMaster(master, definition(table([col("code")]))).errorCount).toBe(4);
  });
  it("rejects unsupported metadata types rather than emitting ambiguous values", () => {
    expect(
      validateMaster(parsed(record({ value: "{}" })), definition(table([col("value", "geometry")])))
        .errorCount,
    ).toBeGreaterThan(0);
  });
  it("blocks missing references and reference cycles", () => {
    const a = record(
      { parent: { kind: "reference", recordId: "m_departments:9", column: "id" } },
      8,
    );
    const b = record({ parent: { kind: "reference", recordId: a.id, column: "id" } }, 9);
    const schema = definition(
      table([col("id", "int", { pk: true, ai: true }), col("parent", "int")]),
    );
    expect(validateMaster(parsed(a), schema).errorCount).toBeGreaterThan(0);
    expect(
      validateMaster(parsed(a, b), schema).items.some((i) => i.category === "reference-cycle"),
    ).toBe(true);
  });
});

describe("safe MySQL generation", () => {
  it("reruns validation and blocks duplicate data and prior parser errors", () => {
    const schema = definition(table([col("code", "varchar(20)", { unique: true })]));
    expect(() =>
      generateSql(parsed(record({ code: "HPK" }, 8), record({ code: "HPK" }, 9)), schema, options),
    ).toThrow();
    const master = parsed(record({ code: "HPK" }));
    master.issues = [{ severity: "error", category: "format", message: "invalid format" }];
    expect(() => generateSql(master, schema, options)).toThrow();
  });
  it("emits exact Japanese strings and mode-independent apostrophe escaping", () => {
    const sql = generateSql(
      parsed(record({ code: "日本語O'Reilly" })),
      definition(table([col("code")])),
      options,
    ).generatedSql;
    expect(sql).toContain("'日本語O''Reilly'");
    expect(sql).toContain("START TRANSACTION;");
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/INSERT IGNORE|REPLACE INTO/);
  });
  it("uses UTF-8 hex for backslashes and control characters independently of SQL mode", () => {
    const sql = generateSql(
      parsed(record({ code: "a\\b\n\r\0'" })),
      definition(table([col("code")])),
      options,
    ).generatedSql;
    expect(sql).toContain("CONVERT(X'615c620a0d0027' USING utf8mb4)");
  });
  it("preserves bigint/decimal precision and emits NULL and bit literals", () => {
    const sql = generateSql(
      parsed(
        record({
          id: "9223372036854775807",
          amount: "12345678901234567.123",
          note: null,
          flag: false,
        }),
      ),
      definition(
        table([
          col("id", "bigint"),
          col("amount", "decimal(20,3)"),
          col("note", "text", { nullable: true }),
          col("flag", "bit(1)"),
        ]),
      ),
      options,
    ).generatedSql;
    expect(sql).toContain("9223372036854775807");
    expect(sql).toContain("12345678901234567.123");
    expect(sql).toContain(",\n    NULL,\n    b'0'\n);");
    expect(sql).toContain("b'0'");
  });
  it("omits absent AUTO_INCREMENT and DEFAULT columns, while keeping explicit mapped IDs", () => {
    const schema = definition(
      table([
        col("id", "int", { ai: true }),
        col("code"),
        col("created", "datetime", { def: "CURRENT_TIMESTAMP" }),
      ]),
    );
    const implicit = generateSql(parsed(record({ code: "HPK" })), schema, options).generatedSql;
    expect(implicit).not.toContain("`id`");
    expect(implicit).not.toContain("`created`");
    expect(
      generateSql(parsed(record({ code: "HPK", id: 42 })), schema, options).generatedSql,
    ).toContain("`id`");
  });
  it("orders inserted parents before children and captures generated parent IDs", () => {
    const parent = record({ code: "HPK" });
    const child = record(
      { department_id: { kind: "reference", recordId: parent.id, column: "id" }, name: "品目" },
      9,
      "m_products",
    );
    const schema = definition(
      table([col("id", "int", { ai: true, pk: true }), col("code")]),
      table([col("department_id", "int"), col("name")], { name: "m_products" }),
    );
    const sql = generateSql(parsed(child, parent), schema, options).generatedSql;
    expect(sql.indexOf("INSERT INTO `m_departments`")).toBeLessThan(
      sql.indexOf("INSERT INTO `m_products`"),
    );
    expect(sql).toContain("LAST_INSERT_ID()");
    expect(sql).toMatch(/VALUES \([\s\S]*@shepherd_id_1/);
  });
  it("uses explicit Shepherd table order even when no record reference exists", () => {
    const schema = definition(table([col("code")]), table([col("code")], { name: "m_products" }));
    const sql = generateSql(
      parsed(record({ code: "P" }, 9, "m_products"), record({ code: "D" })),
      schema,
      options,
    ).generatedSql;
    expect(sql.indexOf("INSERT INTO `m_departments`")).toBeLessThan(
      sql.indexOf("INSERT INTO `m_products`"),
    );
  });
  it("respects comments/transaction settings and safely quotes identifiers", () => {
    const schema = definition(table([col("a`b")], { name: "odd`table" }));
    const sql = generateSql(parsed(record({ "a`b": "x" }, 8, "odd`table")), schema, {
      sqlComments: false,
      sqlTransaction: false,
    }).generatedSql;
    expect(sql).toContain("`odd``table`");
    expect(sql).toContain("`a``b`");
    expect(sql).not.toContain("START TRANSACTION");
    expect(sql).not.toContain("--");
  });
});

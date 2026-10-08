import type ExcelJS from "exceljs";
import type { ColumnDefinition, IndexDefinition, TableDefinition } from "@/models";
import { cellText } from "./workbook";

const affirmative = (value: string) => /^(yes|true|1|○|〇|有|制約)$/i.test(value);
const list = (value: string) =>
  value
    .split(/[,、]/)
    .map((x) => x.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);

/** A5:SQL Mk-2 table-definition export. Non-definition workbook sheets are ignored. */
export function parseTableDefinition(workbook: ExcelJS.Workbook): TableDefinition[] {
  const tables: TableDefinition[] = [];
  for (const sheet of workbook.worksheets) {
    if (cellText(sheet.getCell("B6")) !== "物理テーブル名") continue;
    const name = cellText(sheet.getCell("C6")).replace(/`/g, "").split(".").at(-1) ?? "";
    if (!name || !/^[\p{L}\p{N}_$]+$/u.test(name))
      throw new Error(`${sheet.name}: 物理テーブル名が不正です。`);
    if (tables.some((table) => table.name === name))
      throw new Error(`${name}: テーブル定義が重複しています。`);
    const columns: ColumnDefinition[] = [];
    const indexes = new Map<string, IndexDefinition>();
    let section = "";
    let collation = "";
    let hasAutoIncrement = false;
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const text = (col: number) => cellText(row.getCell(col));
      const first = text(1);
      if (
        /^(カラム情報|インデックス情報|制約情報|外部キー情報|トリガー情報|RDBMS固有の情報)/.test(
          first,
        )
      ) {
        section = first;
        continue;
      }
      if (!/^\d+$/.test(first)) continue;
      if (section === "カラム情報" || (!section && rowNumber >= 14 && text(3) && text(4))) {
        const rawType = text(4);
        const type = rawType.replace(/\bauto_increment\b/gi, "").trim();
        const args = type.match(/\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/);
        const column: ColumnDefinition = {
          name: text(3),
          logical: text(2),
          type,
          nullable: !/yes|not\s*null|PK/i.test(text(5)),
          pk: /\bPK\b/i.test(text(5)),
          ai: /auto_increment/i.test(`${rawType} ${text(7)}`),
          unsigned: /\bunsigned\b/i.test(type),
        };
        if (!column.name || !type || columns.some((c) => c.name === column.name))
          throw new Error(`${name}: カラム定義が不正です (${rowNumber}行)。`);
        if (args?.[1]) column.length = Number(args[1]);
        if (args?.[2]) column.scale = Number(args[2]);
        if (text(6) !== "") column.def = text(6);
        columns.push(column);
      } else if (section === "インデックス情報") {
        const type = affirmative(text(5))
          ? "PRIMARY KEY"
          : affirmative(text(6))
            ? "UNIQUE"
            : "INDEX";
        indexes.set(text(2), { name: text(2), type, columns: list(text(3)) });
      } else if (section === "制約情報" && /^(UNIQUE|PRIMARY KEY)$/i.test(text(3))) {
        const type = text(3).toUpperCase() as "UNIQUE" | "PRIMARY KEY";
        indexes.set(text(2), { name: text(2), type, columns: list(text(4)) });
      } else if (section === "RDBMS固有の情報") {
        if (text(2) === "TABLE_COLLATION") collation = text(4);
        if (text(2) === "AUTO_INCREMENT" && /^\d+$/.test(text(4))) hasAutoIncrement = true;
      }
    }
    if (!columns.length)
      throw new Error(`${name}: テーブル定義のカラム情報を読み取れませんでした。`);
    // Older A5 exports omit column EXTRA. A non-null table AUTO_INCREMENT
    // property identifies it only if exactly one integer PK column is possible.
    if (hasAutoIncrement && !columns.some((c) => c.ai)) {
      const candidates = columns.filter(
        (c) => c.pk && /^(tinyint|smallint|mediumint|int|integer|bigint)\b/i.test(c.type),
      );
      if (candidates.length !== 1)
        throw new Error(
          `${name}: AUTO_INCREMENT列を特定できません。最新のテーブル定義書を使用してください。`,
        );
      candidates[0]!.ai = true;
    }
    if (
      !Array.from(indexes.values()).some((i) => i.type === "PRIMARY KEY") &&
      columns.some((c) => c.pk)
    )
      indexes.set("PRIMARY", {
        name: "PRIMARY",
        type: "PRIMARY KEY",
        columns: columns.filter((c) => c.pk).map((c) => c.name),
      });
    for (const index of indexes.values()) {
      if (
        !index.columns.length ||
        index.columns.some((col) => !columns.some((c) => c.name === col))
      )
        throw new Error(`${name}.${index.name}: インデックスのカラムが不正です。`);
      for (const column of columns) {
        if (index.type === "PRIMARY KEY" && index.columns.includes(column.name)) {
          column.pk = true;
          column.nullable = false;
        }
        if (
          index.type === "UNIQUE" &&
          index.columns.length === 1 &&
          index.columns[0] === column.name
        )
          column.unique = true;
      }
    }
    for (const column of columns)
      if (collation && /char|text|enum|set/i.test(column.type)) column.collation = collation;
    tables.push({
      name,
      logical: cellText(sheet.getCell("C5")),
      columns,
      indexes: Array.from(indexes.values()),
    });
  }
  if (!tables.length)
    throw new Error("テーブル定義書の解析に失敗しました。対応するテーブル情報シートがありません。");
  return tables;
}

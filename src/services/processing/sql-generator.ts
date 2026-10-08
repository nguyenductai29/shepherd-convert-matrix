import type {
  ColumnDefinition,
  MasterParseResult,
  MasterRecord,
  ScalarValue,
  SqlGenerationResult,
  SqlOptions,
  TableDefinitionLoadResult,
} from "@/models";
import { SHEPHERD_TABLE_ORDER } from "@/config/shepherd-master";
import { orderRecords } from "./dependency-order";
import { validateMaster } from "./validation";
import { checkValue, isAutoIncrement, isReference, literalDefault } from "./value-validation";

/** Backticks quote identifiers; metadata is never inserted as executable SQL. */
function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function quoteString(value: string): string {
  // MySQL interprets backslash escapes differently under NO_BACKSLASH_ESCAPES.
  // Hex with explicit UTF-8 conversion preserves those bytes in either mode.
  if (
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    const hex = Array.from(new TextEncoder().encode(value), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `CONVERT(X'${hex}' USING utf8mb4)`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function literal(value: ScalarValue, column: ColumnDefinition): string {
  if (value === null) return "NULL";
  const result = checkValue(value, column);
  if ("error" in result) throw new Error(`SQL生成に失敗しました。${column.name}: ${result.error}`);
  if (result.kind === "number") return result.value;
  if (result.kind === "bit") return `b'${BigInt(result.value).toString(2)}'`;
  return quoteString(result.value);
}

const comment = (value: string): string =>
  [...value]
    .map((character) =>
      character.charCodeAt(0) < 32 || character === "\u2028" || character === "\u2029"
        ? " "
        : character,
    )
    .join("");

export function generateSql(
  parsed: MasterParseResult,
  definition: TableDefinitionLoadResult,
  options: SqlOptions,
): SqlGenerationResult {
  // This guard intentionally lives at the public core boundary, independently of UI state.
  const validation = validateMaster(parsed, definition);
  if (validation.errorCount > 0)
    throw new Error(
      `検証エラーが ${validation.errorCount} 件あるため SQL を生成できません。検証結果を確認してください。`,
    );
  const tables = new Map(definition.tables.map((table) => [table.name, table]));
  const records = new Map(parsed.data.map((record) => [record.id, record]));
  const { ordered, cyclic } = orderRecords(parsed.data, SHEPHERD_TABLE_ORDER);
  if (cyclic.length || ordered.length !== parsed.data.length)
    throw new Error("参照関係の挿入順序を決定できません。");
  const variableByRecord = new Map<string, string>();
  for (const record of ordered) {
    for (const reference of Object.values(record.values).filter(isReference)) {
      let parent = records.get(reference.recordId)!;
      let columnName = reference.column;
      // Validation already rules out cycles, missing columns, and unknown defaults.
      while (isReference(parent.values[columnName])) {
        const next = parent.values[columnName];
        if (!isReference(next)) break;
        parent = records.get(next.recordId)!;
        columnName = next.column;
      }
      const column = tables
        .get(parent.targetTable)!
        .columns.find((candidate) => candidate.name === columnName)!;
      if (parent.values[columnName] === undefined && isAutoIncrement(column)) {
        const key = `${parent.id}\0${columnName}`;
        if (!variableByRecord.has(key))
          variableByRecord.set(key, `@shepherd_id_${variableByRecord.size + 1}`);
      }
    }
  }
  const valueSql = (record: MasterRecord, column: ColumnDefinition): string => {
    let value = record.values[column.name];
    const originalColumn = column;
    while (isReference(value)) {
      const reference = value;
      const parent = records.get(reference.recordId)!;
      const parentColumn = tables
        .get(parent.targetTable)!
        .columns.find((candidate) => candidate.name === reference.column)!;
      const variable = variableByRecord.get(`${parent.id}\0${parentColumn.name}`);
      if (variable) return variable;
      value = parent.values[parentColumn.name];
      if (value === undefined) {
        const fallback = literalDefault(parentColumn);
        if (!fallback.known) throw new Error("参照先の既定値を確定できません。");
        value = fallback.value;
      }
    }
    return literal(value ?? null, originalColumn);
  };
  const generatedAt = new Date().toISOString();
  const sql: string[] = [];
  if (options.sqlComments)
    sql.push(
      "-- Shepherd Master SQL Generator",
      `-- Source: ${comment(parsed.file.name)}`,
      `-- Generated: ${generatedAt}`,
      `-- Records: ${parsed.data.length}`,
      "-- Existing database contents are not checked. Review before execution.",
      "",
    );
  // Japanese literals are encoded as UTF-8; preserve the importing session's settings.
  sql.push(
    "SET @shepherd_old_character_set_client = @@character_set_client;",
    "SET @shepherd_old_character_set_results = @@character_set_results;",
    "SET @shepherd_old_collation_connection = @@collation_connection;",
    "SET NAMES utf8mb4;",
    "",
  );
  if (options.sqlTransaction) sql.push("START TRANSACTION;", "");
  let previousTable = "";
  for (const record of ordered) {
    const table = tables.get(record.targetTable)!;
    if (record.targetTable !== previousTable) {
      if (options.sqlComments)
        sql.push(
          "-- =====================================",
          `-- ${comment(table.name)} / ${comment(table.logical)}`,
          "-- =====================================",
          "",
        );
      previousTable = record.targetTable;
    }
    if (options.sqlComments) sql.push(`-- ${comment(record.sourceSheet)} / 行 ${record.sourceRow}`);
    // Presence is distinct from explicit NULL: absent fields invoke DB defaults/AI.
    const columns = table.columns.filter((column) => record.values[column.name] !== undefined);
    if (columns.length) {
      sql.push(
        `INSERT INTO ${quoteIdentifier(table.name)} (`,
        columns.map((column) => `    ${quoteIdentifier(column.name)}`).join(",\n"),
        ")",
        "VALUES (",
        columns.map((column) => `    ${valueSql(record, column)}`).join(",\n"),
        ");",
      );
    } else {
      sql.push(`INSERT INTO ${quoteIdentifier(table.name)} () VALUES ();`);
    }
    for (const column of table.columns) {
      const variable = variableByRecord.get(`${record.id}\0${column.name}`);
      if (variable) sql.push(`SET ${variable} = LAST_INSERT_ID();`);
    }
    sql.push("");
  }
  if (options.sqlTransaction) sql.push("COMMIT;", "");
  for (const variable of variableByRecord.values()) sql.push(`SET ${variable} = NULL;`);
  sql.push(
    "SET character_set_client = @shepherd_old_character_set_client;",
    "SET character_set_results = @shepherd_old_character_set_results;",
    "SET collation_connection = @shepherd_old_collation_connection;",
    "SET @shepherd_old_character_set_client = NULL;",
    "SET @shepherd_old_character_set_results = NULL;",
    "SET @shepherd_old_collation_connection = NULL;",
    "",
  );
  return { generatedSql: sql.join("\n"), targetDb: "MySQL", generatedAt };
}

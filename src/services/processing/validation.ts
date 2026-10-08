import type {
  ColumnDefinition,
  IndexDefinition,
  MasterParseResult,
  MasterRecord,
  ScalarValue,
  TableDefinition,
  TableDefinitionLoadResult,
  ValidationItem,
  ValidationResult,
} from "@/models";
import { orderRecords } from "./dependency-order";
import {
  checkValue,
  hasDefault,
  isAutoIncrement,
  isReference,
  literalDefault,
  typeInfo,
  uniqueValueKey,
} from "./value-validation";

type EffectiveValue =
  | { kind: "scalar"; value: ScalarValue }
  | { kind: "generated"; key: string; column: ColumnDefinition }
  | { kind: "unknown" };

function constraints(table: TableDefinition): IndexDefinition[] {
  const result = table.indexes
    .filter((index) => index.type === "PRIMARY KEY" || index.type === "UNIQUE")
    .map((index) => ({ ...index, columns: [...index.columns] }));
  const primaryColumns = table.columns.filter((column) => column.pk).map((column) => column.name);
  if (primaryColumns.length && !result.some((index) => index.type === "PRIMARY KEY"))
    result.push({ name: "PRIMARY", type: "PRIMARY KEY", columns: primaryColumns });
  for (const column of table.columns)
    if (column.unique)
      result.push({ name: `UNIQUE_${column.name}`, type: "UNIQUE", columns: [column.name] });
  const seen = new Set<string>();
  return result.filter((index) => {
    const key = [...index.columns].sort().join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateMaster(
  parsed: MasterParseResult,
  definition: TableDefinitionLoadResult,
): ValidationResult {
  const items: ValidationItem[] = [...(parsed.issues ?? [])];
  const failedRecordIds = new Set<string>();
  const tables = new Map(definition.tables.map((table) => [table.name, table]));
  const records = new Map(parsed.data.map((record) => [record.id, record]));
  const mappingErrors = (parsed.issues ?? []).filter(
    (item) => item.severity === "error" && item.category === "mapping" && item.column,
  );
  // Only suppress a consequence when a precise source/column error already
  // explains the absent value. Other rows, columns and constraints still run.
  const hasUnresolvedMapping = (record: MasterRecord, column: string): boolean => {
    let current = record;
    let name = column;
    const visited = new Set<string>();
    while (true) {
      const key = `${current.id}\0${name}`;
      if (visited.has(key)) return false;
      visited.add(key);
      const metadata = tables
        .get(current.targetTable)
        ?.columns.find((column) => column.name === name);
      // Unknown schema references and database-supplied values have their own
      // validation requirements; a source mapping issue must not hide them.
      if (!metadata) return false;
      const value = current.values[name];
      if (value === undefined && (hasDefault(metadata) || isAutoIncrement(metadata))) return false;
      if (isReference(value)) {
        const parent = records.get(value.recordId);
        if (!parent) return false;
        current = parent;
        name = value.column;
        continue;
      }
      if (value !== null && value !== undefined) return false;
      const address = current.sourceCells?.[name];
      const sourceRow = address
        ? Number(/(\d+)$/.exec(address)?.[1] ?? current.sourceRow)
        : current.sourceRow;
      return mappingErrors.some(
        (item) =>
          item.sourceSheet === current.sourceSheet &&
          item.sourceRow === sourceRow &&
          item.column === name &&
          (!item.table || item.table === current.targetTable),
      );
    }
  };
  const recordsByTable = new Map<string, MasterRecord[]>();
  const issue = (
    category: string,
    message: string,
    record?: MasterRecord,
    column?: string,
    value?: unknown,
  ): ValidationItem => {
    const item: ValidationItem = { severity: "error", category, message };
    if (record) {
      failedRecordIds.add(record.id);
      item.sourceSheet = record.sourceSheet;
      item.sourceRow = record.sourceRow;
      item.table = record.targetTable;
      const address = column === undefined ? undefined : record.sourceCells?.[column];
      if (address) {
        item.sourceRow = Number(/(\d+)$/.exec(address)?.[1] ?? record.sourceRow);
        item.detail = `${record.sourceSheet}!${address}`;
      }
    }
    if (column !== undefined) item.column = column;
    if (value !== undefined)
      item.value =
        isReference(value) && column !== undefined && record?.originalValues[column] !== undefined
          ? record.originalValues[column]
          : value;
    items.push(item);
    return item;
  };
  if (!parsed.data.length && !items.some((item) => item.severity === "error"))
    issue("empty-master", "変換対象のレコードがありません。");
  if (tables.size !== definition.tables.length)
    issue("schema", "テーブル定義に重複した物理テーブル名があります。");
  const seenIds = new Set<string>();
  for (const record of parsed.data) {
    if (!record.id || seenIds.has(record.id))
      issue("record-id", "内部レコード識別子が空または重複しています。", record);
    seenIds.add(record.id);
    const grouped = recordsByTable.get(record.targetTable) ?? [];
    grouped.push(record);
    recordsByTable.set(record.targetTable, grouped);
  }
  const resolve = (record: MasterRecord, column: ColumnDefinition): EffectiveValue => {
    let current = record;
    let currentColumn = column;
    const seen = new Set<string>();
    while (true) {
      const key = `${current.id}\0${currentColumn.name}`;
      if (seen.has(key)) return { kind: "unknown" };
      seen.add(key);
      const value = current.values[currentColumn.name];
      if (value === undefined) {
        if (isAutoIncrement(currentColumn))
          return { kind: "generated", key, column: currentColumn };
        const fallback = literalDefault(currentColumn);
        return fallback.known ? { kind: "scalar", value: fallback.value } : { kind: "unknown" };
      }
      if (!isReference(value)) return { kind: "scalar", value };
      const parent = records.get(value.recordId);
      const parentColumn =
        parent &&
        tables
          .get(parent.targetTable)
          ?.columns.find((candidate) => candidate.name === value.column);
      if (!parent || !parentColumn) return { kind: "unknown" };
      current = parent;
      currentColumn = parentColumn;
    }
  };
  for (const table of definition.tables) {
    const columnNames = new Set(table.columns.map((column) => column.name));
    if (
      !table.name ||
      [...table.name].some((character) => character.charCodeAt(0) < 32) ||
      [...table.name].length > 64
    )
      issue("schema", `物理テーブル名が不正です: ${table.name}`);
    if (columnNames.size !== table.columns.length || !table.columns.length)
      issue("schema", `${table.name}: 列名が重複しているか、列定義がありません。`);
    for (const column of table.columns)
      if (
        !column.name ||
        [...column.name].some((character) => character.charCodeAt(0) < 32) ||
        [...column.name].length > 64
      )
        issue("schema", `${table.name}: 物理列名が不正です。`);
    for (const index of table.indexes)
      if (!index.columns.length || index.columns.some((name) => !columnNames.has(name)))
        issue("schema", `${table.name}: インデックス ${index.name} が未定義の列を参照しています。`);
  }
  for (const record of parsed.data) {
    const table = tables.get(record.targetTable);
    if (!table) {
      issue("mapping", "変換先のテーブルが定義書にありません。", record);
      continue;
    }
    const columnNames = new Set(table.columns.map((column) => column.name));
    for (const name of Object.keys(record.values))
      if (!columnNames.has(name))
        issue(
          "mapping",
          "変換先の列がテーブル定義書にありません。",
          record,
          name,
          record.values[name],
        );
    const primary = new Set(
      constraints(table)
        .filter((index) => index.type === "PRIMARY KEY")
        .flatMap((index) => index.columns),
    );
    for (const column of table.columns) {
      if (hasUnresolvedMapping(record, column.name)) {
        failedRecordIds.add(record.id);
        continue;
      }
      const value = record.values[column.name];
      const required = !column.nullable || primary.has(column.name);
      if (value === undefined) {
        if (required && !isAutoIncrement(column) && !hasDefault(column))
          issue(
            "required-mapping",
            "NOT NULL 列にマッピング・既定値・AUTO_INCREMENT のいずれもありません。",
            record,
            column.name,
          );
        if (
          required &&
          !isAutoIncrement(column) &&
          hasDefault(column) &&
          literalDefault(column).known &&
          literalDefault(column).value === null
        )
          issue("required", "NOT NULL 列の既定値が NULL です。", record, column.name);
        if (hasDefault(column) && !isAutoIncrement(column)) {
          const fallback = literalDefault(column);
          if (fallback.known && fallback.value !== null) {
            const checked = checkValue(fallback.value, column);
            if ("error" in checked)
              issue(
                "default-datatype",
                `既定値が列定義に適合しません。${checked.error}`,
                record,
                column.name,
                fallback.value,
              );
          }
        }
        continue;
      }
      if (value === null) {
        if (required || isAutoIncrement(column))
          issue("required", "必須項目に NULL が指定されています。", record, column.name, null);
        continue;
      }
      if (isReference(value)) {
        const parent = records.get(value.recordId);
        const parentColumn =
          parent &&
          tables
            .get(parent.targetTable)
            ?.columns.find((candidate) => candidate.name === value.column);
        if (!parent || !parentColumn) {
          issue(
            "reference",
            "参照先のレコードまたは列が見つかりません。",
            record,
            column.name,
            value,
          );
          continue;
        }
        const effective = resolve(parent, parentColumn);
        if (effective.kind === "unknown")
          issue(
            "reference",
            "参照先の値を確定できません (循環参照または動的な既定値)。",
            record,
            column.name,
            value,
          );
        else if (effective.kind === "scalar") {
          if (effective.value === null) {
            if (required)
              issue("reference", "必須項目の参照先が NULL です。", record, column.name, value);
          } else {
            const checked = checkValue(effective.value, column);
            if ("error" in checked)
              issue("reference-type", checked.error, record, column.name, value);
          }
        } else {
          const sourceType = typeInfo(effective.column);
          const targetType = typeInfo(column);
          const ranks: Record<string, number> = {
            tinyint: 8,
            smallint: 16,
            mediumint: 24,
            int: 32,
            integer: 32,
            bigint: 64,
          };
          const sourceBits = ranks[sourceType.name];
          const targetBits = ranks[targetType.name];
          if (
            !sourceBits ||
            !targetBits ||
            targetBits < sourceBits ||
            (sourceType.unsigned && !targetType.unsigned && targetBits <= sourceBits)
          )
            issue(
              "reference-type",
              "AUTO_INCREMENT 参照先と格納先の整数型・範囲に互換性がありません。",
              record,
              column.name,
              value,
            );
        }
        continue;
      }
      const checked = checkValue(value, column);
      if ("error" in checked)
        issue(
          "datatype",
          checked.error,
          record,
          column.name,
          record.originalValues[column.name] ?? value,
        );
    }
  }
  for (const record of orderRecords(parsed.data).cyclic)
    issue("reference-cycle", "参照関係に循環があるため挿入順序を決定できません。", record);
  for (const [name, tableRecords] of recordsByTable) {
    const table = tables.get(name);
    if (!table) continue;
    for (const column of table.columns.filter(isAutoIncrement)) {
      const explicit = tableRecords.filter((record) => record.values[column.name] !== undefined);
      if (explicit.length && explicit.length < tableRecords.length) {
        for (const record of explicit)
          issue(
            "auto-increment",
            "明示 ID と自動採番が同じテーブルに混在しています。採番衝突を防ぐため統一してください。",
            record,
            column.name,
            record.values[column.name],
          );
      }
    }
    const columnByName = new Map(table.columns.map((column) => [column.name, column]));
    for (const index of constraints(table)) {
      if (index.columns.some((column) => !columnByName.has(column))) continue;
      const groups = new Map<string, { record: MasterRecord; display: string[] }[]>();
      for (const record of tableRecords) {
        const keys: string[] = [];
        const display: string[] = [];
        let skip = false;
        for (const name of index.columns) {
          if (hasUnresolvedMapping(record, name)) {
            skip = true;
            break;
          }
          const column = columnByName.get(name)!;
          const effective = resolve(record, column);
          if (effective.kind === "unknown") {
            issue(
              "unique-default",
              `一意制約 ${index.name} の値を確定できません。動的な既定値または参照を確認してください。`,
              record,
              name,
            );
            skip = true;
            break;
          }
          if (effective.kind === "generated") {
            keys.push(`generated:${effective.key}`);
            display.push("自動採番");
            continue;
          }
          const key = uniqueValueKey(effective.value, column);
          // MySQL UNIQUE permits multiple rows with at least one NULL component.
          if (key === null) {
            skip = true;
            break;
          }
          keys.push(key);
          display.push(String(effective.value));
        }
        if (skip) continue;
        const key = JSON.stringify(keys);
        const group = groups.get(key) ?? [];
        group.push({ record, display });
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const rows = group.map(({ record }) => record.sourceRow);
        for (const { record, display } of group) {
          const item = issue(
            "duplicate",
            `${index.type} ${index.name} (${index.columns.join(" + ")}) が重複しています。値: ${display.join(" / ")} / 行: ${rows.join(", ")}`,
            record,
            index.columns.join(" + "),
            display,
          );
          item.relatedRows = rows;
          item.detail = group
            .map(({ record: source }) => `${source.sourceSheet}!${source.sourceRow}`)
            .join(", ");
        }
      }
    }
  }
  const errorItems = items.filter((item) => item.severity === "error");
  const erroneousRows = new Set(
    errorItems
      .filter((item) => item.sourceSheet !== undefined && item.sourceRow !== undefined)
      .map((item) => `${item.sourceSheet}\0${item.sourceRow}`),
  );
  const globalError = errorItems.some(
    (item) => item.sourceSheet === undefined || item.sourceRow === undefined,
  );
  return {
    totalRecords: parsed.data.length,
    okCount: globalError
      ? 0
      : parsed.data.filter(
          (record) =>
            !failedRecordIds.has(record.id) &&
            !erroneousRows.has(`${record.sourceSheet}\0${record.sourceRow}`) &&
            !Object.values(record.sourceCells ?? {}).some((address) =>
              erroneousRows.has(`${record.sourceSheet}\0${Number(/(\d+)$/.exec(address)?.[1])}`),
            ),
        ).length,
    errorCount: errorItems.length,
    warningCount: items.filter((item) => item.severity === "warning").length,
    items,
    dbComparison: "unchecked",
  };
}

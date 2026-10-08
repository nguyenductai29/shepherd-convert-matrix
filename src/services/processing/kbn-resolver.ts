import type { KbnDefinition } from "@/models/kbn";

function requiredText(value: unknown, field: string, row: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`区分定義の ${row} 行目: ${field} に空白でない文字列が必要です。`);
  }
  return value.trim();
}

function definitionKey(category: string, value: string): string {
  return JSON.stringify([category, value]);
}

/** Validates normalized reference rows restored from local settings. External
 * files enter through the XLSX reference parser, never through this helper. */
export function parseKbnDefinitions(source: unknown): KbnDefinition[] {
  if (!Array.isArray(source)) {
    throw new Error("保存された区分定義の形式が不正です。区分名称マスタを再選択してください。");
  }
  const result: KbnDefinition[] = [];
  const byName = new Map<string, string>();
  const byValue = new Map<string, string>();
  for (const [index, sourceRow] of source.entries()) {
    const row = index + 1;
    if (typeof sourceRow !== "object" || sourceRow === null || Array.isArray(sourceRow)) {
      throw new Error(`区分定義の ${row} 行目がオブジェクトではありません。`);
    }
    const entry = sourceRow as Record<string, unknown>;
    const category = requiredText(entry["category_kbn_code"], "category_kbn_code", row);
    const name = requiredText(entry["kbn_name"], "kbn_name", row);
    const rawValue = entry["kbn_value"];
    const value = requiredText(
      typeof rawValue === "number" &&
        Number.isFinite(rawValue) &&
        Math.abs(rawValue) <= Number.MAX_SAFE_INTEGER
        ? String(rawValue)
        : rawValue,
      "kbn_value",
      row,
    );
    const flag = entry["invalid_flg"] === undefined ? false : entry["invalid_flg"];
    if (
      flag !== 0 &&
      flag !== "0" &&
      flag !== "b'0'" &&
      flag !== false &&
      flag !== 1 &&
      flag !== "1" &&
      flag !== "b'1'" &&
      flag !== true
    ) {
      throw new Error(`区分定義の ${row} 行目: invalid_flg は 0 または 1 で指定してください。`);
    }
    const invalid = flag === 1 || flag === "1" || flag === "b'1'" || flag === true;
    const rawOrder = entry["order_no"] === undefined ? 0 : entry["order_no"];
    const order =
      typeof rawOrder === "number" ||
      (typeof rawOrder === "string" && /^[+-]?\d+$/.test(rawOrder.trim()))
        ? Number(rawOrder)
        : NaN;
    if (!Number.isInteger(order) || order < -2147483648 || order > 2147483647) {
      throw new Error(`区分定義の ${row} 行目: order_no は整数で指定してください。`);
    }
    result.push({
      category_kbn_code: category,
      kbn_name: name,
      kbn_value: value,
      order_no: order,
      invalid_flg: invalid,
    });
    if (invalid) continue;
    const nameKey = definitionKey(category, name);
    const valueKey = definitionKey(category, value);
    const existingValue = byName.get(nameKey);
    const existingName = byValue.get(valueKey);
    if (existingValue !== undefined && existingValue !== value) {
      throw new Error(
        `区分定義が競合しています: ${category} / ${name} に複数の kbn_value (${existingValue}, ${value}) が指定されています。`,
      );
    }
    if (existingName !== undefined) {
      throw new Error(
        `区分定義が重複しています: ${category} / ${value} に複数の有効な行 (${existingName}, ${name}) が指定されています。`,
      );
    }
    byName.set(nameKey, value);
    byValue.set(valueKey, name);
  }
  return result;
}

export class KbnResolver {
  private readonly byName = new Map<string, string>();
  private readonly byValue = new Map<string, string>();

  constructor(rows: readonly KbnDefinition[]) {
    for (const row of parseKbnDefinitions(rows)) {
      if (row.invalid_flg) continue;
      this.byName.set(definitionKey(row.category_kbn_code, row.kbn_name), row.kbn_value);
      this.byValue.set(definitionKey(row.category_kbn_code, row.kbn_value), row.kbn_name);
    }
  }

  resolve(category: string, name: string): string {
    const value = this.byName.get(definitionKey(category.trim(), name.trim()));
    if (value === undefined) {
      throw new Error(
        `区分値を解決できません: ${category.trim()} / ${name.trim() || "（空白）"}。区分定義ファイルに対応する有効な定義を確認・追加してください。`,
      );
    }
    return value;
  }

  resolveByValue(category: string, value: string): string {
    const name = this.byValue.get(definitionKey(category.trim(), value.trim()));
    if (name === undefined) {
      throw new Error(
        `区分名称を解決できません: ${category.trim()} / ${value.trim() || "（空白）"}。区分定義ファイルに対応する有効な定義を確認・追加してください。`,
      );
    }
    return name;
  }

  resolveName(category: string, value: string): string {
    return this.resolveByValue(category, value);
  }
}

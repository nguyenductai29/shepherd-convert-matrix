import type { ColumnDefinition, RecordReference, ScalarValue } from "@/models";

export type ValueCheck =
  { value: string; kind: "text" | "number" | "bit" | "date" } | { error: string };
const integerBits: Record<string, number> = {
  tinyint: 8,
  smallint: 16,
  mediumint: 24,
  int: 32,
  integer: 32,
  bigint: 64,
};

export function isReference(value: unknown): value is RecordReference {
  return (
    typeof value === "object" && value !== null && "kind" in value && value.kind === "reference"
  );
}

export function typeInfo(column: ColumnDefinition) {
  const match = /^\s*([a-z]+)(?:\s*\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\))?/i.exec(column.type);
  return {
    name: (match?.[1] ?? "").toLowerCase(),
    length: column.length ?? (match?.[2] ? Number(match[2]) : undefined),
    scale: column.scale ?? (match?.[3] ? Number(match[3]) : undefined),
    unsigned: column.unsigned === true || /\bunsigned\b/i.test(column.type),
  };
}

export function isAutoIncrement(column: ColumnDefinition): boolean {
  return column.ai === true || /\bauto_increment\b/i.test(column.type);
}

export function hasDefault(column: ColumnDefinition): boolean {
  return column.def !== undefined;
}

/** Literal defaults are used for duplicate checks only; SQL always leaves defaults to MySQL. */
export function literalDefault(column: ColumnDefinition): { known: boolean; value: ScalarValue } {
  if (column.def === undefined) return { known: true, value: null };
  let text = column.def.trim();
  if (/^null$/i.test(text)) return { known: true, value: null };
  if (/^true$/i.test(text)) return { known: true, value: true };
  if (/^false$/i.test(text)) return { known: true, value: false };
  if (/^'.*'$/s.test(text)) {
    text = text.slice(1, -1).replace(/''/g, "'");
    if (!/^b'[01]+'$/i.test(text)) return { known: true, value: text };
  }
  const bit = /^b'([01]+)'$/i.exec(text);
  if (bit?.[1]) return { known: true, value: BigInt(`0b${bit[1]}`).toString() };
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return { known: true, value: text };
  if (text === "") return { known: true, value: "" };
  return { known: false, value: text };
}

function booleanNumber(value: ScalarValue): string | undefined {
  if (value === true || value === 1) return "1";
  if (value === false || value === 0) return "0";
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return "1";
  if (["0", "false", "no", "off"].includes(normalized)) return "0";
  return undefined;
}

function numberString(value: ScalarValue): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value).trim();
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [coefficient = "", exponentText = "0"] = text.toLowerCase().split("e");
  const sign = coefficient.startsWith("-") ? "-" : "";
  const unsigned = coefficient.replace(/^[+-]/, "");
  const point = unsigned.indexOf(".");
  const digits = unsigned.replace(".", "");
  const position = (point === -1 ? unsigned.length : point) + Number(exponentText);
  if (position <= 0) return `${sign}0.${"0".repeat(-position)}${digits}`;
  if (position >= digits.length) return `${sign}${digits}${"0".repeat(position - digits.length)}`;
  return `${sign}${digits.slice(0, position)}.${digits.slice(position)}`;
}

function normalizedDecimal(text: string): string {
  const negative = text.startsWith("-");
  const [whole = "", fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const integer = whole.replace(/^0+/, "") || "0";
  const decimal = fraction.replace(/0+$/, "");
  const sign = negative && (integer !== "0" || decimal !== "") ? "-" : "";
  return `${sign}${integer}${decimal ? `.${decimal}` : ""}`;
}

function validDate(value: string, withTime: boolean, fractionDigits: number): boolean {
  const pattern = withTime
    ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/
    : /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = pattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const monthDays = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day > (monthDays[month - 1] ?? 0)) return false;
  return (
    !withTime ||
    (Number(match[4]) < 24 &&
      Number(match[5]) < 60 &&
      Number(match[6]) < 60 &&
      (match[7]?.length ?? 0) <= fractionDigits)
  );
}

export function checkValue(value: ScalarValue, column: ColumnDefinition): ValueCheck {
  const type = typeInfo(column);
  if (typeof value === "number" && !Number.isFinite(value))
    return { error: "有限の数値ではありません。" };
  if (value === null) return { error: "NULL は値として検証できません。" };
  const bits = integerBits[type.name];
  if (bits !== undefined) {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      return { error: "整数の精度を保証できません。Excel のセルを文字列にして入力してください。" };
    const text = typeof value === "boolean" ? (value ? "1" : "0") : numberString(value);
    if (!/^[+-]?\d+$/.test(text)) return { error: "整数を入力してください。" };
    const integer = BigInt(text);
    const min = type.unsigned ? 0n : -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(type.unsigned ? bits : bits - 1)) - 1n;
    if (integer < min || integer > max)
      return { error: `${column.type} の範囲 (${min} ～ ${max}) を超えています。` };
    if (isAutoIncrement(column) && integer <= 0n)
      return { error: "AUTO_INCREMENT に明示する ID は正の整数にしてください。" };
    return { value: integer.toString(), kind: "number" };
  }
  if (["bool", "boolean", "bit"].includes(type.name)) {
    const width = type.name === "bit" ? (type.length ?? 1) : 1;
    if (width < 1 || width > 64) return { error: "BIT の桁数が不正です。" };
    const text = booleanNumber(value) ?? numberString(value);
    if (!/^\d+$/.test(text) || (typeof value === "number" && !Number.isSafeInteger(value)))
      return { error: "真偽値 (0/1、true/false) またはビット範囲内の整数を入力してください。" };
    const integer = BigInt(text);
    if (integer >= 1n << BigInt(width)) return { error: `BIT(${width}) の範囲を超えています。` };
    return { value: integer.toString(), kind: type.name === "bit" ? "bit" : "number" };
  }
  if (["decimal", "numeric", "dec", "fixed"].includes(type.name)) {
    const text = numberString(value);
    if (typeof value === "boolean" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
      return { error: "小数を入力してください。" };
    if (typeof value === "number" && Math.abs(value) > Number.MAX_SAFE_INTEGER)
      return { error: "小数の精度を保証できません。Excel のセルを文字列にして入力してください。" };
    const precision = type.length ?? 10;
    const scale = type.scale ?? 0;
    if (precision < 1 || precision > 65 || scale < 0 || scale > 30 || scale > precision)
      return { error: "DECIMAL の精度・桁数定義が不正です。" };
    const canonical = normalizedDecimal(text);
    const [integer = "", fraction = ""] = canonical.replace(/^-/, "").split(".");
    if (
      (integer === "0" ? 0 : integer.length) > precision - scale ||
      fraction.length > scale ||
      (type.unsigned && canonical.startsWith("-"))
    )
      return { error: `${column.type} の整数部・小数部の桁数または符号が不正です。` };
    return { value: canonical, kind: "number" };
  }
  if (["float", "double", "real"].includes(type.name)) {
    const text = String(value).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
      return { error: "数値を入力してください。" };
    const numeric = Number(text);
    const max = type.name === "float" ? 3.402823466e38 : Number.MAX_VALUE;
    if (!Number.isFinite(numeric) || Math.abs(numeric) > max || (type.unsigned && numeric < 0))
      return { error: `${column.type} の範囲を超えています。` };
    return { value: String(numeric), kind: "number" };
  }
  if (["date", "datetime", "timestamp"].includes(type.name)) {
    const text = String(value);
    if (!validDate(text, type.name !== "date", type.length ?? 0))
      return {
        error: "有効な日付 (YYYY-MM-DD) または日時 (YYYY-MM-DD HH:mm:ss) を入力してください。",
      };
    const normalized = text.replace("T", " ");
    if (
      type.name === "timestamp" &&
      (normalized < "1970-01-01 00:00:01" || normalized > "2038-01-19 03:14:07")
    )
      return { error: "TIMESTAMP の有効範囲を超えています。" };
    return { value: normalized, kind: "date" };
  }
  if (["char", "varchar", "tinytext", "text", "mediumtext", "longtext"].includes(type.name)) {
    const text = String(value);
    if (/[\uD800-\uDFFF]/u.test(text))
      return { error: "文字列に不正な Unicode 文字が含まれています。" };
    const length = type.length ?? (type.name === "char" ? 1 : undefined);
    if (length !== undefined && [...text].length > length)
      return { error: `文字数が上限 ${length} 文字を超えています (${[...text].length} 文字)。` };
    const byteLimits: Record<string, number> = {
      tinytext: 255,
      text: 65535,
      mediumtext: 16777215,
      longtext: 4294967295,
    };
    const limit = byteLimits[type.name];
    if (limit !== undefined && new TextEncoder().encode(text).length > limit)
      return { error: `${column.type} のバイト数上限を超えています。` };
    return { value: text, kind: "text" };
  }
  return { error: `未対応のデータ型です: ${column.type}。定義書を確認してください。` };
}

/** Conservative local comparison for documented common MySQL Unicode collations. */
export function uniqueValueKey(value: ScalarValue, column: ColumnDefinition): string | null {
  if (value === null) return null;
  const checked = checkValue(value, column);
  if ("error" in checked) return `invalid:${String(value)}`;
  if (checked.kind !== "text") return `${checked.kind}:${checked.value}`;
  const collation = column.collation?.toLowerCase() ?? "";
  let text = checked.value;
  // Legacy collations pad strings; MySQL 8's 0900 collations use NO PAD.
  if (!collation.includes("0900") && collation !== "binary") text = text.replace(/ +$/, "");
  if (/_ci(?:_|$)/.test(collation)) text = text.toLowerCase();
  if (
    /_ai(?:_|$)/.test(collation) ||
    (/_ci(?:_|$)/.test(collation) && !/_as(?:_|$)/.test(collation))
  ) {
    text = text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/ß/g, "ss")
      .replace(/œ/g, "oe")
      .replace(/æ/g, "ae");
  }
  return `text:${text}`;
}

import type ExcelJS from "exceljs";
import type {
  FormatCheckResult,
  MasterParseResult,
  MasterRecord,
  RecordReference,
  ScalarValue,
  SelectedFile,
  TableDefinition,
  TableDefinitionLoadResult,
  ValidationItem,
} from "@/models";
import {
  EMPTY_CONVERSION_OPTIONS,
  SHEPHERD_SHEET_MAX_COLUMNS,
  shepherdMasterDefinition as config,
  type ConversionOptions,
} from "@/config/shepherd-master";
import { cellText, cellValue, normalizedHeader } from "./workbook";
import { KbnResolver } from "./kbn-resolver";
import { confirmedDefaults } from "./conversion-defaults";
import { buildConversionContext } from "./conversion-context";
import type { ConversionContext, SerializableConversionContext } from "@/models/references";
import { hasDefault, isAutoIncrement } from "./value-validation";

type Values = MasterRecord["values"];
const definitions = config.sheets;
const ref = (record: MasterRecord, column: string): RecordReference => ({
  kind: "reference",
  recordId: record.id,
  column,
});

export function validateMasterFormat(
  workbook: ExcelJS.Workbook,
  fileName: string,
): FormatCheckResult {
  const items: FormatCheckResult["items"] = [];
  items.push({
    label: "拡張子",
    detail: fileName,
    status: /\.(xlsx|xlsm)$/i.test(fileName) ? "ok" : "error",
  });
  for (const definition of Object.values(definitions)) {
    const sheet = workbook.getWorksheet(definition.name);
    if (!sheet) {
      items.push({
        label: definition.name,
        detail: "必須シートが見つかりません。",
        status: "error",
      });
      continue;
    }
    let valid = true;
    for (const [address, expected] of Object.entries(definition.headers)) {
      try {
        const actual = cellText(sheet.getCell(address));
        if (
          normalizedHeader(actual.trim().split(/\r?\n/)[0] ?? "") !== normalizedHeader(expected)
        ) {
          valid = false;
          items.push({
            label: `${definition.name}!${address}`,
            detail: `見出しが一致しません。期待値: ${expected} / 実際: ${actual}`,
            status: "error",
          });
        }
      } catch (error) {
        valid = false;
        items.push({
          label: `${definition.name}!${address}`,
          detail: String(error),
          status: "error",
        });
      }
    }
    if (sheet.rowCount > 100000 || sheet.columnCount > 1000) {
      valid = false;
      items.push({
        label: definition.name,
        detail: "シート範囲が固定フォーマットの上限を超えています。",
        status: "error",
      });
    }
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (Number(cell.col) <= (SHEPHERD_SHEET_MAX_COLUMNS[sheet.name] ?? 0)) return;
        try {
          if (cellText(cell) === "") return;
        } catch {
          /* Unreadable cells outside the supported range are errors too. */
        }
        valid = false;
        items.push({
          label: `${sheet.name}!${cell.address}`,
          detail: "固定フォーマットの対象範囲外にデータがあります。",
          status: "error",
        });
      }),
    );
    if (valid)
      items.push({
        label: definition.name,
        detail: "必須シート・固定見出しを確認しました。",
        status: "ok",
      });
  }
  for (const sheet of workbook.worksheets)
    if (!Object.values(definitions).some((definition) => definition.name === sheet.name))
      items.push({
        label: sheet.name,
        detail: "固定フォーマットに含まれないシートです。取込対象には含めません。",
        status: "warning",
      });
  // Three matrices share the same process columns, with fixed offsets.
  const processes = workbook.getWorksheet(definitions.items.name);
  const groups = workbook.getWorksheet(definitions.groups.name);
  const products = workbook.getWorksheet(definitions.products.name);
  if (processes && groups && products) {
    const occurrences = new Map<string, number>();
    for (
      let offset = 0;
      offset <= definitions.items.processEndColumn - definitions.items.processStartColumn;
      offset++
    ) {
      try {
        const expected = cellText(
          processes.getCell(
            definitions.items.rows.process,
            definitions.items.processStartColumn + offset,
          ),
        );
        // Count exact logical names left-to-right. Only later occurrences get a
        // discriminator; natural trailing digits remain part of the base name.
        const occurrence = expected ? (occurrences.get(expected) ?? 0) + 1 : 0;
        if (expected) occurrences.set(expected, occurrence);
        const expectedGroup = occurrence > 1 ? `${expected}${occurrence}` : expected;
        const group = cellText(
          groups.getCell(
            definitions.groups.rows.process,
            definitions.groups.processStartColumn + offset,
          ),
        );
        const product = cellText(
          products.getCell(1, definitions.products.processStartColumn + offset),
        );
        if (expectedGroup !== group || expected !== product)
          items.push({
            label: `工程列 ${offset + 1}`,
            detail: `工程項目・品目構成の工程名、または工程Gの重複連番が一致しません (${expected} / ${group} / ${product}、工程G期待値: ${expectedGroup})。`,
            status: "error",
          });
      } catch (error) {
        items.push({ label: `工程列 ${offset + 1}`, detail: String(error), status: "error" });
      }
    }
  }
  return { passed: !items.some((item) => item.status === "error"), items };
}

/** Fixed Shepherd matrices → normalized records. Repeated dimension labels
 * (option name, item name, product appearing in multiple BOMs) are normalized
 * according to the workbook; relationship duplicates remain validation errors. */
export function parseMaster(
  workbook: ExcelJS.Workbook,
  file: SelectedFile,
  definitionsOrResult: TableDefinition[] | TableDefinitionLoadResult,
  options: ConversionOptions = EMPTY_CONVERSION_OPTIONS,
  snapshot?: SerializableConversionContext,
): MasterParseResult {
  const definition = Array.isArray(definitionsOrResult)
    ? definitionsOrResult
    : definitionsOrResult.tables;
  const format = validateMasterFormat(workbook, file.name);
  if (!format.passed)
    return {
      file,
      tables: [],
      totalRecords: 0,
      data: [],
      issues: format.items
        .filter((i) => i.status === "error")
        .map((i) => ({
          severity: "error",
          category: "format",
          sourceSheet: i.label,
          message: i.detail,
        })),
    };
  const data: MasterRecord[] = [];
  const issues: ValidationItem[] = format.items
    .filter((item) => item.status === "warning")
    .map((item) => ({
      severity: "warning",
      category: "format",
      sourceSheet: item.label,
      message: item.detail,
    }));
  const report = (
    sheet: string,
    row: number,
    column: string,
    message: string,
    value?: unknown,
    severity: "error" | "warning" = "error",
  ) => {
    issues.push({
      severity,
      category: "mapping",
      sourceSheet: sheet,
      sourceRow: row,
      column,
      value,
      message,
    });
  };
  const errorCells = new Set<string>();
  const get = (sheet: ExcelJS.Worksheet, row: number, col: number): ScalarValue => {
    const cell = sheet.getCell(row, col);
    try {
      return cellValue(cell);
    } catch (error) {
      const key = `${sheet.name}!${cell.address}`;
      if (!errorCells.has(key)) {
        errorCells.add(key);
        report(sheet.name, row, cell.address, String(error));
      }
      return null;
    }
  };
  const text = (sheet: ExcelJS.Worksheet, row: number, col: number): string => {
    const value = get(sheet, row, col);
    const format = sheet.getCell(row, col).numFmt;
    if (typeof value === "number" && Number.isInteger(value) && /^0{2,}$/.test(format))
      return String(value).padStart(format.length, "0");
    return String(value ?? "").trim();
  };
  const configurationError = (column: string, message: string) => {
    issues.push({
      severity: "error",
      category: "configuration",
      sourceSheet: "変換設定",
      column,
      message,
    });
  };
  let context: ConversionContext;
  try {
    context = snapshot
      ? { ...snapshot, kbnResolver: new KbnResolver(options.kbnDefinitions) }
      : buildConversionContext(file.name, options.departmentReferences, options.kbnDefinitions);
  } catch (error) {
    configurationError("references", String(error instanceof Error ? error.message : error));
    return { file, data: [], tables: [], totalRecords: 0, issues };
  }
  if (
    options.defaultQuantity &&
    (!/^\d+(\.\d+)?$/.test(options.defaultQuantity) || Number(options.defaultQuantity) <= 0)
  )
    configurationError("defaultQuantity", "構成数量は正の数を指定してください。");
  if (issues.some((issue) => issue.severity === "error"))
    return { file, data: [], tables: [], totalRecords: 0, issues };
  const { kbnResolver: resolver, productManagementKbn } = context;
  const add = (
    table: string,
    sheet: ExcelJS.Worksheet | string,
    row: number,
    values: Values,
    cells: Record<string, string> = {},
  ): MasterRecord => {
    const sourceSheet = typeof sheet === "string" ? sheet : sheet.name;
    const originalValues: Record<string, unknown> = {};
    for (const [column, address] of Object.entries(cells)) {
      if (typeof sheet !== "string") {
        const c = sheet.getCell(address);
        originalValues[column] = get(sheet, Number(c.row), Number(c.col));
      }
    }
    const record: MasterRecord = {
      id: `${table}:${data.length + 1}`,
      entity: definition.find((t) => t.name === table)?.logical ?? table,
      targetTable: table,
      sourceSheet,
      sourceRow: row,
      values: {
        ...values,
        ...confirmedDefaults(
          definition.find((t) => t.name === table),
          context,
        ),
      },
      originalValues,
      sourceCells: cells,
    };
    data.push(record);
    return record;
  };
  const canonicalName = (category: string, value: string) =>
    config.kbnAliases[category]?.[value] ?? value;
  const code = (
    category: string,
    value: string,
    sheet: string,
    row: number,
    column: string,
  ): string | null => {
    try {
      const alias = canonicalName(category, value);
      if (alias !== value) {
        try {
          // An explicit source definition takes precedence over a format alias.
          return resolver.resolve(category, value);
        } catch {
          return resolver.resolve(category, alias);
        }
      }
      return resolver.resolve(category, value);
    } catch (error) {
      report(sheet, row, column, String(error instanceof Error ? error.message : error), value);
      return null;
    }
  };
  const departmental: Values = { department_id: context.department.departmentId };

  const majorSheet = workbook.getWorksheet(definitions.major.name)!;
  const majors = new Map<string, MasterRecord>();
  for (let row = definitions.major.startRow; row <= majorSheet.rowCount; row++) {
    const name = text(majorSheet, row, definitions.major.nameColumn);
    if (!name) continue;
    const record = add(
      "m_major_processes",
      majorSheet,
      row,
      { major_process_name: name, order_no: row - definitions.major.startRow + 1 },
      { major_process_name: `A${row}` },
    );
    if (majors.has(name))
      report(majorSheet.name, row, "major_process_name", "大工程名称が重複しています。", name);
    else majors.set(name, record);
  }

  const optionSheet = workbook.getWorksheet(definitions.options.name)!;
  const optionRecords = new Map<string, MasterRecord>();
  const optionOrders = new Map<string, number>();
  for (let row = definitions.options.startRow; row <= optionSheet.rowCount; row++) {
    const name = text(optionSheet, row, definitions.options.columns.name),
      value = text(optionSheet, row, definitions.options.columns.value);
    if (!name && !value) continue;
    if (!name || !value) {
      report(
        optionSheet.name,
        row,
        "option_item_name",
        "選択肢名称と選択肢一覧の両方を入力してください。",
        value,
      );
      continue;
    }
    let parent = optionRecords.get(name);
    if (!parent) {
      parent = add(
        "m_options",
        optionSheet,
        row,
        { ...departmental, option_name: name },
        { option_name: `A${row}` },
      );
      optionRecords.set(name, parent);
    }
    const order = (optionOrders.get(name) ?? 0) + 1;
    optionOrders.set(name, order);
    add(
      "m_option_items",
      optionSheet,
      row,
      {
        ...departmental,
        option_id: ref(parent, "option_id"),
        option_item_name: value,
        order_no: order,
      },
      { option_id: `A${row}`, option_item_name: `B${row}` },
    );
  }

  const itemSheet = workbook.getWorksheet(definitions.items.name)!;
  const processes = new Map<number, MasterRecord>();
  const locationSheet = workbook.getWorksheet(definitions.locations.name)!;
  const locations = new Set<string>();
  for (let row = definitions.locations.startRow; row <= locationSheet.rowCount; row++) {
    // Formulas in unused template rows may produce -00-; no location data means no record.
    if (text(locationSheet, row, definitions.locations.columns.company))
      locations.add(text(locationSheet, row, definitions.locations.columns.code));
  }
  for (
    let col = definitions.items.processStartColumn;
    col <= definitions.items.processEndColumn;
    col++
  ) {
    const name = text(itemSheet, definitions.items.rows.process, col);
    const baseName = text(itemSheet, definitions.items.rows.baseProcess, col);
    if (!name && !baseName) continue;
    if (!name)
      report(
        itemSheet.name,
        definitions.items.rows.process,
        "process_name",
        "反映する工程名称がありません。",
        baseName,
      );
    const majorName = text(itemSheet, definitions.items.rows.major, col);
    const major = majors.get(majorName);
    if (!major)
      report(
        itemSheet.name,
        definitions.items.rows.major,
        "major_process_id",
        "大工程マトリクスに参照先がありません。",
        majorName,
      );
    const experimental = text(itemSheet, definitions.items.rows.experimental, col);
    if (experimental && !["実験工程", "実験", "1", "○", "〇"].includes(experimental))
      report(
        itemSheet.name,
        definitions.items.rows.experimental,
        "process_kbn",
        "実験工程の指定を確認してください。",
        experimental,
      );
    const location = text(itemSheet, definitions.items.rows.location, col);
    if (location && !locations.has(location))
      report(
        itemSheet.name,
        definitions.items.rows.location,
        "process_name",
        "帳票場所コードの参照先がありません。",
        location,
      );
    const values: Values = {
      ...departmental,
      process_name: name,
      major_process_id: major ? ref(major, "major_process_id") : null,
      process_kbn: code(
        "KBN_PROCESS",
        experimental ? "実験工程" : "通常工程",
        itemSheet.name,
        definitions.items.rows.experimental,
        "process_kbn",
      ),
      display_kbn: code(
        "KBN_DISPLAY",
        text(itemSheet, definitions.items.rows.display, col),
        itemSheet.name,
        definitions.items.rows.display,
        "display_kbn",
      ),
    };
    const record = add("m_processes", itemSheet, definitions.items.rows.process, values, {
      process_name: itemSheet.getCell(definitions.items.rows.process, col).address,
      major_process_id: itemSheet.getCell(definitions.items.rows.major, col).address,
      display_kbn: itemSheet.getCell(definitions.items.rows.display, col).address,
    });
    processes.set(col, record);
  }
  const itemNames = new Map<string, MasterRecord>();
  const unitSheet = workbook.getWorksheet(definitions.units.name)!;
  const units = new Set<string>();
  for (let row = definitions.units.startRow; row <= unitSheet.rowCount; row++) {
    const unit = text(unitSheet, row, definitions.units.nameColumn);
    if (unit) units.add(unit);
  }
  for (let row = definitions.items.startRow; row <= itemSheet.rowCount; row++) {
    const name = text(itemSheet, row, definitions.items.columns.name);
    const input = text(itemSheet, row, definitions.items.columns.input);
    const marks: Array<{ col: number; value: string }> = [];
    for (
      let col = definitions.items.processStartColumn;
      col <= definitions.items.processEndColumn;
      col++
    ) {
      const value = text(itemSheet, row, col);
      if (value) marks.push({ col, value });
    }
    const hasFields = [
      definitions.items.columns.description,
      definitions.items.columns.unit,
      definitions.items.columns.option,
    ].some((col) => text(itemSheet, row, col) !== "");
    if (!name && !input && !marks.length && !hasFields) continue;
    if (!name) {
      report(itemSheet.name, row, "item_name", "項目名称がありません。");
      continue;
    }
    let itemName = itemNames.get(name);
    if (!itemName) {
      itemName = add("m_item_names", itemSheet, row, { item_name: name }, { item_name: `A${row}` });
      itemNames.set(name, itemName);
    }
    const optionName = text(itemSheet, row, definitions.items.columns.option);
    const option = optionRecords.get(optionName);
    if (optionName && !option)
      report(
        itemSheet.name,
        row,
        "option_id",
        "選択肢マトリクスに参照先がありません。",
        optionName,
      );
    const inputType = code("KBN_INPUT_TYPE", input, itemSheet.name, row, "input_type");
    if (config.optionInputNames.includes(canonicalName("KBN_INPUT_TYPE", input)) && !option)
      report(
        itemSheet.name,
        row,
        "option_id",
        "選択肢入力タイプには選択肢名称が必要です。",
        optionName,
      );
    const unit = text(itemSheet, row, definitions.items.columns.unit);
    if (unit && units.size && !units.has(unit))
      report(itemSheet.name, row, "unit_kbn", "単位マトリクスに単位がありません。", unit);
    const item = add(
      "m_items",
      itemSheet,
      row,
      {
        ...departmental,
        item_name_id: ref(itemName, "item_name_id"),
        input_type: inputType,
        description: text(itemSheet, row, definitions.items.columns.description) || null,
        unit_kbn: unit ? code("KBN_UNIT", unit, itemSheet.name, row, "unit_kbn") : null,
        option_id: option ? ref(option, "option_id") : null,
      },
      {
        item_name_id: `A${row}`,
        description: `B${row}`,
        unit_kbn: `D${row}`,
        option_id: `E${row}`,
        input_type: `F${row}`,
      },
    );
    for (const mark of marks) {
      const flags = config.marks[mark.value];
      const process = processes.get(mark.col);
      if (!flags) {
        report(
          itemSheet.name,
          row,
          itemSheet.getCell(row, mark.col).address,
          "工程項目の記号が定義されていません。",
          mark.value,
        );
        continue;
      }
      if (!process) {
        report(
          itemSheet.name,
          row,
          "process_id",
          "工程項目がある列に工程名称がありません。",
          mark.value,
        );
        continue;
      }
      add(
        "r_process_items",
        itemSheet,
        row,
        {
          ...departmental,
          process_id: ref(process, "process_id"),
          item_id: ref(item, "item_id"),
          required_flg: flags[0],
          common_flg: flags[1],
          order_no: row - definitions.items.startRow + 1,
        },
        {
          required_flg: itemSheet.getCell(row, mark.col).address,
          common_flg: itemSheet.getCell(row, mark.col).address,
        },
      );
    }
  }

  const groupSheet = workbook.getWorksheet(definitions.groups.name)!;
  const groups = new Map<string, MasterRecord>();
  const sequences = new Map<string, Map<number, number>>();
  for (let row = definitions.groups.startRow; row <= groupSheet.rowCount; row++) {
    const name = text(groupSheet, row, definitions.groups.nameColumn);
    const orders: Array<{ order: number; col: number; process: MasterRecord }> = [];
    for (
      let col = definitions.groups.processStartColumn;
      col <= definitions.groups.processEndColumn;
      col++
    ) {
      const raw = text(groupSheet, row, col);
      if (!raw) continue;
      const process = processes.get(
        col - definitions.groups.processStartColumn + definitions.items.processStartColumn,
      );
      if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
        report(groupSheet.name, row, "order_no", "工程順は正の整数を指定してください。", raw);
        continue;
      }
      if (!process) {
        report(groupSheet.name, row, "process_id", "工程順がある列に工程名称がありません。", raw);
        continue;
      }
      orders.push({ order: Number(raw), col, process });
    }
    if (!name && !orders.length) continue;
    if (!name) {
      report(groupSheet.name, row, "process_group_name", "工程G名がありません。");
      continue;
    }
    if (!orders.length)
      report(groupSheet.name, row, "process_id", "工程Gに工程が指定されていません。", name);
    const group = add(
      "m_process_groups",
      groupSheet,
      row,
      { ...departmental, process_group_name: name },
      { process_group_name: `B${row}` },
    );
    if (groups.has(name))
      report(groupSheet.name, row, "process_group_name", "工程G名が重複しています。", name);
    else groups.set(name, group);
    orders.sort((a, b) => a.order - b.order);
    const seen = new Set<number>();
    const sequence = new Map<number, number>();
    for (let index = 0; index < orders.length; index++) {
      const current = orders[index]!;
      if (seen.has(current.order))
        report(
          groupSheet.name,
          row,
          "order_no",
          "同じ工程G内で工程順が重複しています。",
          current.order,
        );
      seen.add(current.order);
      // A logical name may repeat; the shared column position identifies the process.
      sequence.set(current.col - definitions.groups.processStartColumn, current.order);
      const previous = orders[index - 1]?.process;
      const fill = groupSheet.getCell(row, current.col).fill;
      let check: string | null = null;
      if (fill?.type === "pattern" && fill.pattern === "solid") {
        const color = fill.fgColor?.argb?.slice(-6).toUpperCase();
        if (color) check = config.checkColors[color] ?? null;
        else if ((fill.fgColor as { indexed?: number } | undefined)?.indexed === 10)
          check = "エラー";
        else if ((fill.fgColor as { indexed?: number } | undefined)?.indexed === 13) check = "警告";
        else if (fill.fgColor?.theme !== undefined)
          report(
            groupSheet.name,
            row,
            "prev_proc_check_kbn",
            "工程チェックの背景色を赤または黄色の標準色で指定してください。",
            fill.fgColor,
          );
      }
      add(
        "r_process_groups",
        groupSheet,
        row,
        {
          ...departmental,
          process_group_id: ref(group, "process_group_id"),
          process_id: ref(current.process, "process_id"),
          prev_process_id: previous ? ref(previous, "process_id") : null,
          order_no: current.order,
          prev_proc_check_kbn: check
            ? code("KBN_PREV_PROC_CHECK", check, groupSheet.name, row, "prev_proc_check_kbn")
            : null,
          final_process_flg: index === orders.length - 1,
        },
        {
          order_no: groupSheet.getCell(row, current.col).address,
          prev_proc_check_kbn: groupSheet.getCell(row, current.col).address,
        },
      );
    }
    if (!sequences.has(name)) sequences.set(name, sequence);
  }

  const productSheet = workbook.getWorksheet(definitions.products.name)!;
  const reportAttributeSheet = workbook.getWorksheet(definitions.reportAttributes.name)!;
  const reportAttributes = new Set<string>(config.reportAttributes);
  for (
    let row = definitions.reportAttributes.startRow;
    row <= reportAttributeSheet.rowCount;
    row++
  ) {
    const attribute = text(reportAttributeSheet, row, 1);
    if (attribute) reportAttributes.add(attribute);
  }
  const products = new Map<
    string,
    {
      record: MasterRecord;
      row: number;
      group: string;
      part: string;
      finalCheck: string;
      excluded: boolean;
    }
  >();
  const stack = new Map<number, { code: string; excluded: boolean }>();
  const childOrder = new Map<string, number>();
  for (let row = definitions.products.startRow; row <= productSheet.rowCount; row++) {
    const p = definitions.products.columns;
    const productCode = text(productSheet, row, p.code),
      name = text(productSheet, row, p.name);
    let hasOrders = false;
    productSheet.getRow(row).eachCell((cell) => {
      if (
        Number(cell.col) >= definitions.products.processStartColumn &&
        Number(cell.col) <= definitions.products.processEndColumn &&
        String(get(productSheet, row, Number(cell.col)) ?? "").trim()
      )
        hasOrders = true;
    });
    const hasProductFields =
      hasOrders ||
      [p.reportAttribute, p.parent, p.level, p.part, p.finalCheck, p.group].some(
        (col) => text(productSheet, row, col) !== "",
      );
    if (!productCode && !name && !hasProductFields) continue;
    if (!productCode || !name) {
      report(
        productSheet.name,
        row,
        !productCode ? "product_code" : "product_name",
        "品目コードと品名の両方を入力してください。",
      );
      continue;
    }
    const attribute = text(productSheet, row, p.reportAttribute);
    if (attribute && !reportAttributes.has(attribute))
      report(
        productSheet.name,
        row,
        "report_attribute",
        "帳票属性マトリクスに属性がありません。",
        attribute,
      );
    const excluded = attribute === "部門外管理品";
    const groupName = text(productSheet, row, p.group),
      part = text(productSheet, row, p.part),
      finalCheck = text(productSheet, row, p.finalCheck);
    const levelText = text(productSheet, row, p.level);
    const level = /^_*\d+_*$/.test(levelText) ? Number(levelText.replace(/_/g, "")) : NaN;
    if (!Number.isInteger(level) || level < 0) {
      report(
        productSheet.name,
        row,
        "parent_product_code",
        "階層が不正です。0 または 1____ 形式を指定してください。",
        levelText,
      );
      continue;
    }
    const parent = stack.get(level - 1);
    if (level > 0 && !parent)
      report(
        productSheet.name,
        row,
        "parent_product_code",
        "直前の上位階層がありません。",
        levelText,
      );
    const root = text(productSheet, row, p.parent);
    if ((level === 0 && root !== productCode) || (level > 0 && root !== stack.get(0)?.code))
      report(
        productSheet.name,
        row,
        "parent_product_code",
        "親品目コードが階層の最上位品目と一致しません。",
        root,
      );
    stack.set(level, { code: productCode, excluded });
    for (const depth of Array.from(stack.keys())) if (depth > level) stack.delete(depth);
    const previous = products.get(productCode);
    if (previous && previous.excluded !== excluded)
      report(
        productSheet.name,
        row,
        "product_code",
        "同じ品目コードで部門外管理品の指定が異なります。",
        productCode,
      );
    if (excluded) {
      if (!previous)
        products.set(productCode, {
          record: {
            id: "excluded",
            entity: "",
            targetTable: "",
            sourceSheet: productSheet.name,
            sourceRow: row,
            values: {},
            originalValues: {},
          },
          row,
          group: groupName,
          part,
          finalCheck,
          excluded,
        });
      continue;
    }
    if (previous) {
      previous.record.originalValues["sourceRows"] = [
        ...((previous.record.originalValues["sourceRows"] as number[] | undefined) ?? [
          previous.row,
        ]),
        row,
      ];
      if (
        previous.record.values["product_name"] !== name ||
        (groupName && previous.group !== groupName) ||
        (part && previous.part !== part) ||
        (finalCheck && previous.finalCheck !== finalCheck)
      )
        report(
          productSheet.name,
          row,
          "product_code",
          `書式の指定に従い、品目情報は最初の ${previous.row} 行を使用します。後続行の指定が異なります。`,
          productCode,
          "warning",
        );
    } else {
      const values: Values = {
        product_code: productCode,
        product_name: name,
        product_management_kbn: productManagementKbn,
      };
      const product = add("m_products", productSheet, row, values, {
        product_code: `F${row}`,
        product_name: `G${row}`,
      });
      products.set(productCode, {
        record: product,
        row,
        group: groupName,
        part,
        finalCheck,
        excluded,
      });
      if (groupName) {
        const group = groups.get(groupName);
        if (!group)
          report(
            productSheet.name,
            row,
            "process_group_id",
            "工程Gマトリクスに参照先がありません。",
            groupName,
          );
        add(
          "m_product_department_process_groups",
          productSheet,
          row,
          {
            ...departmental,
            product_code: productCode,
            process_group_id: group ? ref(group, "process_group_id") : null,
          },
          { product_code: `F${row}`, process_group_id: `J${row}` },
        );
        const expected = sequences.get(groupName);
        for (
          let col = definitions.products.processStartColumn;
          col <= definitions.products.processEndColumn;
          col++
        ) {
          const processName = text(productSheet, 1, col);
          if (!processName) continue;
          const actual = text(productSheet, row, col);
          const order = expected?.get(col - definitions.products.processStartColumn);
          if ((actual ? Number(actual) : undefined) !== order)
            report(
              productSheet.name,
              row,
              "process_group_id",
              `品目の工程順と工程Gの定義が一致しません (${processName})。`,
              actual,
            );
        }
      } else {
        if (hasOrders)
          report(
            productSheet.name,
            row,
            "process_group_id",
            "工程順が指定されていますが工程G名がありません。",
          );
      }
    }
    if (level > 0 && parent) {
      if (parent.excluded) {
        report(
          productSheet.name,
          row,
          "parent_product_code",
          "部門外管理品の下に取込対象品目があります。親子関係を確認してください。",
          parent.code,
        );
        continue;
      }
      const order = (childOrder.get(parent.code) ?? 0) + 1;
      childOrder.set(parent.code, order);
      const first = products.get(productCode)!;
      const partValue = first.part
        ? code("KBN_PART_TYPE", first.part, productSheet.name, row, "part_type_kbn")
        : null;
      const check = first.finalCheck
        ? code(
            "KBN_FINAL_PROC_CHECK",
            first.finalCheck,
            productSheet.name,
            row,
            "final_proc_check_kbn",
          )
        : null;
      const values: Values = {
        parent_product_code: parent.code,
        child_product_code: productCode,
        order_no: order,
        part_type_kbn: partValue,
        final_proc_check_kbn: check,
      };
      if (options.defaultQuantity) values["quantity"] = options.defaultQuantity;
      add("r_product_structures", productSheet, row, values, {
        parent_product_code: `E${row}`,
        child_product_code: `F${row}`,
        part_type_kbn: `H${row}`,
        final_proc_check_kbn: `I${row}`,
      });
    }
  }

  const permissionSheet = workbook.getWorksheet(definitions.permissions.name)!;
  const outputs = new Map<string, MasterRecord>();
  for (let row = definitions.permissions.startRow; row <= permissionSheet.rowCount; row++) {
    const cols = definitions.permissions.columns;
    const pattern = text(permissionSheet, row, cols.pattern),
      path = text(permissionSheet, row, cols.path);
    // Login/role columns describe user assignments, which are outside the conversion scope.
    if (!pattern && !path) continue;
    if (!pattern || !path) {
      report(
        permissionSheet.name,
        row,
        "csv_output_path",
        "帳票パターンと出力先の両方を入力してください。",
      );
      continue;
    }
    const patternId = code(
      "KBN_PRINT_PATTERN",
      pattern,
      permissionSheet.name,
      row,
      "report_pattern_id",
    );
    const key = `${patternId}\u0000${path}`;
    let output = outputs.get(key);
    if (!output) {
      output = add(
        "m_department_report_outputs",
        permissionSheet,
        row,
        { ...departmental, report_pattern_id: patternId, csv_output_path: path },
        { report_pattern_id: `C${row}`, csv_output_path: `D${row}` },
      );
      outputs.set(key, output);
    }
  }
  // Quantity is required only if a structure record actually needs a value and
  // the selected schema supplies no nullable/default/identity behavior.
  const quantity = definition
    .find((t) => t.name === "r_product_structures")
    ?.columns.find((c) => c.name === "quantity");
  if (
    !options.defaultQuantity &&
    data.some((record) => record.targetTable === "r_product_structures") &&
    (!quantity || (!quantity.nullable && !hasDefault(quantity) && !isAutoIncrement(quantity)))
  ) {
    configurationError(
      "defaultQuantity",
      "構成数量を設定してください。対象テーブルに使用できる既定値がありません。",
    );
    return { file, data: [], tables: [], totalRecords: 0, issues };
  }
  if (data.length === 0)
    report("マスタファイル", 0, "records", "取込対象のマスタデータがありません。");
  const tableNames = Array.from(new Set(data.map((record) => record.targetTable)));
  const tables = tableNames.map((name) => {
    const records = data.filter((record) => record.targetTable === name);
    const meta = definition.find((table) => table.name === name);
    return {
      name,
      sheet: Array.from(new Set(records.map((record) => record.sourceSheet))).join(" / "),
      records: records.length,
      pk:
        meta?.columns
          .filter((column) => column.pk)
          .map((column) => column.name)
          .join(" + ") ?? "",
      unique:
        meta?.indexes
          .filter((index) => index.type === "UNIQUE")
          .map((index) => index.columns.join(" + "))
          .join(", ") ?? "",
      status: "ok" as const,
    };
  });
  return { file, data, tables, totalRecords: data.length, issues };
}

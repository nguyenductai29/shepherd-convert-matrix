import type { SheetMapping } from "@/models";

/** Values the finalized workbook intentionally does not contain. They must be
 * confirmed in local settings; reference dictionaries are database reference
 * data, never user-defined Excel mappings. */
export interface ConversionOptions {
  departmentCode: string;
  departmentName: string;
  auditUserId: string;
  effectiveFrom: string;
  productManagementKbn: string;
  defaultQuantity: string;
  userIdByLogin: Record<string, string>;
  unitCodeByName: Record<string, string>;
  reportPatternIdByName: Record<string, string>;
}

export const EMPTY_CONVERSION_OPTIONS: ConversionOptions = {
  departmentCode: "",
  departmentName: "",
  auditUserId: "",
  effectiveFrom: "",
  productManagementKbn: "",
  defaultQuantity: "",
  userIdByLogin: {},
  unitCodeByName: {},
  reportPatternIdByName: {},
};

export const shepherdMasterDefinition = {
  version: "shepherd-matrix-2026-10",
  sheets: {
    major: { name: "大工程マトリクス", startRow: 2, nameColumn: 1, headers: { A1: "大工程名称" } },
    units: { name: "単位マトリクス", startRow: 2, nameColumn: 1, headers: { A1: "単位" } },
    reportAttributes: {
      name: "帳票属性マトリクス",
      startRow: 2,
      headers: { A1: "属性", B1: "帳票有無", I1: "帳票パターン" },
    },
    products: {
      name: "1_6_品目構成マトリクス",
      startRow: 2,
      columns: {
        line: 1,
        reportAttribute: 2,
        parent: 4,
        level: 5,
        code: 6,
        name: 7,
        part: 8,
        finalCheck: 9,
        group: 10,
      },
      processStartColumn: 11,
      processEndColumn: 110,
      helperColumn: 111,
      headers: {
        A1: "行番号",
        B1: "⑥帳票属性",
        D1: "①親品目コード",
        E1: "①階層",
        F1: "①品目コード",
        G1: "①品名",
        H1: "①部品種別",
        I1: "⑥最終工程完了チェック",
        J1: "⑥工程G名",
      },
    },
    items: {
      name: "2_3_4_8_工程項目マトリクス",
      startRow: 8,
      processStartColumn: 7,
      processEndColumn: 106,
      rows: { process: 2, location: 3, baseProcess: 4, experimental: 5, major: 6, display: 7 },
      columns: { name: 1, description: 2, review: 3, unit: 4, option: 5, input: 6 },
      headers: {
        F3: "④部材割当系工程の帳票場所コード→",
        F4: "②工程名称",
        F5: "②実験工程の場合は入力→",
        F6: "②大工程名→",
        A7: "↓②項目名称",
        B7: "↓②説明",
        D7: "↓②単位",
        E7: "↓③選択肢名称",
        F7: "↓②入力タイプ　　　　　　　　②表示区分→",
      },
    },
    options: {
      name: "3_選択肢マトリクス",
      startRow: 2,
      columns: { name: 1, value: 2 },
      headers: { A1: "選択肢名称", B1: "選択肢一覧" },
    },
    locations: {
      name: "4_10_帳票場所マトリクス",
      startRow: 2,
      columns: { code: 1, company: 2, building: 3, floor: 4, printer: 5, ip: 6 },
      headers: {
        A1: "④帳票場所コード",
        B1: "④会社",
        F1: "④プリンターIPアドレス",
        J1: "※レビューのためのマトリクスです。",
      },
    },
    groups: {
      name: "5_9_工程Gマトリクス",
      startRow: 4,
      nameColumn: 2,
      processStartColumn: 3,
      processEndColumn: 102,
      rows: { display: 2, process: 3 },
      headers: { B2: "表示区分", B3: "工程G名" },
    },
    permissions: {
      name: "7_権限&帳票出力先マトリクス",
      startRow: 2,
      columns: { login: 1, name: 2, pattern: 3, path: 4, role: 5 },
      headers: {
        A1: "ログインID",
        B1: "ユーザー名称（レビュー項目)",
        C1: "帳票パターン",
        D1: "出力先",
        E1: "役割",
        F1: "警告",
      },
    },
  },
  inputTypes: {
    "直接入力(文字列)": 0,
    "直接入力(数値)": 1,
    カレンダー入力: 2,
    "選択肢(コンボボックス 編集可)": 3,
    "選択肢(コンボボックス 編集不可)": 4,
    "選択肢(コンボボックス)(編集可)": 3,
    "選択肢(コンボボックス)(編集不可)": 4,
    "選択肢(ラジオボタン)": 5,
    "選択肢(チェックボックス)": 6,
    "人員マスタ(編集可)": 7,
    "人員マスタ(編集不可)": 8,
  } as Record<string, number>,
  displayTypes: {
    個別入力: "0",
    "1つずつ": "0",
    まとめて: "1",
    複数入力: "1",
    組立: "2",
    部材割当: "2",
    シリアル組立: "3",
    シリアル部材割当: "3",
  } as Record<string, string>,
  marks: {
    "○": [true, false],
    〇: [true, false],
    "◯": [true, false],
    "□": [true, true],
    "●": [false, false],
    "■": [false, true],
  } as Record<string, readonly [boolean, boolean]>,
  roles: { システム管理者: "0", 管理者: "1", "作業者(HPK)": "2", "作業者(子会社)": "3" } as Record<
    string,
    string
  >,
  checks: { エラー: "ERROR", 警告: "WARNING", ERROR: "ERROR", WARNING: "WARNING" } as Record<
    string,
    string
  >,
  // Confirmed m_kbn_definition codes, not row numbers from 単位マトリクス.
  unitCodes: {
    個: "1",
    kV: "2",
    "A/W": "3",
    lm: "4",
    sccm: "5",
    kg: "6",
    g: "7",
    mm: "8",
    μm: "9",
    "℃": "10",
    Pa: "11",
    "Pa・m³/s": "12",
    nA: "13",
  } as Record<string, string>,
  reportPatternIds: { 実績系: "IF0016", Lot統合系: "IF0018", 分解系: "IF0019" } as Record<
    string,
    string
  >,
  reportAttributes: ["部門外管理品", "帳票無し", "加工品_帳票有り", "調達部材_帳票有り"],
  // The fixed workbook's VBA marks previous-process errors red and warnings yellow.
  checkColors: { FF0000: "ERROR", FFFF00: "WARNING" } as Record<string, string>,
} as const;

export const SHEPHERD_TABLE_ORDER = [
  "m_departments",
  "m_major_processes",
  "m_item_names",
  "m_options",
  "m_option_items",
  "m_processes",
  "m_process_groups",
  "m_products",
  "m_items",
  "r_process_items",
  "r_process_groups",
  "m_product_department_process_groups",
  "r_product_structures",
  "r_authority",
  "m_department_report_outputs",
  "r_user_report_outputs",
] as const;

export const SHEPHERD_SHEET_MAX_COLUMNS: Record<string, number> = {
  [shepherdMasterDefinition.sheets.major.name]: 1,
  [shepherdMasterDefinition.sheets.units.name]: 1,
  [shepherdMasterDefinition.sheets.reportAttributes.name]: 9,
  [shepherdMasterDefinition.sheets.products.name]: 111,
  [shepherdMasterDefinition.sheets.items.name]: 106,
  [shepherdMasterDefinition.sheets.options.name]: 2,
  [shepherdMasterDefinition.sheets.locations.name]: 10,
  [shepherdMasterDefinition.sheets.groups.name]: 102,
  [shepherdMasterDefinition.sheets.permissions.name]: 6,
};

const sheets = shepherdMasterDefinition.sheets;
export const sheetMappings: SheetMapping[] = [
  {
    sheet: "変換設定",
    table: "m_departments",
    mappings: [
      { excel: "部門コード", column: "department_code" },
      { excel: "部門名", column: "department_name" },
    ],
  },
  {
    sheet: sheets.major.name,
    table: "m_major_processes",
    mappings: [
      { excel: "A2以降: 大工程名称", column: "major_process_name" },
      { excel: "行順", column: "order_no" },
    ],
  },
  {
    sheet: sheets.items.name,
    table: "m_processes",
    mappings: [
      { excel: "G2:DB2", column: "process_name" },
      { excel: "G6:DB6", column: "major_process_id", note: "大工程マスタ参照" },
      { excel: "G5:DB5", column: "process_kbn" },
      { excel: "G7:DB7", column: "display_kbn" },
    ],
  },
  {
    sheet: sheets.items.name,
    table: "m_item_names",
    mappings: [{ excel: "A8以降: 項目名称", column: "item_name" }],
  },
  {
    sheet: sheets.items.name,
    table: "m_items",
    mappings: [
      { excel: "A列", column: "item_name_id" },
      { excel: "B列", column: "description" },
      { excel: "D列", column: "unit_kbn" },
      { excel: "E列", column: "option_id" },
      { excel: "F列", column: "input_type" },
    ],
  },
  {
    sheet: sheets.items.name,
    table: "r_process_items",
    mappings: [
      { excel: "G8:DB最終行 (○/〇/□/●/■)", column: "process_id + item_id" },
      { excel: "○/〇/□", column: "required_flg" },
      { excel: "□/■", column: "common_flg" },
    ],
  },
  {
    sheet: sheets.options.name,
    table: "m_options",
    mappings: [{ excel: "A列: 選択肢名称", column: "option_name" }],
  },
  {
    sheet: sheets.options.name,
    table: "m_option_items",
    mappings: [
      { excel: "A列", column: "option_id" },
      { excel: "B列: 選択肢一覧", column: "option_item_name" },
      { excel: "同じ選択肢内の行順", column: "order_no" },
    ],
  },
  {
    sheet: sheets.groups.name,
    table: "m_process_groups",
    mappings: [{ excel: "B4以降", column: "process_group_name" }],
  },
  {
    sheet: sheets.groups.name,
    table: "r_process_groups",
    mappings: [
      { excel: "C4:CX最終行", column: "order_no" },
      { excel: "同じグループの直前工程", column: "prev_process_id" },
      { excel: "赤/黄の背景色", column: "prev_proc_check_kbn" },
      { excel: "最大工程順", column: "final_process_flg" },
    ],
  },
  {
    sheet: sheets.products.name,
    table: "m_products",
    mappings: [
      { excel: "F列", column: "product_code" },
      {
        excel: "G列",
        column: "product_name",
        note: "繰り返し品目は書式の指定どおり最初の行を使用",
      },
    ],
  },
  {
    sheet: sheets.products.name,
    table: "m_product_department_process_groups",
    mappings: [
      { excel: "F列", column: "product_code" },
      { excel: "J列", column: "process_group_id" },
    ],
  },
  {
    sheet: sheets.products.name,
    table: "r_product_structures",
    mappings: [
      { excel: "D/E列の親・階層", column: "parent_product_code" },
      { excel: "F列", column: "child_product_code" },
      { excel: "H列", column: "part_type_kbn" },
      { excel: "I列", column: "final_proc_check_kbn" },
      { excel: "確認済み変換設定", column: "quantity" },
    ],
  },
  {
    sheet: sheets.permissions.name,
    table: "r_authority",
    mappings: [
      { excel: "A列: ログインID", column: "user_id", note: "ローカル参照ID設定で解決" },
      { excel: "E列: 役割", column: "role_kbn" },
    ],
  },
  {
    sheet: sheets.permissions.name,
    table: "m_department_report_outputs",
    mappings: [
      { excel: "C列", column: "report_pattern_id" },
      { excel: "D列", column: "csv_output_path" },
    ],
  },
  {
    sheet: sheets.permissions.name,
    table: "r_user_report_outputs",
    mappings: [
      { excel: "A列", column: "user_id" },
      { excel: "C/D列", column: "dept_output_id" },
    ],
  },
];

import type { KbnDefinition } from "@/models/kbn";

// Representative test data only. Production always loads the user's local source.
export const kbnFixture: KbnDefinition[] = Object.entries({
  KBN_PRODUCT_MANAGEMENT: { SAP: "0", Shepherd: "1" },
  KBN_PROCESS: { 通常工程: "0", 実験工程: "1" },
  KBN_INPUT_TYPE: {
    "直接入力(文字列)": "0",
    "直接入力(数値)": "1",
    カレンダー入力: "2",
    "選択肢(コンボボックス)(編集可)": "3",
    "選択肢(コンボボックス)(編集不可)": "4",
    "選択肢(ラジオボタン)": "5",
    "選択肢(チェックボックス)": "6",
    "人員マスタ(編集可)": "7",
    "人員マスタ(編集不可)": "8",
  },
  KBN_DISPLAY: { 個別入力: "0", 複数入力: "1", 部材割当: "2", シリアル部材割当: "3" },
  KBN_UNIT: { 個: "1", kV: "2" },
  KBN_PART_TYPE: { 主要部品: "0" },
  KBN_PREV_PROC_CHECK: { エラー: "ERROR", 警告: "WARNING" },
  KBN_FINAL_PROC_CHECK: { エラー: "ERROR", 警告: "WARNING" },
  KBN_ROLE: { システム管理者: "0", 管理者: "1", "作業者(HPK)": "2", "作業者(子会社)": "3" },
  KBN_PRINT_PATTERN: { 実績系: "IF0016", Lot統合系: "IF0018", 分解系: "IF0019" },
}).flatMap(([category_kbn_code, entries]) =>
  Object.entries(entries).map(([kbn_name, kbn_value]) => ({
    category_kbn_code,
    kbn_name,
    kbn_value,
    order_no: 0,
    invalid_flg: false,
  })),
);

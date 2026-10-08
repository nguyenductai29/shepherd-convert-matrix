import ExcelJS from "exceljs";
import {
  EMPTY_CONVERSION_OPTIONS,
  shepherdMasterDefinition,
  type ConversionOptions,
} from "@/config/shepherd-master";
import { kbnFixture } from "./kbn-definitions";

export const masterFixtureOptions: ConversionOptions = {
  ...EMPTY_CONVERSION_OPTIONS,
  departmentReferences: [
    {
      departmentId: 123,
      departmentCode: "35",
      departmentName: "35部門",
      editCtrlKbn: "0",
      invalidFlg: false,
    },
  ],
  defaultQuantity: "1",
  kbnDefinitions: kbnFixture,
};
export function masterFixture() {
  const wb = new ExcelJS.Workbook();
  for (const definition of Object.values(shepherdMasterDefinition.sheets)) {
    const sheet = wb.addWorksheet(definition.name);
    for (const [address, value] of Object.entries(definition.headers))
      sheet.getCell(address).value = value;
  }
  const s = shepherdMasterDefinition.sheets;
  wb.getWorksheet(s.major.name)!.getCell("A2").value = "検査";
  const item = wb.getWorksheet(s.items.name)!;
  item.getCell("G2").value = "電気検査";
  item.getCell("G4").value = "電気検査";
  item.getCell("G6").value = "検査";
  item.getCell("G7").value = "個別入力";
  item.getRow(8).values = ["検査値", "説明", null, "kV", null, "直接入力(数値)", "□"];
  const group = wb.getWorksheet(s.groups.name)!;
  group.getCell("C2").value = "個別入力";
  group.getCell("C3").value = "電気検査";
  group.getCell("B4").value = "検査工程";
  group.getCell("C4").value = 1;
  const product = wb.getWorksheet(s.products.name)!;
  product.getCell("K1").value = "電気検査";
  product.getRow(2).values = [
    1,
    "帳票無し",
    null,
    "A100",
    0,
    "A100",
    "試験品",
    null,
    null,
    "検査工程",
    1,
  ];
  product.getRow(3).values = [
    2,
    "帳票無し",
    null,
    "A100",
    "1____",
    "B100",
    "子品目",
    "主要部品",
    null,
    "検査工程",
    1,
  ];
  return wb;
}

import { describe, expect, it } from "vitest";
import type { DepartmentRow } from "@/models/references";
import type { KbnDefinition } from "@/models/kbn";
import { buildConversionContext } from "./conversion-context";

const departments: DepartmentRow[] = [
  {
    departmentId: 123,
    departmentCode: "HPK",
    departmentName: "製造部門",
    editCtrlKbn: "0",
    invalidFlg: false,
  },
];
const kbn: KbnDefinition[] = [
  {
    category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
    kbn_name: "Shepherd",
    kbn_value: "1",
    order_no: 0,
    invalid_flg: false,
  },
];
const name = "HPK_Shepherd導入_マスタ整備ファイル.xlsm";

describe("conversion reference context", () => {
  it("supplies audit and local-calendar defaults alongside the resolved department and KBN value", () => {
    const result = buildConversionContext(name, departments, kbn, new Date(2026, 9, 8, 0, 1));
    expect(result.department.departmentId).toBe(123);
    expect(result.auditUserId).toBe(1);
    expect(result.effectiveFrom).toBe("2026-10-08");
    expect(result.effectiveTo).toBe("9999-12-31");
    expect(result.productManagementKbn).toBe("1");
    expect(result.kbnResolver.resolve("KBN_PRODUCT_MANAGEMENT", "Shepherd")).toBe("1");
  });

  it("resolves the provided KBN value instead of hard-coding 1", () => {
    const result = buildConversionContext(name, departments, [{ ...kbn[0]!, kbn_value: "SH" }]);
    expect(result.productManagementKbn).toBe("SH");
  });

  it("blocks before parsing if the filename, department or KBN definition is unresolved", () => {
    expect(() => buildConversionContext("invalid.xlsm", departments, kbn)).toThrow(
      "ファイル名がShepherdマスタの命名規則と一致しません。",
    );
    expect(() => buildConversionContext(name, [], kbn)).toThrow("部門コードに対応");
    expect(() => buildConversionContext(name, departments, [])).toThrow("KBN_PRODUCT_MANAGEMENT");
  });

  it("rejects an invalid execution date instead of injecting an invalid SQL date", () => {
    expect(() => buildConversionContext(name, departments, kbn, new Date("bad"))).toThrow("日付");
  });
});

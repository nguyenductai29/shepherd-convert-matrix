import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelectedFile } from "@/models";
import { masterFixture, masterFixtureOptions } from "@/test/fixtures/master-workbook";
import { shepherdMasterDefinition } from "@/config/shepherd-master";
import { parseMaster } from "./master-parser";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";
import { buildConversionContext } from "./conversion-context";

const file: SelectedFile = {
  kind: "master",
  name: "35_Shepherd導入_マスタ整備ファイル.xlsm",
  path: null,
  extension: "xlsm",
  size: null,
};
const options = {
  ...masterFixtureOptions,
  departmentReferences: [
    {
      departmentId: 123,
      departmentCode: "35",
      departmentName: "確認済み部門",
      editCtrlKbn: "0",
      invalidFlg: false,
    },
  ],
};
afterEach(() => vi.useRealTimers());

describe("department reference conversion boundary", () => {
  it("uses the existing numeric department ID without creating a department record", () => {
    const parsed = parseMaster(masterFixture(), file, [], options);
    expect(parsed.issues?.filter((item) => item.severity === "error")).toEqual([]);
    expect(parsed.data.some((record) => record.targetTable === "m_departments")).toBe(false);
    const scoped = parsed.data.filter((record) => "department_id" in record.values);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((record) => record.values["department_id"] === 123)).toBe(true);
  });

  it.each(["master.xlsm", "部門コード_Shepherd導入_マスタ整備ファイル.xlsm"])(
    "blocks invalid/template filename %s before records exist",
    (name) => {
      const parsed = parseMaster(masterFixture(), { ...file, name }, [], options);
      expect(parsed.data).toEqual([]);
      expect(
        parsed.issues?.some(
          (item) => item.severity === "error" && item.message.includes("マスタファイル名"),
        ),
      ).toBe(true);
      expect(() =>
        generateSql(parsed, { file, tables: [] }, { sqlComments: true, sqlTransaction: true }),
      ).toThrow();
    },
  );

  it("blocks a missing department once without cascading record-level errors", () => {
    const parsed = parseMaster(masterFixture(), file, [], { ...options, departmentReferences: [] });
    expect(parsed.data).toEqual([]);
    const validation = validateMaster(parsed, { file, tables: [] });
    expect(validation.errorCount).toBe(1);
    expect(validation.items[0]?.message).toContain("部門コードに対応する部署が見つかりません。");
  });

  it("excludes user-specific data while retaining department report-output masters", () => {
    const wb = masterFixture();
    wb.getWorksheet(shepherdMasterDefinition.sheets.permissions.name)!.getRow(2).values = [
      "unresolved-login",
      "作業者",
      "実績系",
      "C:/reports",
      "unknown-role",
    ];
    const parsed = parseMaster(wb, file, [], options);
    expect(parsed.issues?.filter((item) => item.severity === "error")).toEqual([]);
    expect(
      parsed.data.some((record) =>
        ["r_authority", "r_user_report_outputs"].includes(record.targetTable),
      ),
    ).toBe(false);
    expect(
      parsed.data.find((record) => record.targetTable === "m_department_report_outputs")?.values,
    ).toMatchObject({ department_id: 123, report_pattern_id: "IF0016" });
  });

  it.each(["m_departments", "r_authority", "r_user_report_outputs"])(
    "blocks %s INSERTs even if a caller supplies a manufactured normalized record",
    (targetTable) => {
      const parsed = {
        file,
        totalRecords: 1,
        tables: [],
        data: [
          {
            id: "dept",
            entity: "部門",
            targetTable,
            sourceSheet: "external",
            sourceRow: 1,
            values: { department_id: 123 },
            originalValues: {},
          },
        ],
      };
      const definition = {
        file,
        tables: [
          {
            name: targetTable,
            logical: "部門",
            columns: [{ name: "department_id", logical: "ID", type: "int", nullable: false }],
            indexes: [],
          },
        ],
      };
      expect(() =>
        generateSql(parsed, definition, { sqlComments: true, sqlTransaction: true }),
      ).toThrow(targetTable);
    },
  );
  it("keeps the preflight local date when worker parsing crosses midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59));
    const resolved = buildConversionContext(
      file.name,
      options.departmentReferences,
      options.kbnDefinitions,
    );
    const snapshot = {
      department: resolved.department,
      auditUserId: resolved.auditUserId,
      effectiveFrom: resolved.effectiveFrom,
      effectiveTo: resolved.effectiveTo,
      productManagementKbn: resolved.productManagementKbn,
    };
    vi.setSystemTime(new Date(2026, 9, 9, 0, 1));
    const parsed = parseMaster(
      masterFixture(),
      file,
      [
        {
          name: "m_products",
          logical: "製品",
          indexes: [],
          columns: [{ name: "effective_from", logical: "開始日", type: "date", nullable: false }],
        },
      ],
      options,
      snapshot,
    );
    expect(
      parsed.data.find((record) => record.targetTable === "m_products")?.values["effective_from"],
    ).toBe("2026-10-08");
  });
});

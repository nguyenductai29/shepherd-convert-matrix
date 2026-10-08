import ExcelJS from "exceljs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

describe("reference worker boundary", () => {
  beforeAll(async () => {
    await import("./processing.worker");
  });
  afterEach(() => vi.restoreAllMocks());

  it("loads the XLSX KBN reference through the worker operation", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("区分").addRows([
      ["category_kbn_code", "kbn_value", "kbn_name", "order_no", "invalid_flg"],
      ["KBN_PRODUCT_MANAGEMENT", 1, "Shepherd", 1, 0],
    ]);
    const post = vi.spyOn(self, "postMessage").mockImplementation(() => undefined);
    await self.onmessage!(
      new MessageEvent("message", {
        data: {
          operation: "kbn-definition",
          payload: {
            file: {
              kind: "kbnDefinition",
              name: "区分.xlsx",
              extension: ".xlsx",
              path: null,
              size: 1,
            },
          },
          buffer: await workbook.xlsx.writeBuffer(),
        },
      }),
    );
    expect(post).toHaveBeenCalledWith({
      result: [
        {
          category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
          kbn_value: "1",
          kbn_name: "Shepherd",
          order_no: 1,
          invalid_flg: false,
        },
      ],
    });
  });

  it("rejects a legacy JSON source even when its rows would otherwise parse", async () => {
    const post = vi.spyOn(self, "postMessage").mockImplementation(() => undefined);
    await self.onmessage!(
      new MessageEvent("message", {
        data: {
          operation: "kbn-definition",
          payload: {
            file: {
              kind: "kbnDefinition",
              name: "区分.json",
              extension: ".json",
              path: null,
              size: 1,
            },
          },
          buffer: new TextEncoder().encode(
            '[{"category_kbn_code":"KBN_UNIT","kbn_value":"1","kbn_name":"個","order_no":1,"invalid_flg":false}]',
          ).buffer,
        },
      }),
    );
    expect(post).toHaveBeenCalledWith({ error: expect.stringContaining("xlsx") });
  });
});

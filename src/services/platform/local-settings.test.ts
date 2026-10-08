import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, loadSettings, updateSettings } from "./local-settings";

describe("local settings persistence", () => {
  beforeEach(() => localStorage.clear());

  it("enables transactions and comments and persists settings across loads", async () => {
    expect((await loadSettings()).sqlTransaction).toBe(true);
    expect((await loadSettings()).sqlComments).toBe(true);
    await updateSettings({ sqlTransaction: false, theme: "dark", lastMasterDirectory: "C:\\部門" });
    expect(await loadSettings()).toMatchObject({
      sqlTransaction: false,
      sqlComments: true,
      theme: "dark",
      lastMasterDirectory: "C:\\部門",
    });
  });

  it("recovers from corrupt settings and rejects unsupported settings values", async () => {
    localStorage.setItem("shepherd-local-settings", "not json");
    expect(await loadSettings()).toEqual(defaultSettings);
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        sqlTransaction: "false",
        outputEncoding: "Shift_JIS",
        theme: "bad",
        lastMasterDirectory: 9,
      }),
    );
    expect(await loadSettings()).toEqual(defaultSettings);
  });

  it("preserves both patches when changes are saved concurrently", async () => {
    await Promise.all([updateSettings({ sqlComments: false }), updateSettings({ theme: "dark" })]);
    expect(await loadSettings()).toMatchObject({ sqlComments: false, theme: "dark" });
  });

  it("retains confirmed customer values and safely validates user reference dictionaries", async () => {
    await updateSettings({
      departmentCode: "HPK",
      departmentName: "製造部門",
      defaultQuantity: "1.5",
      userIdByLogin: { tai: "123" },
    });
    expect(await loadSettings()).toMatchObject({
      departmentCode: "HPK",
      departmentName: "製造部門",
      defaultQuantity: "1.5",
      userIdByLogin: { tai: "123" },
    });
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({ userIdByLogin: { tai: "123", invalid: 2 } }),
    );
    expect((await loadSettings()).userIdByLogin).toEqual({ tai: "123" });
  });

  it("persists a validated KBN snapshot and its local source across reloads", async () => {
    const kbnDefinitions = [
      { category_kbn_code: "KBN_PRODUCT_MANAGEMENT", kbn_name: "Shepherd", kbn_value: "7" },
    ];
    const kbnSource = {
      name: "区分.json",
      path: "C:\\定義\\区分.json",
      loadedAt: "2026-10-10T00:00:00.000Z",
    };
    await updateSettings({ kbnDefinitions, kbnSource });
    expect(await loadSettings()).toMatchObject({ kbnDefinitions, kbnSource });
  });

  it("ignores obsolete audit, date and KBN overrides instead of restoring guesses", async () => {
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        auditUserId: "999",
        effectiveFrom: "2000-01-01",
        productManagementKbn: "999",
        unitCodeByName: { "%": "999" },
        reportPatternIdByName: { 部材割当系: "999" },
      }),
    );
    expect(await loadSettings()).toEqual(defaultSettings);
  });

  it("rejects a corrupt persisted KBN snapshot while retaining its source for explicit reload", async () => {
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        departmentCode: "CUSTOMER",
        kbnDefinitions: [{ category_kbn_code: "KBN_UNIT", kbn_name: "%" }],
        kbnSource: {
          name: "区分.json",
          path: "C:\\区分.json",
          loadedAt: "2026-10-10T00:00:00.000Z",
        },
      }),
    );
    expect(await loadSettings()).toMatchObject({
      departmentCode: "CUSTOMER",
      kbnDefinitions: [],
      kbnSource: { name: "区分.json", path: "C:\\区分.json" },
      kbnSourceError: expect.stringContaining("再読込"),
    });
    await updateSettings({ sqlComments: false });
    expect((await loadSettings()).kbnSourceError).toContain("再読込");
    await updateSettings({
      kbnDefinitions: [{ category_kbn_code: "KBN_UNIT", kbn_name: "個", kbn_value: "8" }],
      kbnSourceError: null,
    });
    expect((await loadSettings()).kbnSourceError).toBeNull();
  });
});

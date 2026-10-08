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

  it("retains explicit Shepherd values and safely validates reference dictionaries", async () => {
    await updateSettings({
      departmentCode: "HPK",
      effectiveFrom: "2026-10-08",
      userIdByLogin: { tai: "123" },
      reportPatternIdByName: { 日報: "R01" },
    });
    expect(await loadSettings()).toMatchObject({
      departmentCode: "HPK",
      effectiveFrom: "2026-10-08",
      userIdByLogin: { tai: "123" },
      reportPatternIdByName: { 日報: "R01" },
    });
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({ unitCodeByName: { kg: "01", invalid: 2 } }),
    );
    expect((await loadSettings()).unitCodeByName).toEqual({ kg: "01" });
  });
});

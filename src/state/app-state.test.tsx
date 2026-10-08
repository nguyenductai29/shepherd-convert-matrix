import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "./app-state";
import { invalidateConversion } from "@/features/conversion/run-conversion";

vi.mock("@/features/conversion/run-conversion", () => ({ invalidateConversion: vi.fn() }));
vi.mock("@/services/platform/history", () => ({ listHistory: async () => [] }));
vi.mock("@/services", () => ({
  services: { tableDefinition: { load: async (file: unknown) => ({ file, tables: [] }) } },
}));

let state: ReturnType<typeof useAppState>;
function Probe() {
  state = useAppState();
  return null;
}

describe("conversion input boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("clears generated SQL and invalidates pending conversions when KBN definitions change", async () => {
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    act(() =>
      state.patchConversion({
        conversionStatus: "completed",
        generatedSql: {
          generatedSql: "INSERT INTO m_products VALUES (1);",
          targetDb: "MySQL",
          generatedAt: "2026-10-10",
        },
      }),
    );
    act(() =>
      state.setSettings({
        ...state.settings,
        kbnDefinitions: [
          { category_kbn_code: "KBN_PRODUCT_MANAGEMENT", kbn_name: "Shepherd", kbn_value: "7" },
        ],
        kbnSource: { name: "区分.json", path: null, loadedAt: "2026-10-10T00:00:00.000Z" },
      }),
    );
    await waitFor(() => expect(state.conversion.generatedSql).toBeNull());
    expect(invalidateConversion).toHaveBeenCalledTimes(1);
  });

  it("prevents a KBN file from replacing a selected conversion workbook", async () => {
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    act(() =>
      state.setFile(
        { kind: "kbnDefinition", name: "区分.json", path: null, extension: ".json", size: 10 },
        "tableDefinition",
      ),
    );
    expect(state.conversion.tableDefinitionFile).toBeNull();
    expect(invalidateConversion).not.toHaveBeenCalled();
  });

  it("keeps a stored KBN diagnostic after schema loading and clears it after a valid reload", async () => {
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({ kbnDefinitions: [{ invalid: true }] }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    expect(state.startupError).toContain("KBN定義");
    await act(async () =>
      state.setFile(
        { kind: "tableDefinition", name: "定義.xlsx", path: null, extension: ".xlsx", size: 10 },
        "tableDefinition",
      ),
    );
    expect(state.startupError).toContain("KBN定義");
    act(() =>
      state.setSettings({
        ...state.settings,
        kbnDefinitions: [
          { category_kbn_code: "KBN_PRODUCT_MANAGEMENT", kbn_name: "Shepherd", kbn_value: "7" },
        ],
        kbnSourceError: null,
      }),
    );
    expect(state.startupError).toBeNull();
  });
});

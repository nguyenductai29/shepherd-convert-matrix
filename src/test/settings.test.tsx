import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "@/state/app-state";
import { loadSettings, updateSettings } from "@/services/platform/local-settings";
import { Route } from "@/routes/settings";
import { services } from "@/services";
import { parseKbnDefinitions } from "@/services/processing/kbn-resolver";
import { readSelectedFile } from "@/services/platform/files";
import type { KbnDefinition } from "@/models/kbn";
import { invalidateConversion } from "@/features/conversion/run-conversion";
import { toast } from "sonner";

const nativeSettings = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  pauseNextSave: false,
  finishSave: null as (() => void) | null,
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    entries: async () => [...nativeSettings.values],
    set: async (key: string, value: unknown) => {
      nativeSettings.values.set(key, value);
    },
    save: async () => {
      if (!nativeSettings.pauseNextSave) return;
      nativeSettings.pauseNextSave = false;
      await new Promise<void>((resolve) => {
        nativeSettings.finishSave = resolve;
      });
    },
  }),
}));

vi.mock("@/services", () => ({ services: { kbnDefinition: { load: vi.fn() } } }));
vi.mock("@/services/platform/history", () => ({ listHistory: async () => [] }));
vi.mock("@/features/conversion/run-conversion", () => ({
  PROCESSING: [],
  invalidateConversion: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const Settings = Route.options.component!;
let state: ReturnType<typeof useAppState>;
function Probe() {
  state = useAppState();
  return null;
}
const rows = [
  { category_kbn_code: "KBN_PRODUCT_MANAGEMENT", kbn_name: "Shepherd", kbn_value: "7" },
];

describe("local KBN settings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    nativeSettings.values.clear();
    nativeSettings.pauseNextSave = false;
    nativeSettings.finishSave = null;
    vi.mocked(services.kbnDefinition.load).mockImplementation(async (file) =>
      parseKbnDefinitions(JSON.parse(new TextDecoder().decode(await readSelectedFile(file)))),
    );
  });
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  const openSettings = async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <AppStateProvider>
          <Settings />
          <Probe />
        </AppStateProvider>,
      );
    });
    return view;
  };
  const selectFile = (contents: string) =>
    fireEvent.change(screen.getByLabelText("KBN定義ファイル"), {
      target: { files: [new File([contents], "区分.json")] },
    });

  it("loads and persists a real browser JSON snapshot while preserving unsaved department input", async () => {
    await openSettings();
    const requiredInputs = screen.getAllByPlaceholderText("必須");
    fireEvent.change(requiredInputs[0]!, { target: { value: "CUSTOMER" } });
    selectFile(JSON.stringify(rows));
    await waitFor(() => expect(screen.getByDisplayValue("Shepherd → 7")).toBeInTheDocument());
    expect(await loadSettings()).toMatchObject({
      kbnDefinitions: rows,
      kbnSource: { name: "区分.json", path: null },
    });
    expect(screen.getByDisplayValue("CUSTOMER")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1（自動設定）")).toHaveAttribute("readonly");
  });

  it("retains the prior definitions and source when a new source is invalid", async () => {
    await openSettings();
    selectFile(JSON.stringify(rows));
    await waitFor(() => expect(screen.getByDisplayValue("Shepherd → 7")).toBeInTheDocument());
    selectFile('{"invalid":true}');
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "KBN定義を選択" })).toBeEnabled(),
    );
    expect((await loadSettings()).kbnDefinitions).toEqual(rows);
    expect(state.settings.kbnDefinitions).toEqual(rows);
  });

  it("does not replace a valid snapshot with an empty import", async () => {
    await openSettings();
    selectFile(JSON.stringify(rows));
    await waitFor(() => expect(screen.getByDisplayValue("Shepherd → 7")).toBeInTheDocument());
    selectFile("[]");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "KBN定義を選択" })).toBeEnabled(),
    );
    expect((await loadSettings()).kbnDefinitions).toEqual(rows);
  });

  it("discards a late source read when settings have changed", async () => {
    let finish!: (value: KbnDefinition[]) => void;
    vi.mocked(services.kbnDefinition.load).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await openSettings();
    selectFile(JSON.stringify(rows));
    act(() => state.setSettings({ ...state.settings, departmentCode: "NEW" }));
    await act(async () => finish(rows));
    expect((await loadSettings()).kbnDefinitions).toEqual([]);
    expect(state.settings.kbnDefinitions).toEqual([]);
    expect(screen.getByRole("button", { name: "KBN定義を選択" })).toBeEnabled();
  });

  it("synchronizes a committed KBN import after navigating away during native persistence", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    vi.mocked(services.kbnDefinition.load).mockResolvedValue(rows);
    const view = await openSettings();
    nativeSettings.pauseNextSave = true;
    selectFile(JSON.stringify(rows));
    await waitFor(() => expect(nativeSettings.finishSave).not.toBeNull());
    view.rerender(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    act(() =>
      state.patchConversion({
        conversionStatus: "completed",
        generatedSql: {
          generatedSql: "INSERT INTO old_codes VALUES (1);",
          targetDb: "MySQL",
          generatedAt: "2026-10-10",
        },
      }),
    );
    vi.mocked(invalidateConversion).mockClear();
    await act(async () => {
      nativeSettings.finishSave!();
      await loadSettings();
    });
    expect(state.settings.kbnDefinitions).toEqual((await loadSettings()).kbnDefinitions);
    expect(state.settings.kbnDefinitions).toEqual(rows);
    expect(state.conversion.generatedSql).toBeNull();
    expect(invalidateConversion).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps a newer queued KBN commit authoritative after an earlier import route unmounts", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    vi.mocked(services.kbnDefinition.load).mockResolvedValue(rows);
    const view = await openSettings();
    nativeSettings.pauseNextSave = true;
    selectFile(JSON.stringify(rows));
    await waitFor(() => expect(nativeSettings.finishSave).not.toBeNull());
    view.rerender(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    const newerRows = [{ ...rows[0]!, kbn_value: "9" }];
    const newerCommit = updateSettings({
      kbnDefinitions: newerRows,
      kbnSource: { name: "更新.json", path: "C:\\更新.json", loadedAt: "2026-10-10T00:00:00.000Z" },
    }).then((saved) => state.setSettings(saved));
    await act(async () => {
      nativeSettings.finishSave!();
      await newerCommit;
    });
    expect(state.settings.kbnDefinitions).toEqual(newerRows);
    expect(state.settings.kbnSource?.name).toBe("更新.json");
    expect(state.settings).toEqual(await loadSettings());
  });
});

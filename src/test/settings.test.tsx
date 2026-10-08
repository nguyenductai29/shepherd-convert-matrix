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
import { FilePickerCard } from "@/components/shepherd/workflow";

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

describe("app settings and conversion reference loading", () => {
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
          <FilePickerCard kind="kbnDefinition" />
          <Probe />
        </AppStateProvider>,
      );
    });
    return view;
  };
  const selectFile = (contents: string) =>
    fireEvent.change(screen.getByLabelText("区分名称マスタファイル"), {
      target: { files: [new File([contents], "区分.json")] },
    });

  it("keeps only quantity and app settings editable while reference imports persist locally", async () => {
    await openSettings();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByText("部門コード", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("部門名", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("ログインID → ユーザーID", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("登録・更新ユーザーID", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("適用開始日", { exact: true })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "品目構成の数量" }), {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "設定を保存" }));
    await waitFor(() => expect(state.settings.defaultQuantity).toBe("2.5"));
    selectFile(JSON.stringify(rows));
    await waitFor(() => expect(state.settings.kbnDefinitions).toEqual(rows));
    expect(await loadSettings()).toMatchObject({
      defaultQuantity: "2.5",
      kbnDefinitions: rows,
      kbnSource: { name: "区分.json", path: null },
    });
  });

  it.each(['{"invalid":true}', "[]"])(
    "blocks a replacement invalid reference instead of using stale values: %s",
    async (contents) => {
      await openSettings();
      selectFile(JSON.stringify(rows));
      await waitFor(() => expect(state.settings.kbnDefinitions).toEqual(rows));
      selectFile(contents);
      await waitFor(() => expect(state.conversion.referenceLoading).toBe(false));
      expect((await loadSettings()).kbnDefinitions).toEqual([]);
      expect(state.settings.kbnDefinitions).toEqual([]);
      expect(state.settings.kbnSourceError).toContain("区分名称マスタ");
    },
  );

  it("discards a late source read after the selected reference is cleared", async () => {
    let finish!: (value: KbnDefinition[]) => void;
    vi.mocked(services.kbnDefinition.load).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await openSettings();
    selectFile(JSON.stringify(rows));
    act(() => state.setFile(null, "kbnDefinition"));
    await act(async () => finish(rows));
    expect((await loadSettings()).kbnDefinitions).toEqual([]);
    expect(state.settings.kbnDefinitions).toEqual([]);
    expect(state.conversion.referenceLoading).toBe(false);
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

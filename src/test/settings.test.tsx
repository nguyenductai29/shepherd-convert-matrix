import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "@/state/app-state";
import { loadSettings, updateSettings } from "@/services/platform/local-settings";
import { Route } from "@/routes/settings";
import { services } from "@/services";
import { parseKbnReferenceFile } from "@/services/processing/kbn-reference";
import ExcelJS from "exceljs";
import { readSelectedFile } from "@/services/platform/files";
import type { KbnDefinition } from "@/models/kbn";
import { invalidateConversion } from "@/features/conversion/run-conversion";
import { toast } from "sonner";
import { FilePickerCard } from "@/components/shepherd/workflow";

const nativeSettings = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  pauseNextSave: false,
  finishSave: null as (() => void) | null,
  pauseNextRead: false,
  finishRead: null as (() => void) | null,
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    entries: async () => {
      const entries = [...nativeSettings.values];
      if (nativeSettings.pauseNextRead) {
        nativeSettings.pauseNextRead = false;
        await new Promise<void>((resolve) => {
          nativeSettings.finishRead = resolve;
        });
      }
      return entries;
    },
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
  {
    category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
    kbn_name: "Shepherd",
    kbn_value: "7",
    order_no: 1,
    invalid_flg: false,
  },
];

describe("app settings and conversion reference loading", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    nativeSettings.values.clear();
    nativeSettings.pauseNextSave = false;
    nativeSettings.finishSave = null;
    nativeSettings.pauseNextRead = false;
    nativeSettings.finishRead = null;
    vi.mocked(services.kbnDefinition.load).mockImplementation(async (file) =>
      parseKbnReferenceFile(file, await readSelectedFile(file)),
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
  const selectFile = async (items: typeof rows, missingColumns = false) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("区分");
    sheet.addRow(
      missingColumns
        ? ["category_kbn_code"]
        : ["category_kbn_code", "kbn_value", "kbn_name", "order_no", "invalid_flg"],
    );
    for (const row of items)
      sheet.addRow([
        row.category_kbn_code,
        row.kbn_value,
        row.kbn_name,
        row.order_no,
        row.invalid_flg,
      ]);
    const bytes = await workbook.xlsx.writeBuffer();
    fireEvent.change(screen.getByLabelText("区分名称マスタファイル"), {
      target: { files: [new File([bytes as BlobPart], "区分.xlsx")] },
    });
  };

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
    await selectFile(rows);
    await waitFor(() => expect(state.settings.kbnDefinitions).toEqual(rows));
    expect(await loadSettings()).toMatchObject({
      defaultQuantity: "2.5",
      kbnDefinitions: rows,
      kbnSource: { name: "区分.xlsx", path: null },
    });
  });

  it.each([true, false])(
    "blocks a replacement invalid reference instead of using stale values: %s",
    async (missingColumns) => {
      await openSettings();
      await selectFile(rows);
      await waitFor(() => expect(state.settings.kbnDefinitions).toEqual(rows));
      await selectFile([], missingColumns);
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
    await selectFile(rows);
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
    await selectFile(rows);
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
    await selectFile(rows);
    await waitFor(() => expect(nativeSettings.finishSave).not.toBeNull());
    view.rerender(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    const newerRows = [{ ...rows[0]!, kbn_value: "9" }];
    const newerCommit = updateSettings({
      kbnDefinitions: newerRows,
      kbnSource: { name: "更新.xlsx", path: "C:\\更新.xlsx", loadedAt: "2026-10-10T00:00:00.000Z" },
    }).then((saved) => state.setSettings(saved));
    await act(async () => {
      nativeSettings.finishSave!();
      await newerCommit;
    });
    expect(state.settings.kbnDefinitions).toEqual(newerRows);
    expect(state.settings.kbnSource?.name).toBe("更新.xlsx");
    expect(state.settings).toEqual(await loadSettings());
  });

  it("preserves a user-selected workbook when the initial native settings read finishes late", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    nativeSettings.values.set("kbnSource", {
      name: "old.xlsx",
      path: null,
      loadedAt: "2026-10-10T00:00:00.000Z",
    });
    nativeSettings.values.set("kbnDefinitions", [{ ...rows[0]!, kbn_value: "old" }]);
    nativeSettings.pauseNextRead = true;
    vi.mocked(services.kbnDefinition.load).mockResolvedValue(rows);
    await openSettings();
    await waitFor(() => expect(nativeSettings.finishRead).not.toBeNull());
    await act(async () =>
      state.setFile(
        { kind: "kbnDefinition", name: "区分.xlsx", path: null, extension: ".xlsx", size: 1 },
        "kbnDefinition",
      ),
    );
    await waitFor(() => expect(state.settings.kbnDefinitions).toEqual(rows));
    await act(async () => {
      nativeSettings.finishRead!();
    });
    expect(state.settings.kbnDefinitions).toEqual(rows);
    expect(state.settings.kbnSource?.name).toBe("区分.xlsx");
    expect((await loadSettings()).kbnDefinitions).toEqual(rows);
    expect(state.conversion.kbnDefinitionError).toBeNull();
  });
});

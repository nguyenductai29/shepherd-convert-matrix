import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "./app-state";
import { invalidateConversion } from "@/features/conversion/run-conversion";
import { services } from "@/services";
import type { SelectedFile } from "@/models";
import { fileFromPath } from "@/services/platform/files";
import { defaultSettings } from "@/services/platform/local-settings";

vi.mock("@/features/conversion/run-conversion", () => ({ invalidateConversion: vi.fn() }));
vi.mock("@/services/platform/history", () => ({ listHistory: async () => [] }));
vi.mock("@/services/platform/files", () => ({ fileFromPath: vi.fn(async () => null) }));
vi.mock("@/services", () => ({
  services: {
    tableDefinition: { load: vi.fn(async (file: unknown) => ({ file, tables: [] })) },
    departmentReference: {
      load: vi.fn(async (file: unknown) => ({
        file,
        rows: [
          {
            departmentId: 123,
            departmentCode: "HPK",
            departmentName: "部門",
            editCtrlKbn: "0",
            invalidFlg: false,
          },
        ],
      })),
    },
    kbnDefinition: {
      load: vi.fn(async () => [
        {
          category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
          kbn_name: "Shepherd",
          kbn_value: "1",
          order_no: 1,
          invalid_flg: false,
        },
      ]),
    },
  },
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
    vi.mocked(fileFromPath).mockReset().mockResolvedValue(null);
  });
  afterEach(cleanup);

  it("preserves a schema parse diagnostic while other sources are selected and loaded", async () => {
    vi.mocked(services.tableDefinition.load).mockRejectedValueOnce(
      new Error("定義書に物理テーブル名がありません。"),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    await act(async () =>
      state.setFile(
        { kind: "tableDefinition", name: "invalid.xlsx", path: null, extension: ".xlsx", size: 10 },
        "tableDefinition",
      ),
    );
    await act(async () =>
      state.setFile(
        {
          kind: "departmentReference",
          name: "部署.xlsx",
          path: null,
          extension: ".xlsx",
          size: 10,
        },
        "departmentReference",
      ),
    );
    await act(async () =>
      state.setFile(
        { kind: "kbnDefinition", name: "区分.xlsx", path: null, extension: ".xlsx", size: 10 },
        "kbnDefinition",
      ),
    );
    expect(state.conversion.tableDefinition).toBeNull();
    expect(state.conversion.tableDefinitionError).toContain("物理テーブル名");
    await act(async () =>
      state.setFile(
        { kind: "tableDefinition", name: "valid.xlsx", path: null, extension: ".xlsx", size: 10 },
        "tableDefinition",
      ),
    );
    expect(state.conversion.tableDefinitionError).toBeNull();
    expect(state.conversion.tableDefinition).not.toBeNull();
  });

  it("keeps department reference validation actionable after another file is selected", async () => {
    vi.mocked(services.departmentReference.load).mockRejectedValueOnce(
      new Error("部門マスタに必要な列が不足しています。\n不足列:\ndepartment_id"),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    await act(async () =>
      state.setFile(
        {
          kind: "departmentReference",
          name: "invalid.xlsx",
          path: null,
          extension: ".xlsx",
          size: 10,
        },
        "departmentReference",
      ),
    );
    await act(async () =>
      state.setFile(
        {
          kind: "master",
          name: "HPK_Shepherd導入_マスタ整備ファイル.xlsm",
          path: null,
          extension: ".xlsm",
          size: 10,
        },
        "master",
      ),
    );
    expect(state.conversion.departmentReferenceError).toContain("department_id");
    expect(state.conversion.departmentReference).toBeNull();
  });

  it("reloads all three remembered references and replaces persisted KBN rows with the current workbook", async () => {
    const files: SelectedFile[] = [
      {
        kind: "tableDefinition",
        name: "定義.xlsx",
        path: "C:\\定義.xlsx",
        extension: ".xlsx",
        size: 10,
      },
      {
        kind: "departmentReference",
        name: "部署.xlsx",
        path: "C:\\部署.xlsx",
        extension: ".xlsx",
        size: 10,
      },
      {
        kind: "kbnDefinition",
        name: "区分.xlsx",
        path: "C:\\区分.xlsx",
        extension: ".xlsx",
        size: 42,
      },
    ];
    vi.mocked(fileFromPath).mockImplementation(
      async (kind) => files.find((file) => file.kind === kind) ?? null,
    );
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        lastTableDefinitionPath: files[0]!.path,
        lastDepartmentReferencePath: files[1]!.path,
        lastKbnDefinitionPath: files[2]!.path,
        kbnDefinitions: [
          {
            category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
            kbn_name: "Shepherd",
            kbn_value: "old",
            order_no: 1,
            invalid_flg: false,
          },
        ],
        kbnSource: {
          name: "区分.xlsx",
          path: files[2]!.path,
          loadedAt: "2026-10-10T00:00:00.000Z",
        },
      }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    await waitFor(() => expect(state.settings.kbnDefinitions[0]?.kbn_value).toBe("1"));
    expect(state.conversion.tableDefinition).not.toBeNull();
    expect(state.conversion.departmentReference?.rows[0]?.departmentId).toBe(123);
    expect(state.conversion.kbnDefinitionFile).toEqual(files[2]);
    for (const file of files) expect(fileFromPath).toHaveBeenCalledWith(file.kind, file.path);
    expect(services.kbnDefinition.load).toHaveBeenCalledWith(files[2]);
    expect(state.conversion.referenceLoading).toBe(false);
    act(() => state.setSettings(defaultSettings));
    expect(state.conversion.kbnDefinitionFile).toBeNull();
  });

  it("blocks stale KBN snapshots when the remembered workbook is missing", async () => {
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        lastKbnDefinitionPath: "C:\\missing.xlsx",
        kbnDefinitions: [
          {
            category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
            kbn_name: "Shepherd",
            kbn_value: "old",
            order_no: 1,
            invalid_flg: false,
          },
        ],
        kbnSource: {
          name: "missing.xlsx",
          path: "C:\\missing.xlsx",
          loadedAt: "2026-10-10T00:00:00.000Z",
        },
      }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    expect(state.settings.kbnDefinitions).toEqual([]);
    expect(state.conversion.kbnDefinitionFile).toBeNull();
    expect(state.conversion.kbnDefinitionError).toContain("再選択");
    expect(state.conversion.referenceLoading).toBe(false);
    expect(services.kbnDefinition.load).not.toHaveBeenCalled();
  });

  it("requires browser XLSX reselection after reload instead of restoring a cached snapshot", async () => {
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        kbnDefinitions: [
          {
            category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
            kbn_name: "Shepherd",
            kbn_value: "old",
            order_no: 1,
            invalid_flg: false,
          },
        ],
        kbnSource: { name: "区分.xlsx", path: null, loadedAt: "2026-10-10T00:00:00.000Z" },
      }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    expect(state.settings.kbnDefinitions).toEqual([]);
    expect(state.conversion.kbnDefinitionFile).toBeNull();
    expect(state.conversion.kbnDefinitionError).toContain("再選択");
    expect(services.kbnDefinition.load).not.toHaveBeenCalled();
  });

  it("does not reactivate a browser cached snapshot when an unrelated preference is saved", async () => {
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({
        kbnDefinitions: [
          {
            category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
            kbn_name: "Shepherd",
            kbn_value: "old",
            order_no: 1,
            invalid_flg: false,
          },
        ],
        kbnSource: { name: "区分.xlsx", path: null, loadedAt: "2026-10-10T00:00:00.000Z" },
      }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    await act(async () => state.toggleDark());
    expect(state.settings.theme).toBe("dark");
    expect(state.settings.kbnDefinitions).toEqual([]);
    expect(state.conversion.kbnDefinitionError).toContain("再選択");
  });

  it("does not overwrite a newly selected KBN workbook with a late startup path lookup", async () => {
    let complete!: (file: SelectedFile) => void;
    vi.mocked(fileFromPath).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    localStorage.setItem(
      "shepherd-local-settings",
      JSON.stringify({ lastKbnDefinitionPath: "C:\\old.xlsx" }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    const current: SelectedFile = {
      kind: "kbnDefinition",
      name: "new.xlsx",
      path: null,
      extension: ".xlsx",
      size: 2,
    };
    await act(async () => state.setFile(current, "kbnDefinition"));
    await act(async () => complete({ ...current, name: "old.xlsx", path: "C:\\old.xlsx" }));
    expect(state.conversion.kbnDefinitionFile).toEqual(current);
    expect(state.settings.kbnSource?.name).toBe("new.xlsx");
  });

  it("does not retain a previous KBN snapshot when a replacement cannot be loaded", async () => {
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    await act(async () =>
      state.setFile(
        { kind: "kbnDefinition", name: "valid.xlsx", path: null, extension: ".xlsx", size: 10 },
        "kbnDefinition",
      ),
    );
    expect(state.settings.kbnDefinitions).toHaveLength(1);
    vi.mocked(services.kbnDefinition.load).mockRejectedValueOnce(new Error("不正なExcel"));
    await act(async () =>
      state.setFile(
        { kind: "kbnDefinition", name: "invalid.xlsx", path: null, extension: ".xlsx", size: 10 },
        "kbnDefinition",
      ),
    );
    expect(state.settings.kbnDefinitions).toEqual([]);
    expect(state.conversion.errorMessage).toBe("区分名称マスタの読み込みに失敗しました。");
    expect(state.conversion.referenceLoading).toBe(false);
    expect(state.settings.kbnSource).toBeNull();
  });

  it("loads department reference data and invalidates resolved SQL when the source is removed", async () => {
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    const file: SelectedFile = {
      kind: "departmentReference",
      name: "部署.xlsx",
      path: null,
      extension: ".xlsx",
      size: 10,
    };
    await act(async () => state.setFile(file, "departmentReference"));
    await waitFor(() =>
      expect(state.conversion.departmentReference?.rows[0]?.departmentId).toBe(123),
    );
    expect(state.conversion.tableDefinitionFile).toBeNull();
    expect(state.conversion.departmentReferenceFile).toEqual(file);
    act(() =>
      state.patchConversion({
        resolvedDepartment: state.conversion.departmentReference!.rows[0]!,
        generatedSql: { generatedSql: "SQL", targetDb: "MySQL", generatedAt: "today" },
      }),
    );
    act(() => state.setFile(null, "departmentReference"));
    expect(state.conversion.departmentReference).toBeNull();
    expect(state.conversion.resolvedDepartment).toBeNull();
    expect(state.conversion.generatedSql).toBeNull();
  });

  it("loads and persists a KBN selection in provider state independently of its route", async () => {
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    const file: SelectedFile = {
      kind: "kbnDefinition",
      name: "区分.xlsx",
      path: null,
      extension: ".xlsx",
      size: 42,
    };
    await act(async () => state.setFile(file, "kbnDefinition"));
    await waitFor(() => expect(state.settings.kbnDefinitions).toHaveLength(1));
    expect(state.conversion.kbnDefinitionFile).toEqual(file);
    expect(state.conversion.tableDefinitionFile).toBeNull();
    expect(state.settings.kbnSource).toMatchObject({ name: "区分.xlsx", size: 42 });
    expect(state.conversion.referenceLoading).toBe(false);
    expect(JSON.parse(localStorage.getItem("shepherd-local-settings")!).kbnSource.name).toBe(
      "区分.xlsx",
    );
  });

  it("rejects stale department loads after a replacement source is selected", async () => {
    let complete: ((value: unknown) => void) | undefined;
    vi.mocked(services.departmentReference.load).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve as (value: unknown) => void;
        }),
    );
    await act(async () => {
      render(
        <AppStateProvider>
          <Probe />
        </AppStateProvider>,
      );
    });
    await act(async () =>
      state.setFile(
        { kind: "departmentReference", name: "old.xlsx", path: null, extension: ".xlsx", size: 1 },
        "departmentReference",
      ),
    );
    expect(state.conversion.referenceLoading).toBe(true);
    const current: SelectedFile = {
      kind: "departmentReference",
      name: "new.xlsx",
      path: null,
      extension: ".xlsx",
      size: 2,
    };
    await act(async () => state.setFile(current, "departmentReference"));
    await act(async () => complete?.({ file: { name: "old.xlsx" }, rows: [] }));
    expect(state.conversion.departmentReference?.file).toEqual(current);
    expect(state.conversion.referenceLoading).toBe(false);
  });

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
          {
            category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
            kbn_name: "Shepherd",
            kbn_value: "7",
            order_no: 1,
            invalid_flg: false,
          },
        ],
        kbnSource: { name: "区分.xlsx", path: null, loadedAt: "2026-10-10T00:00:00.000Z" },
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
        { kind: "kbnDefinition", name: "区分.xlsx", path: null, extension: ".xlsx", size: 10 },
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
    expect(state.startupError).toContain("区分名称マスタ");
    await act(async () =>
      state.setFile(
        { kind: "tableDefinition", name: "定義.xlsx", path: null, extension: ".xlsx", size: 10 },
        "tableDefinition",
      ),
    );
    expect(state.startupError).toContain("区分名称マスタ");
    act(() =>
      state.setSettings({
        ...state.settings,
        kbnDefinitions: [
          {
            category_kbn_code: "KBN_PRODUCT_MANAGEMENT",
            kbn_name: "Shepherd",
            kbn_value: "7",
            order_no: 1,
            invalid_flg: false,
          },
        ],
        kbnSourceError: null,
      }),
    );
    expect(state.startupError).toBeNull();
  });
});

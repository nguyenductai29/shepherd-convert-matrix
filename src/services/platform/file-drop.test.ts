import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeNativeFileDrop } from "./file-drop";

type DropPayload =
  | { type: "enter" | "over" | "drop"; paths?: string[]; position: { x: number; y: number } }
  | { type: "leave" };
const native = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: { payload: DropPayload }) => Promise<void>),
  getCurrentWebview: vi.fn(),
  settings: new Map<string, unknown>(),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => {
    native.getCurrentWebview();
    return {
      onDragDropEvent: async (listener: typeof native.listener) => {
        native.listener = listener;
        return () => {
          native.listener = undefined;
        };
      },
    };
  },
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  stat: async (path: string) => ({
    isFile: !path.endsWith("folder.xlsx"),
    size: 1024,
    mtime: new Date("2026-10-08T10:00:00Z"),
  }),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    entries: async () => [...native.settings.entries()],
    set: async (key: string, value: unknown) => {
      native.settings.set(key, value);
    },
    save: async () => undefined,
  }),
}));

describe("native file drops", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    native.listener = undefined;
    native.settings.clear();
    native.getCurrentWebview.mockClear();
  });
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  });

  it("routes a native path and file metadata and remembers its directory", async () => {
    const onFile = vi.fn();
    const onError = vi.fn();
    const containsPoint = vi.fn(() => true);
    const unlisten = await subscribeNativeFileDrop("master", { containsPoint, onFile, onError });
    await native.listener!({
      payload: { type: "drop", paths: ["C:\\部門\\マスタ.xlsm"], position: { x: 200, y: 100 } },
    });
    expect(containsPoint).toHaveBeenCalledWith(100, 50);
    expect(onFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "C:\\部門\\マスタ.xlsm",
        name: "マスタ.xlsm",
        size: 1024,
        modifiedAt: "2026-10-08T10:00:00.000Z",
      }),
    );
    expect(native.settings.get("lastMasterDirectory")).toBe("C:\\部門");
    expect(onError).not.toHaveBeenCalled();
    unlisten();
    expect(native.listener).toBeUndefined();
  });

  it("ignores drops outside the dropzone and while processing", async () => {
    const onFile = vi.fn();
    let enabled = true;
    let inside = false;
    await subscribeNativeFileDrop("master", {
      containsPoint: () => inside,
      enabled: () => enabled,
      onFile,
      onError: vi.fn(),
    });
    const event = {
      payload: { type: "drop" as const, paths: ["C:\\マスタ.xlsm"], position: { x: 2, y: 2 } },
    };
    await native.listener!(event);
    inside = true;
    enabled = false;
    await native.listener!(event);
    expect(onFile).not.toHaveBeenCalled();
    expect(native.settings.size).toBe(0);
  });

  it("rejects unsupported files, directories, and multiple files without selecting them", async () => {
    const onFile = vi.fn();
    const onError = vi.fn();
    await subscribeNativeFileDrop("master", { containsPoint: () => true, onFile, onError });
    for (const paths of [["C:\\bad.csv"], ["C:\\folder.xlsx"], ["C:\\a.xlsx", "C:\\b.xlsx"]]) {
      await native.listener!({ payload: { type: "drop", paths, position: { x: 2, y: 2 } } });
    }
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onFile).not.toHaveBeenCalled();
  });

  it("stores the definition path for definition drops and has a browser no-op", async () => {
    await subscribeNativeFileDrop("tableDefinition", {
      containsPoint: () => true,
      onFile: vi.fn(),
      onError: vi.fn(),
    });
    await native.listener!({
      payload: { type: "drop", paths: ["C:\\定義.xlsx"], position: { x: 0, y: 0 } },
    });
    expect(native.settings.get("lastTableDefinitionPath")).toBe("C:\\定義.xlsx");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    native.getCurrentWebview.mockClear();
    (
      await subscribeNativeFileDrop("master", {
        containsPoint: () => true,
        onFile: vi.fn(),
        onError: vi.fn(),
      })
    )();
    expect(native.getCurrentWebview).not.toHaveBeenCalled();
  });

  it("keeps department and KBN reference selections separate from workbook paths", async () => {
    const onFile = vi.fn();
    let unlisten = await subscribeNativeFileDrop("departmentReference", {
      containsPoint: () => true,
      onFile,
      onError: vi.fn(),
    });
    await native.listener!({
      payload: { type: "drop", paths: ["C:\\部署.xlsx"], position: { x: 0, y: 0 } },
    });
    expect(native.settings.get("lastDepartmentReferencePath")).toBe("C:\\部署.xlsx");
    expect(native.settings.get("lastTableDefinitionPath")).toBeNull();
    expect(native.settings.get("lastMasterDirectory")).toBeNull();
    unlisten();
    unlisten = await subscribeNativeFileDrop("kbnDefinition", {
      containsPoint: () => true,
      onFile,
      onError: vi.fn(),
    });
    await native.listener!({
      payload: { type: "drop", paths: ["C:\\区分.xlsx"], position: { x: 0, y: 0 } },
    });
    expect(onFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "kbnDefinition", name: "区分.xlsx" }),
    );
    expect(native.settings.get("kbnSource")).toBeNull();
    expect(native.settings.get("lastMasterDirectory")).toBeNull();
    unlisten();
  });
});

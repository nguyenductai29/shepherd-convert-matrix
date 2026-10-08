import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { saveConversionArtifacts, readSelectedFile, fileFromPath, pickFileNative } from "./files";
import type { ValidationResult } from "@/models";

const native = vi.hoisted(() => ({
  files: new Map<string, string | Uint8Array>(),
  directories: new Set<string>(),
  settings: new Map<string, unknown>(),
  directory: "C:\\出力" as string | null,
  failWrite: false,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: async () => native.directory }));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    entries: async () => [...native.settings.entries()],
    set: async (key: string, value: unknown) => {
      native.settings.set(key, value);
    },
    save: async () => undefined,
  }),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: async (path: string) => {
    if (native.directories.has(path)) throw new Error("Already exists");
    native.directories.add(path);
  },
  rename: async (source: string, target: string) => {
    if (!native.directories.has(source) || native.directories.has(target))
      throw new Error("Invalid rename");
    native.directories.delete(source);
    native.directories.add(target);
    for (const [path, content] of [...native.files]) {
      if (path.startsWith(source + "\\")) {
        native.files.delete(path);
        native.files.set(target + path.slice(source.length), content);
      }
    }
  },
  remove: async (directory: string) => {
    native.directories.delete(directory);
    for (const path of native.files.keys()) {
      if (path.startsWith(directory + "\\")) native.files.delete(path);
    }
  },
  writeTextFile: async (path: string, content: string) => {
    native.files.set(path, content);
  },
  writeFile: async (path: string, content: Uint8Array) => {
    if (native.failWrite) throw new Error("Disk full");
    native.files.set(path, content);
  },
  readFile: async (path: string) => {
    const file = native.files.get(path);
    if (!(file instanceof Uint8Array)) throw new Error("Missing file");
    return file;
  },
  stat: async (path: string) => {
    if (!native.files.has(path) && !native.directories.has(path)) throw new Error("Missing path");
    return {
      isFile: native.files.has(path),
      isDirectory: native.directories.has(path),
      size: 5,
      mtime: new Date("2026-10-08T10:00:00Z"),
    };
  },
}));

const validation: ValidationResult = {
  totalRecords: 2,
  okCount: 2,
  errorCount: 0,
  warningCount: 1,
  dbComparison: "unchecked",
  items: [
    {
      severity: "warning",
      category: "文字",
      sourceSheet: "部門",
      sourceRow: 5,
      value: "日本語",
      message: "確認してください",
    },
  ],
};

describe("native output and file access", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    native.files.clear();
    native.directories.clear();
    native.settings.clear();
    native.directory = "C:\\出力";
    native.failWrite = false;
  });
  afterEach(() => Reflect.deleteProperty(window, "__TAURI_INTERNALS__"));

  it("writes exact SQL, lossless Japanese JSON, and a readable XLSX report together", async () => {
    const sql = "INSERT INTO `部門` VALUES ('日本語');\n";
    const output = await saveConversionArtifacts({
      sql,
      validation,
      snapshot: [{ department: "製造" }],
    });
    expect(output?.files).toHaveLength(4);
    expect(native.files.get(output!.sqlPath!)).toBe(sql);
    const jsonPath = output!.files.find((path) => path.endsWith("master_snapshot.json"))!;
    expect(JSON.parse(native.files.get(jsonPath) as string)).toEqual([{ department: "製造" }]);
    const reportPath = output!.files.find((path) => path.endsWith("validation_report.xlsx"))!;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(native.files.get(reportPath) as Uint8Array).buffer);
    expect(workbook.getWorksheet("検証結果")!.getCell("H2").value).toBe("日本語");
    expect(workbook.getWorksheet("検証サマリ")!.getCell("B2").value).toBe(2);
    expect(native.settings.get("lastOutputDirectory")).toBe("C:\\出力");
  });

  it("exports only reports when validation failed and does not overwrite earlier runs", async () => {
    const input = { sql: null, validation: { ...validation, errorCount: 1 }, snapshot: [] };
    const first = await saveConversionArtifacts(input);
    const second = await saveConversionArtifacts(input);
    expect(first?.sqlPath).toBeNull();
    expect(first?.files).toHaveLength(3);
    expect(first?.directory).not.toBe(second?.directory);
    expect(native.files.size).toBe(6);
  });

  it("writes no files when output selection is cancelled", async () => {
    native.directory = null;
    expect(await saveConversionArtifacts({ sql: null, validation, snapshot: [] })).toBeNull();
    expect(native.files.size).toBe(0);
  });

  it("does not publish a partial export when a disk write fails", async () => {
    native.failWrite = true;
    await expect(
      saveConversionArtifacts({ sql: "INSERT INTO x VALUES (1);", validation, snapshot: [] }),
    ).rejects.toThrow("Disk full");
    expect(native.files.size).toBe(0);
    expect(native.directories.size).toBe(0);
  });

  it("reads selected file bytes and reports missing remembered files", async () => {
    native.files.set("C:\\部門.xlsm", new Uint8Array([80, 75, 3, 4, 9]));
    const file = await fileFromPath("master", "C:\\部門.xlsm");
    expect(file?.modifiedAt).toBe("2026-10-08T10:00:00.000Z");
    expect(new Uint8Array(await readSelectedFile(file!))).toEqual(
      new Uint8Array([80, 75, 3, 4, 9]),
    );
    expect(await fileFromPath("master", "C:\\不存在.xlsm")).toBeNull();
  });

  it("selects and rereads native KBN JSON without persisting an unvalidated source", async () => {
    const path = "C:\\定義\\区分.json";
    const json = '[{"category_kbn_code":"KBN_UNIT","kbn_name":"個","kbn_value":"8"}]';
    native.files.set(path, new Uint8Array(new TextEncoder().encode(json)));
    native.directory = path;
    const selected = await pickFileNative("kbnDefinition");
    expect(selected?.path).toBe(path);
    expect(new TextDecoder().decode(await readSelectedFile(selected!))).toBe(json);
    expect((await fileFromPath("kbnDefinition", path))?.path).toBe(path);
    expect(native.settings.get("kbnSource")).toBeUndefined();
    expect(native.settings.get("lastMasterDirectory")).toBeUndefined();
  });
});

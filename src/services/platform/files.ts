// Native file open/save/reveal. Uses Tauri dialogs on desktop, browser fallbacks in the web preview.
import type { FileKind, SelectedFile, ValidationResult } from "@/models";
import { basename, dirname, extensionOf, isDesktop, joinPath } from "./runtime";
import { loadSettings, updateSettings } from "./local-settings";

const browserFiles = new WeakMap<SelectedFile, File>();

export const FILE_RULES: Record<FileKind, { label: string; extensions: string[] }> = {
  tableDefinition: { label: "テーブル定義書", extensions: ["xlsx"] },
  departmentReference: { label: "部門マスタ", extensions: ["xlsx"] },
  master: { label: "マスタ整備ファイル", extensions: ["xlsm", "xlsx"] },
  kbnDefinition: { label: "区分名称マスタ", extensions: ["xlsx"] },
};

export function isAllowed(kind: FileKind, name: string) {
  return FILE_RULES[kind].extensions.includes(extensionOf(name).slice(1));
}

/** Desktop: opens a native dialog. Returns null when cancelled. */
export async function pickFileNative(kind: FileKind): Promise<SelectedFile | null> {
  if (!isDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const settings = await loadSettings();
  const defaultPath =
    kind === "tableDefinition"
      ? settings.lastTableDefinitionPath
        ? dirname(settings.lastTableDefinitionPath)
        : undefined
      : kind === "departmentReference"
        ? settings.lastDepartmentReferencePath
          ? dirname(settings.lastDepartmentReferencePath)
          : undefined
        : kind === "master"
          ? (settings.lastMasterDirectory ?? undefined)
          : settings.lastKbnDefinitionPath
            ? dirname(settings.lastKbnDefinitionPath)
            : undefined;

  const rule = FILE_RULES[kind];
  const path = await open({
    multiple: false,
    directory: false,
    title: `${rule.label}を選択`,
    filters: [{ name: rule.label, extensions: rule.extensions }],
    ...(defaultPath ? { defaultPath } : {}),
  });
  if (!path || Array.isArray(path)) return null;

  let size: number | null = null;
  let modifiedAt: string | null = null;
  try {
    const { stat } = await import("@tauri-apps/plugin-fs");
    const info = await stat(path);
    size = info.size;
    modifiedAt = info.mtime?.toISOString() ?? null;
  } catch {
    size = null;
  }

  // KBN source metadata is persisted only after its contents have been validated.
  if (kind !== "kbnDefinition") {
    await updateSettings(
      kind === "tableDefinition"
        ? { lastTableDefinitionPath: path }
        : kind === "departmentReference"
          ? { lastDepartmentReferencePath: path }
          : { lastMasterDirectory: dirname(path) },
    );
  }

  const name = basename(path);
  return { kind, name, path, extension: extensionOf(name), size, modifiedAt };
}

/** Browser preview: wraps an <input type="file"> selection. No local path is available. */
export function fromBrowserFile(kind: FileKind, f: File): SelectedFile {
  const selected: SelectedFile = {
    kind,
    name: f.name,
    path: null,
    extension: extensionOf(f.name),
    size: f.size,
    modifiedAt: new Date(f.lastModified).toISOString(),
  };
  browserFiles.set(selected, f);
  return selected;
}

/** Reads source bytes locally. Source files are never opened for writing. */
export async function readSelectedFile(file: SelectedFile): Promise<ArrayBuffer> {
  if (!isAllowed(file.kind, file.name)) throw new Error("対応していないファイル形式です。");
  if (isDesktop()) {
    if (!file.path) throw new Error("ローカルファイルのパスがありません。再選択してください。");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(file.path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  const browserFile = browserFiles.get(file);
  if (!browserFile) throw new Error("ファイルを再選択してください。");
  if (typeof browserFile.arrayBuffer === "function") return browserFile.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
    reader.readAsArrayBuffer(browserFile);
  });
}

/** Rebuild a SelectedFile from a remembered path (desktop only). */
export async function fileFromPath(kind: FileKind, path: string): Promise<SelectedFile | null> {
  if (!isDesktop()) return null;
  try {
    const { stat } = await import("@tauri-apps/plugin-fs");
    const s = await stat(path);
    if (!s.isFile || !isAllowed(kind, path)) return null;
    const name = basename(path);
    return {
      kind,
      name,
      path,
      extension: extensionOf(name),
      size: s.size,
      modifiedAt: s.mtime?.toISOString() ?? null,
    };
  } catch {
    return null;
  }
}

export interface SaveOptions {
  defaultName: string;
  content: string;
  filterName: string;
  extensions: string[];
}

/** Returns the saved path (desktop), "download" (browser), or null if cancelled. */
export async function saveTextFile(o: SaveOptions): Promise<string | null> {
  if (isDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const settings = await loadSettings();
    const target = await save({
      title: "保存先を選択",
      defaultPath: settings.lastOutputDirectory
        ? joinPath(settings.lastOutputDirectory, o.defaultName)
        : o.defaultName,
      filters: [{ name: o.filterName, extensions: o.extensions }],
    });
    if (!target) return null;
    await writeTextFile(target, o.content);
    await updateSettings({ lastOutputDirectory: dirname(target) });
    return target;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([o.content], { type: "text/plain;charset=utf-8" }));
  a.download = o.defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
  return "download";
}

/** Desktop: choose a directory and remember it as the output folder. */
export async function pickOutputDirectory(): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const settings = await loadSettings();
  const dir = await open({
    directory: true,
    title: "出力フォルダを選択",
    ...(settings.lastOutputDirectory ? { defaultPath: settings.lastOutputDirectory } : {}),
  });
  if (!dir || Array.isArray(dir)) return null;
  await updateSettings({ lastOutputDirectory: dir });
  return dir;
}

/** Desktop: show a file in Explorer (or open a folder). */
export async function revealInFolder(path: string): Promise<void> {
  if (!isDesktop()) return;
  const { revealItemInDir, openPath } = await import("@tauri-apps/plugin-opener");
  const { stat } = await import("@tauri-apps/plugin-fs");
  if ((await stat(path)).isDirectory) await openPath(path);
  else await revealItemInDir(path);
}

export interface ConversionArtifacts {
  sql: string | null;
  validation: ValidationResult;
  snapshot: unknown;
}

export interface SavedArtifacts {
  directory: string | null;
  sqlPath: string | null;
  files: string[];
}

const jsonText = (value: unknown) =>
  JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

async function reportWorkbook(validation: ValidationResult): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("検証サマリ");
  summary.addRows([
    ["項目", "件数"],
    ["総レコード数", validation.totalRecords],
    ["正常", validation.okCount],
    ["エラー", validation.errorCount],
    ["警告", validation.warningCount],
  ]);
  summary.getColumn(1).width = 24;
  summary.getColumn(2).width = 18;
  const issues = workbook.addWorksheet("検証結果");
  issues.columns = [
    { header: "判定", key: "severity", width: 12 },
    { header: "分類", key: "category", width: 22 },
    { header: "シート", key: "sourceSheet", width: 26 },
    { header: "行", key: "sourceRow", width: 10 },
    { header: "関連行", key: "relatedRows", width: 20 },
    { header: "テーブル", key: "table", width: 28 },
    { header: "カラム", key: "column", width: 28 },
    { header: "値", key: "value", width: 30 },
    { header: "メッセージ", key: "message", width: 65 },
    { header: "詳細", key: "detail", width: 65 },
  ];
  for (const item of validation.items) {
    issues.addRow({
      ...item,
      relatedRows: item.relatedRows?.join(", ") ?? "",
      value:
        item.value == null
          ? ""
          : (typeof item.value === "string" ? item.value : jsonText(item.value)).slice(0, 32760),
    });
  }
  issues.views = [{ state: "frozen", ySplit: 1 }];
  issues.autoFilter = "A1:J1";
  for (const sheet of [summary, issues]) {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } };
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function downloadBlob(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A separate folder per run prevents an older report from being overwritten. */
export async function saveConversionArtifacts(
  artifacts: ConversionArtifacts,
): Promise<SavedArtifacts | null> {
  if (
    artifacts.sql !== null &&
    (artifacts.validation.errorCount > 0 ||
      artifacts.validation.items.some((item) => item.severity === "error"))
  ) {
    throw new Error("検証エラーがあるためSQLを保存できません。");
  }
  const { timestamp } = await import("./runtime");
  const stamp = timestamp();
  const texts: [string, string][] = [
    ["validation_report.json", jsonText(artifacts.validation)],
    ["master_snapshot.json", jsonText(artifacts.snapshot)],
  ];
  const sqlName = `insert_${stamp}.sql`;
  if (artifacts.sql !== null) texts.unshift([sqlName, artifacts.sql]);
  if (isDesktop()) {
    const base = await pickOutputDirectory();
    if (!base) return null;
    const { mkdir, writeTextFile, writeFile, rename, remove } =
      await import("@tauri-apps/plugin-fs");
    const runName = `shepherd_${stamp}_${crypto.randomUUID().slice(0, 8)}`;
    const directory = joinPath(base, runName);
    const staging = joinPath(base, `.${runName}.partial`);
    // Prepare the report before creating output files, so workbook serialization errors leave no partial export.
    const report = await reportWorkbook(artifacts.validation);
    await mkdir(staging);
    try {
      for (const [name, content] of texts) {
        await writeTextFile(joinPath(staging, name), content);
      }
      await writeFile(joinPath(staging, "validation_report.xlsx"), report);
      await rename(staging, directory);
    } catch (error) {
      // Only this uniquely named directory, successfully created above, can be removed.
      try {
        await remove(staging, { recursive: true });
      } catch {
        throw new Error(`ファイル出力に失敗し、一時フォルダを削除できませんでした: ${staging}`, {
          cause: error,
        });
      }
      throw error;
    }
    const files = [
      ...texts.map(([name]) => joinPath(directory, name)),
      joinPath(directory, "validation_report.xlsx"),
    ];
    return {
      directory,
      sqlPath: artifacts.sql === null ? null : joinPath(directory, sqlName),
      files,
    };
  }
  const report = await reportWorkbook(artifacts.validation);
  for (const [name, content] of texts) downloadBlob(name, content, "text/plain;charset=utf-8");
  downloadBlob(
    "validation_report.xlsx",
    report as BlobPart,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  return {
    directory: null,
    sqlPath: null,
    files: [...texts.map(([name]) => name), "validation_report.xlsx"],
  };
}

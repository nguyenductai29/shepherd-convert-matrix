// Native file open/save/reveal. Uses Tauri dialogs on desktop, browser fallbacks in the web preview.
import type { FileKind, SelectedFile } from "@/models";
import { basename, dirname, extensionOf, isDesktop, joinPath } from "./runtime";
import { loadSettings, updateSettings } from "./local-settings";

export const FILE_RULES: Record<FileKind, { label: string; extensions: string[] }> = {
  tableDefinition: { label: "テーブル定義書", extensions: ["xlsx"] },
  master: { label: "マスタ整備ファイル", extensions: ["xlsm", "xlsx"] },
};

export function isAllowed(kind: FileKind, name: string) {
  return FILE_RULES[kind].extensions.includes(extensionOf(name).slice(1));
}

/** Desktop: opens a native dialog. Returns null when cancelled. */
export async function pickFileNative(kind: FileKind): Promise<SelectedFile | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const settings = await loadSettings();
  const defaultPath =
    kind === "tableDefinition"
      ? settings.lastTableDefinitionPath ? dirname(settings.lastTableDefinitionPath) : undefined
      : settings.lastMasterDirectory ?? undefined;

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
  try {
    const { stat } = await import("@tauri-apps/plugin-fs");
    size = (await stat(path)).size;
  } catch {
    size = null;
  }

  await updateSettings(
    kind === "tableDefinition" ? { lastTableDefinitionPath: path } : { lastMasterDirectory: dirname(path) },
  );

  const name = basename(path);
  return { kind, name, path, extension: extensionOf(name), size };
}

/** Browser preview: wraps an <input type="file"> selection. No local path is available. */
export function fromBrowserFile(kind: FileKind, f: File): SelectedFile {
  return { kind, name: f.name, path: null, extension: extensionOf(f.name), size: f.size };
}

/** Rebuild a SelectedFile from a remembered path (desktop only). */
export async function fileFromPath(kind: FileKind, path: string): Promise<SelectedFile | null> {
  if (!isDesktop()) return null;
  try {
    const { stat } = await import("@tauri-apps/plugin-fs");
    const s = await stat(path);
    const name = basename(path);
    return { kind, name, path, extension: extensionOf(name), size: s.size };
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
      defaultPath: settings.lastOutputDirectory ? joinPath(settings.lastOutputDirectory, o.defaultName) : o.defaultName,
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
  const dir = await open({ directory: true, title: "出力フォルダを選択", ...(settings.lastOutputDirectory ? { defaultPath: settings.lastOutputDirectory } : {}) });
  if (!dir || Array.isArray(dir)) return null;
  await updateSettings({ lastOutputDirectory: dir });
  return dir;
}

/** Desktop: show a file in Explorer (or open a folder). */
export async function revealInFolder(path: string): Promise<void> {
  if (!isDesktop()) return;
  const { revealItemInDir, openPath } = await import("@tauri-apps/plugin-opener");
  if (extensionOf(path)) await revealItemInDir(path);
  else await openPath(path);
}

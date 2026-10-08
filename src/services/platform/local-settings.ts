// Desktop settings are stored in the application data directory. The browser preview stays local.
import { extensionOf, isDesktop } from "./runtime";
import type { ConversionOptions } from "@/config/shepherd-master";
import { parseKbnDefinitions } from "@/services/processing/kbn-resolver";

export interface LocalSettings extends Omit<ConversionOptions, "departmentReferences"> {
  lastTableDefinitionPath: string | null;
  lastDepartmentReferencePath: string | null;
  lastKbnDefinitionPath: string | null;
  lastMasterDirectory: string | null;
  lastOutputDirectory: string | null;
  sqlTransaction: boolean;
  sqlComments: boolean;
  outputEncoding: "utf-8";
  theme: "light" | "dark" | "system";
  kbnSource: {
    name: string;
    path: string | null;
    loadedAt: string;
    size?: number | null;
    modifiedAt?: string | null;
  } | null;
  /** Retained across unrelated saves until the source is successfully reloaded or reset. */
  kbnSourceError: string | null;
}

export const defaultSettings: LocalSettings = {
  lastTableDefinitionPath: null,
  lastDepartmentReferencePath: null,
  lastKbnDefinitionPath: null,
  lastMasterDirectory: null,
  lastOutputDirectory: null,
  sqlTransaction: true,
  sqlComments: true,
  outputEncoding: "utf-8",
  theme: "light",
  defaultQuantity: "",
  kbnDefinitions: [],
  kbnSource: null,
  kbnSourceError: null,
};

const LS_KEY = "shepherd-local-settings";
let storePromise: Promise<import("@tauri-apps/plugin-store").Store> | undefined;
let writeQueue: Promise<unknown> = Promise.resolve();

async function getStore() {
  if (!isDesktop()) throw new Error("デスクトップ環境ではありません。");
  storePromise ??= import("@tauri-apps/plugin-store")
    .then(({ load }) => load("settings.json", { autoSave: false, defaults: {} }))
    .catch((error) => {
      storePromise = undefined;
      throw error;
    });
  return storePromise;
}

function normalizeSettings(value: unknown): LocalSettings {
  const out = { ...defaultSettings };
  if (!value || typeof value !== "object") return out;
  const settings = value as Record<string, unknown>;
  for (const key of [
    "lastTableDefinitionPath",
    "lastDepartmentReferencePath",
    "lastKbnDefinitionPath",
    "lastMasterDirectory",
    "lastOutputDirectory",
  ] as const) {
    if (typeof settings[key] === "string" || settings[key] === null)
      out[key] = settings[key] as string | null;
  }
  for (const key of ["sqlTransaction", "sqlComments"] as const) {
    if (typeof settings[key] === "boolean") out[key] = settings[key];
  }
  const theme = settings["theme"];
  if (theme === "light" || theme === "dark" || theme === "system") out.theme = theme;
  for (const key of ["defaultQuantity"] as const) {
    if (typeof settings[key] === "string") out[key] = settings[key];
  }
  if (typeof settings["kbnSourceError"] === "string")
    out.kbnSourceError = settings["kbnSourceError"];
  const source = settings["kbnSource"];
  if (source && typeof source === "object") {
    const item = source as Record<string, unknown>;
    if (
      typeof item["name"] === "string" &&
      item["name"] &&
      (typeof item["path"] === "string" || item["path"] === null) &&
      typeof item["loadedAt"] === "string" &&
      Number.isFinite(Date.parse(item["loadedAt"]))
    )
      out.kbnSource = {
        name: item["name"],
        path: item["path"],
        loadedAt: item["loadedAt"],
        ...(typeof item["size"] === "number" ? { size: item["size"] } : {}),
        ...(typeof item["modifiedAt"] === "string" ? { modifiedAt: item["modifiedAt"] } : {}),
      };
  }
  if (
    (out.kbnSource &&
      (extensionOf(out.kbnSource.name) !== ".xlsx" ||
        (out.kbnSource.path && extensionOf(out.kbnSource.path) !== ".xlsx"))) ||
    (out.lastKbnDefinitionPath && extensionOf(out.lastKbnDefinitionPath) !== ".xlsx")
  ) {
    out.kbnSource = null;
    out.lastKbnDefinitionPath = null;
    out.kbnSourceError =
      "以前の区分名称マスタは使用できません。Excelファイル（.xlsx）を再選択してください。";
    return out;
  }
  out.lastKbnDefinitionPath ??= out.kbnSource?.path ?? null;
  if (settings["kbnDefinitions"] !== undefined) {
    try {
      out.kbnDefinitions = parseKbnDefinitions(settings["kbnDefinitions"]);
      if (!out.kbnSource && out.kbnDefinitions.length > 0) {
        out.kbnDefinitions = [];
        out.kbnSourceError =
          "保存済みの区分名称マスタの参照元を確認できません。Excelファイル（.xlsx）を再選択してください。";
      }
    } catch {
      // A broken stored snapshot must never restore obsolete manual KBN overrides.
      out.kbnDefinitions = [];
      out.kbnSourceError =
        "保存済みの区分名称マスタを読み込めませんでした。Excelファイル（.xlsx）を再読込または再選択してください。";
    }
  }
  return out;
}

async function readSettings(): Promise<LocalSettings> {
  if (typeof window === "undefined") return { ...defaultSettings };
  if (isDesktop()) {
    const store = await getStore();
    const entries = await store.entries<unknown>();
    return normalizeSettings(Object.fromEntries(entries));
  }
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"));
  } catch {
    return { ...defaultSettings };
  }
}

export async function loadSettings(): Promise<LocalSettings> {
  await writeQueue.catch(() => undefined);
  return readSettings();
}

export function updateSettings(patch: Partial<LocalSettings>): Promise<LocalSettings> {
  const save = async () => {
    const next = normalizeSettings({ ...(await readSettings()), ...patch });
    if (isDesktop()) {
      const store = await getStore();
      for (const [key, value] of Object.entries(next)) await store.set(key, value);
      await store.save();
    } else if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    }
    return next;
  };
  const result = writeQueue.then(save, save);
  writeQueue = result;
  return result;
}

// Desktop settings are stored in the application data directory. The browser preview stays local.
import { isDesktop } from "./runtime";

export interface LocalSettings {
  lastTableDefinitionPath: string | null;
  lastMasterDirectory: string | null;
  lastOutputDirectory: string | null;
  sqlTransaction: boolean;
  sqlComments: boolean;
  outputEncoding: "utf-8";
  theme: "light" | "dark" | "system";
  departmentCode: string;
  departmentName: string;
  auditUserId: string;
  effectiveFrom: string;
  productManagementKbn: string;
  defaultQuantity: string;
  userIdByLogin: Record<string, string>;
  unitCodeByName: Record<string, string>;
  reportPatternIdByName: Record<string, string>;
}

export const defaultSettings: LocalSettings = {
  lastTableDefinitionPath: null,
  lastMasterDirectory: null,
  lastOutputDirectory: null,
  sqlTransaction: true,
  sqlComments: true,
  outputEncoding: "utf-8",
  theme: "light",
  departmentCode: "",
  departmentName: "",
  auditUserId: "",
  effectiveFrom: "",
  productManagementKbn: "",
  defaultQuantity: "",
  userIdByLogin: {},
  unitCodeByName: {},
  reportPatternIdByName: {},
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
  for (const key of [
    "departmentCode",
    "departmentName",
    "auditUserId",
    "effectiveFrom",
    "productManagementKbn",
    "defaultQuantity",
  ] as const) {
    if (typeof settings[key] === "string") out[key] = settings[key];
  }
  for (const key of ["userIdByLogin", "unitCodeByName", "reportPatternIdByName"] as const) {
    const mapping = settings[key];
    if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
      out[key] = Object.fromEntries(
        Object.entries(mapping).filter(([, value]) => typeof value === "string"),
      );
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

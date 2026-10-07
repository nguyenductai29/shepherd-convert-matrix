// Local persistence for paths/settings.
// Desktop: tauri-plugin-store (settings.json in the app data dir). Browser preview: localStorage.
import { isDesktop } from "./runtime";

export interface LocalSettings {
  lastTableDefinitionPath: string | null;
  lastMasterDirectory: string | null;
  lastOutputDirectory: string | null;
}

export const defaultSettings: LocalSettings = {
  lastTableDefinitionPath: null,
  lastMasterDirectory: null,
  lastOutputDirectory: null,
};

const STORE_FILE = "settings.json";
const LS_KEY = "shepherd-local-settings";

async function getStore() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load(STORE_FILE, { autoSave: true, defaults: {} });
}

export async function loadSettings(): Promise<LocalSettings> {
  if (typeof window === "undefined") return defaultSettings;
  if (isDesktop()) {
    const store = await getStore();
    const out = { ...defaultSettings };
    for (const k of Object.keys(defaultSettings) as (keyof LocalSettings)[]) {
      out[k] = (await store.get<string | null>(k)) ?? null;
    }
    return out;
  }
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") };
  } catch {
    return defaultSettings;
  }
}

export async function updateSettings(patch: Partial<LocalSettings>): Promise<LocalSettings> {
  if (isDesktop()) {
    const store = await getStore();
    for (const [k, v] of Object.entries(patch)) await store.set(k, v);
    await store.save();
    return loadSettings();
  }
  const next = { ...(await loadSettings()), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}

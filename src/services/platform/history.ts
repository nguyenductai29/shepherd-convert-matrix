import type { ValidationResult } from "@/models";
import { isDesktop } from "./runtime";

export interface HistoryEntry {
  id: string;
  executedAt: string;
  file: string;
  tables: number;
  records: number;
  errors: number;
  warnings: number;
  user: string;
  status: "success" | "validation_error" | "failed";
  masterFilepath: string | null;
  tableDefinitionFilename: string;
  generatedSqlPath: string | null;
  outputDirectory: string | null;
  outputFiles: string[];
  validation?: ValidationResult | null;
}

const HISTORY_KEY = "shepherd-conversion-history";
let writeQueue: Promise<unknown> = Promise.resolve();

function browserHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("変換履歴の保存データが破損しています。");
  return rows as HistoryEntry[];
}

export async function listHistory(): Promise<HistoryEntry[]> {
  await writeQueue.catch(() => undefined);
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<HistoryEntry[]>("history_list");
  }
  if (typeof window === "undefined") return [];
  return browserHistory().sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}

export async function getHistory(id: string): Promise<HistoryEntry | null> {
  await writeQueue.catch(() => undefined);
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<HistoryEntry | null>("history_get", { id });
  }
  return (await listHistory()).find((row) => row.id === id) ?? null;
}

export function saveHistory(entry: HistoryEntry): Promise<void> {
  const save = async () => {
    if (isDesktop()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("history_save", { entry });
    } else {
      const rows = browserHistory().filter((row) => row.id !== entry.id);
      rows.push(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(rows));
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("shepherd-history-changed"));
  };
  const result = writeQueue.then(save, save);
  writeQueue = result;
  return result;
}

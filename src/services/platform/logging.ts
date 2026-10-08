import { isDesktop } from "./runtime";

export type LogSeverity = "info" | "warning" | "error";

export const logEvent = appendLog;

/** Supply diagnostics, never workbook rows, database credentials, or SQL contents. */
export async function appendLog(
  action: string,
  severity: LogSeverity = "info",
  detail?: string,
): Promise<void> {
  const entry = { timestamp: new Date().toISOString(), action, severity, detail: detail ?? null };
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("append_log", { entry });
  } else if (typeof window !== "undefined") {
    let rows: unknown[] = [];
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("shepherd-logs") ?? "[]");
      if (Array.isArray(saved)) rows = saved;
    } catch {
      /* Recover a damaged preview log. */
    }
    localStorage.setItem("shepherd-logs", JSON.stringify([...rows.slice(-499), entry]));
  }
}

export async function openLogFolder(): Promise<void> {
  if (!isDesktop()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { openPath } = await import("@tauri-apps/plugin-opener");
  const folder = await invoke<string>("log_directory");
  await openPath(folder);
}

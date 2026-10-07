/** True when running inside the Tauri desktop shell (false in the browser preview / SSR). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return i > 0 ? p.slice(0, i) : p;
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** e.g. 20261007_115500 */
export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

import type { ConversionFileKind, SelectedFile } from "@/models";
import { FILE_RULES, fileFromPath, isAllowed } from "./files";
import { updateSettings } from "./local-settings";
import { dirname, isDesktop } from "./runtime";

interface NativeDropOptions {
  /** CSS-pixel hit testing keeps drops outside the visible dropzone from selecting files. */
  containsPoint: (x: number, y: number) => boolean;
  enabled?: () => boolean;
  onHover?: (hovering: boolean) => void;
  onFile: (file: SelectedFile) => void;
  onError: (message: string) => void;
}

/** Tauri provides absolute paths; browser File objects deliberately do not expose them. */
export async function subscribeNativeFileDrop(
  kind: ConversionFileKind,
  options: NativeDropOptions,
): Promise<() => void> {
  if (!isDesktop()) return () => undefined;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  let active = true;
  let selection = 0;
  const enabled = () => active && (options.enabled?.() ?? true);
  const unlisten = await getCurrentWebview().onDragDropEvent(async ({ payload }) => {
    if (!active) return;
    if (payload.type === "leave") {
      options.onHover?.(false);
      return;
    }
    const scale = window.devicePixelRatio || 1;
    const inside =
      enabled() && options.containsPoint(payload.position.x / scale, payload.position.y / scale);
    options.onHover?.(inside && payload.type !== "drop");
    if (payload.type !== "drop" || !inside) return;
    const selected = ++selection;
    try {
      if (payload.paths.length !== 1) throw new Error("ファイルは1つずつ選択してください。");
      const path = payload.paths[0]!;
      if (!isAllowed(kind, path)) {
        throw new Error(
          `対応していないファイル形式です（${FILE_RULES[kind].extensions.map((extension) => "." + extension).join(", ")}）`,
        );
      }
      const file = await fileFromPath(kind, path);
      if (!file)
        throw new Error("ファイルを読み込めませんでした。ファイルとアクセス権を確認してください。");
      if (!enabled() || selected !== selection) return;
      if (kind !== "kbnDefinition")
        await updateSettings(
          kind === "tableDefinition"
            ? { lastTableDefinitionPath: path }
            : kind === "departmentReference"
              ? { lastDepartmentReferencePath: path }
              : { lastMasterDirectory: dirname(path) },
        );
      if (enabled() && selected === selection) options.onFile(file);
    } catch (error) {
      if (enabled() && selected === selection) {
        options.onError(
          error instanceof Error ? error.message : "ファイルを選択できませんでした。",
        );
      }
    }
  });
  return () => {
    active = false;
    unlisten();
  };
}

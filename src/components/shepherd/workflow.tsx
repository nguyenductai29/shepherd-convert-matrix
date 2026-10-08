import { Check, FileSpreadsheet, FolderOpen, Loader2, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppState } from "@/state/app-state";
import type { FileKind, SelectedFile } from "@/models";
import { FILE_RULES, fromBrowserFile, isAllowed, pickFileNative } from "@/services/platform/files";
import { formatBytes, isDesktop } from "@/services/platform/runtime";
import { loadSettings } from "@/services/platform/local-settings";
import { subscribeNativeFileDrop } from "@/services/platform/file-drop";
import { Button } from "@/components/ui/button";
import { PROCESSING } from "@/features/conversion/run-conversion";
import { StatusBadge } from "./status";

export const STEPS = ["ファイル選択", "フォーマット確認", "データ解析", "検証", "SQL生成"];

export function StepProgress({
  current,
  errorAt,
  busy,
}: {
  current: number;
  errorAt?: number | undefined;
  busy?: boolean;
}) {
  return (
    <ol className="flex items-center gap-0 rounded-md border bg-card px-4 py-3">
      {STEPS.map((s, i) => {
        const done = i < current && errorAt !== i;
        const active = i === current;
        const err = errorAt === i;
        return (
          <li key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done && "border-success bg-success text-success-foreground",
                  active && !err && "border-primary bg-primary text-primary-foreground",
                  err && "border-destructive bg-destructive text-destructive-foreground",
                  !done && !active && !err && "bg-muted text-muted-foreground",
                )}
              >
                {err ? (
                  <X className="h-3.5 w-3.5" />
                ) : done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : active && busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  active || done ? "text-foreground" : "text-muted-foreground",
                  err && "text-destructive",
                )}
              >
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-3 h-px flex-1", done ? "bg-success" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Selected file info: name, local path, extension, size. */
export function SelectedFileInfo({ file, onClear }: { file: SelectedFile; onClear?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background px-3 py-2.5">
      <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-success" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-mono text-xs font-medium">{file.name}</p>
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={file.path ?? undefined}
        >
          {file.path ?? "（ブラウザプレビューではローカルパスを取得できません）"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono">{file.extension}</span> ・ {formatBytes(file.size)} ・ 更新:{" "}
          {file.modifiedAt ? new Date(file.modifiedAt).toLocaleString("ja-JP") : "—"}
        </p>
      </div>
      <StatusBadge status="success" label="選択済み" />
      {onClear && (
        <button
          onClick={onClear}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="選択を解除"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function useFileSelection(kind: FileKind) {
  const { setFile, setSettings, conversion } = useAppState();
  const busy = PROCESSING.includes(conversion.conversionStatus);
  const input = useRef<HTMLInputElement>(null);

  const accept = (f: SelectedFile | null) => {
    if (!f || busy) return;
    if (!isAllowed(kind, f.name)) {
      toast.error(
        `対応していないファイル形式です（${FILE_RULES[kind].extensions.map((e) => "." + e).join(", ")}）`,
      );
      return;
    }
    setFile(f, kind);
    void loadSettings()
      .then(setSettings)
      .catch(() => toast.error("ローカル設定を読み込めませんでした。"));
  };

  const pick = async () => {
    if (busy) return;
    if (isDesktop()) {
      try {
        accept(await pickFileNative(kind));
      } catch (e) {
        toast.error("ファイルを選択できませんでした。");
      }
    } else input.current?.click();
  };

  const hiddenInput = (
    <input
      ref={input}
      type="file"
      accept={FILE_RULES[kind].extensions.map((e) => "." + e).join(",")}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) accept(fromBrowserFile(kind, f));
        e.target.value = "";
      }}
    />
  );

  return { pick, accept, hiddenInput };
}

/** Large drop area + native picker. Used for the master file. */
export function FileDropzone({ kind }: { kind: FileKind }) {
  const { conversion, setFile } = useAppState();
  const file = kind === "master" ? conversion.masterFile : conversion.tableDefinitionFile;
  const { pick, accept, hiddenInput } = useFileSelection(kind);
  const [drag, setDrag] = useState(false);
  const dropArea = useRef<HTMLDivElement>(null);
  const latestSelection = useRef({
    accept,
    busy: PROCESSING.includes(conversion.conversionStatus),
  });
  useEffect(() => {
    latestSelection.current = { accept, busy: PROCESSING.includes(conversion.conversionStatus) };
  });
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void subscribeNativeFileDrop(kind, {
      enabled: () => active && !latestSelection.current.busy,
      containsPoint: (x, y) => {
        const bounds = dropArea.current?.getBoundingClientRect();
        return (
          !!bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
        );
      },
      onHover: (hovering) => {
        if (active) setDrag(hovering);
      },
      onFile: (selected) => {
        if (active) latestSelection.current.accept(selected);
      },
      onError: (message) => {
        if (active) toast.error(message);
      },
    })
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch(() => {
        if (active)
          toast.error(
            "ドラッグ＆ドロップを準備できませんでした。ファイル選択ボタンをご利用ください。",
          );
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [kind]);
  const exts = FILE_RULES[kind].extensions.map((e) => "." + e).join(" / ");

  return (
    <div className="space-y-3">
      <div
        ref={dropArea}
        role="button"
        tabIndex={0}
        onClick={pick}
        onKeyDown={(e) => e.key === "Enter" && pick()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (isDesktop()) return;
          const f = e.dataTransfer.files?.[0];
          if (f) accept(fromBrowserFile(kind, f));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors",
          drag
            ? "border-primary bg-info-soft"
            : "border-input hover:border-primary/60 hover:bg-muted/50",
        )}
      >
        <UploadCloud className={cn("h-8 w-8", drag ? "text-primary" : "text-muted-foreground")} />
        <p className="mt-2 text-sm font-medium">ここにマスタファイルをドラッグ＆ドロップ</p>
        <p className="mt-0.5 text-xs text-muted-foreground">またはクリックしてファイルを選択</p>
        <p className="mt-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          対応形式: {exts}
        </p>
        {hiddenInput}
      </div>
      {file && (
        <SelectedFileInfo
          file={file}
          {...(!PROCESSING.includes(conversion.conversionStatus)
            ? { onClear: () => setFile(null, kind) }
            : {})}
        />
      )}
    </div>
  );
}

/** Compact picker button + file info. Used for the table definition file. */
export function FilePickerCard({ kind }: { kind: FileKind }) {
  const { conversion, setFile } = useAppState();
  const file = kind === "master" ? conversion.masterFile : conversion.tableDefinitionFile;
  const { pick, hiddenInput } = useFileSelection(kind);
  return (
    <div className="space-y-3">
      {file ? (
        <SelectedFileInfo
          file={file}
          {...(!PROCESSING.includes(conversion.conversionStatus)
            ? { onClear: () => setFile(null, kind) }
            : {})}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
          <FileSpreadsheet className="h-5 w-5" />
          未選択（対応形式: {FILE_RULES[kind].extensions.map((e) => "." + e).join(", ")}）
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={pick}
        disabled={PROCESSING.includes(conversion.conversionStatus)}
      >
        <FolderOpen />
        {file ? "ファイルを変更" : "ファイルを選択"}
      </Button>
      {hiddenInput}
    </div>
  );
}

import { Check, FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppState } from "@/lib/app-state";
import { StatusBadge } from "./status";

export const STEPS = ["ファイル選択", "フォーマット確認", "データ解析", "検証", "SQL生成"];

export function StepProgress({ current, errorAt }: { current: number; errorAt?: number | undefined }) {
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
                {err ? <X className="h-3.5 w-3.5" /> : done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("text-xs font-medium", active || done ? "text-foreground" : "text-muted-foreground", err && "text-destructive")}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className={cn("mx-3 h-px flex-1", done ? "bg-success" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

export function FileDropzone({ fileName, size }: { fileName: string; size: string }) {
  const { uploaded, setUploaded } = useAppState();
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); setUploaded(true); }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors",
          drag ? "border-primary bg-info-soft" : "border-input hover:border-primary/60 hover:bg-muted/50",
        )}
      >
        <UploadCloud className={cn("h-8 w-8", drag ? "text-primary" : "text-muted-foreground")} />
        <p className="mt-2 text-sm font-medium">ここにマスタファイルをドラッグ＆ドロップ</p>
        <p className="mt-0.5 text-xs text-muted-foreground">またはクリックしてファイルを選択</p>
        <p className="mt-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">対応形式: .xlsm</p>
        <input ref={input} type="file" accept=".xlsm" className="hidden" onChange={() => setUploaded(true)} />
      </div>
      {uploaded && (
        <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2.5">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs font-medium">{fileName}</p>
            <p className="text-[11px] text-muted-foreground">{size} ・ アップロード完了</p>
          </div>
          <StatusBadge status="success" label="読込完了" />
          <button
            onClick={() => setUploaded(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="ファイルを削除"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ScenarioSwitch() {
  const { scenario, setScenario } = useAppState();
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted p-0.5 text-xs">
      <span className="px-2 text-muted-foreground">デモ:</span>
      {(["success", "error"] as const).map((s) => (
        <button
          key={s}
          onClick={() => setScenario(s)}
          className={cn(
            "rounded px-2 py-1 font-medium transition-colors",
            scenario === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s === "success" ? "正常シナリオ" : "エラーシナリオ"}
        </button>
      ))}
    </div>
  );
}

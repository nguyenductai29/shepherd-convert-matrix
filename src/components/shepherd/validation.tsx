import { AlertTriangle, CheckCircle2, ChevronRight, Rows3, XCircle } from "lucide-react";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import type { ValidationIssue } from "@/lib/mock-data";
import { StatCard, StatusBadge } from "./status";

export function ValidationSummary({ total, ok, errors, warnings }: { total: number; ok: number; errors: number; warnings: number }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard label="総レコード数" value={total.toLocaleString()} icon={Rows3} />
      <StatCard label="正常" value={ok.toLocaleString()} icon={CheckCircle2} tone="success" />
      <StatCard label="エラー" value={errors} icon={XCircle} tone={errors ? "error" : "default"} />
      <StatCard label="警告" value={warnings} icon={AlertTriangle} tone={warnings ? "warning" : "default"} />
    </div>
  );
}

export function ValidationTable({ issues }: { issues: ValidationIssue[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!issues.length)
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
        <CheckCircle2 className="h-6 w-6 text-success" />
        該当する項目はありません
      </div>
    );
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/60 text-left text-muted-foreground">
        <tr>
          {["", "レベル", "シート", "行", "テーブル", "カラム", "値", "エラー内容"].map((h) => (
            <th key={h} className="px-3 py-2 font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {issues.map((i) => (
          <Fragment key={i.id}>
            <tr
              onClick={() => setOpen(open === i.id ? null : i.id)}
              className={cn("cursor-pointer border-t hover:bg-muted/40", open === i.id && "bg-muted/40")}
            >
              <td className="w-6 px-3 py-2">
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open === i.id && "rotate-90")} />
              </td>
              <td className="px-3 py-2"><StatusBadge status={i.level} label={i.level.toUpperCase()} /></td>
              <td className="px-3 py-2">{i.sheet}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{i.row}</td>
              <td className="px-3 py-2 font-mono">{i.table}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{i.column}</td>
              <td className="px-3 py-2 font-mono">{i.value}</td>
              <td className={cn("px-3 py-2 font-medium", i.level === "error" ? "text-destructive" : "text-warning")}>{i.message}</td>
            </tr>
            {open === i.id && (
              <tr className="border-t bg-muted/20">
                <td />
                <td colSpan={7} className="px-3 py-3">
                  <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5">
                    <span className="text-muted-foreground">詳細</span><span>{i.detail}</span>
                    <span className="text-muted-foreground">対象</span><span className="font-mono">{i.table}.{i.column}</span>
                    <span className="text-muted-foreground">Excel位置</span><span className="font-mono">シート「{i.sheet}」 行 {i.row}</span>
                    <span className="text-muted-foreground">対応</span><span>マスタ整備ファイルを修正し、再アップロードしてください。</span>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

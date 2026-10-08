import { AlertTriangle, CheckCircle2, ChevronRight, Rows3, XCircle } from "lucide-react";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import type { ValidationItem } from "@/models";
import { StatCard, StatusBadge } from "./status";

export function ValidationSummary({
  total,
  ok,
  errors,
  warnings,
}: {
  total: number;
  ok: number;
  errors: number;
  warnings: number;
}) {
  return (
    <div className="grid shrink-0 grid-cols-4 gap-3">
      <StatCard compact label="総レコード数" value={total.toLocaleString()} icon={Rows3} />
      <StatCard
        compact
        label="正常"
        value={ok.toLocaleString()}
        icon={CheckCircle2}
        tone="success"
      />
      <StatCard
        compact
        label="エラー"
        value={errors}
        icon={XCircle}
        tone={errors ? "error" : "default"}
      />
      <StatCard
        compact
        label="警告"
        value={warnings}
        icon={AlertTriangle}
        tone={warnings ? "warning" : "default"}
      />
    </div>
  );
}

const rows = (i: ValidationItem) =>
  i.sourceRow == null ? "—" : [i.sourceRow, ...(i.relatedRows ?? [])].join(", ");
const show = (v: unknown) => (v == null || v === "" ? "—" : String(v));

export function ValidationTable({
  items,
  fill = false,
}: {
  items: ValidationItem[];
  fill?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / pageSize) - 1));
  if (!items.length)
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
        <CheckCircle2 className="h-6 w-6 text-success" />
        該当する項目はありません
      </div>
    );
  return (
    <div className={cn("min-w-0", fill && "flex h-full min-h-0 flex-1 flex-col overflow-hidden")}>
      <div
        data-primary-scroll="validation-table"
        className={cn("overflow-auto", fill && "min-h-0 flex-1")}
      >
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              {["", "レベル", "シート", "行", "テーブル", "カラム", "値", "エラー内容"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((i, idx) => (
              <Fragment key={idx}>
                <tr
                  onClick={() => setOpen(open === idx ? null : idx)}
                  className={cn(
                    "cursor-pointer border-t hover:bg-muted/40",
                    open === idx && "bg-muted/40",
                  )}
                >
                  <td className="w-6 px-3 py-2">
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform",
                        open === idx && "rotate-90",
                      )}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      status={i.severity === "ok" ? "success" : i.severity}
                      label={i.severity.toUpperCase()}
                    />
                  </td>
                  <td className="px-3 py-2">{show(i.sourceSheet)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{rows(i)}</td>
                  <td className="px-3 py-2 font-mono">{show(i.table)}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{show(i.column)}</td>
                  <td className="px-3 py-2 font-mono">{show(i.value)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 font-medium",
                      i.severity === "error"
                        ? "text-destructive"
                        : i.severity === "warning"
                          ? "text-warning"
                          : "text-success",
                    )}
                  >
                    {i.message}
                  </td>
                </tr>
                {open === idx && (
                  <tr className="border-t bg-muted/20">
                    <td />
                    <td colSpan={7} className="px-3 py-3">
                      <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5">
                        <span className="text-muted-foreground">分類</span>
                        <span>{i.category}</span>
                        {i.detail && (
                          <>
                            <span className="text-muted-foreground">詳細</span>
                            <span>{i.detail}</span>
                          </>
                        )}
                        {i.table && (
                          <>
                            <span className="text-muted-foreground">対象</span>
                            <span className="font-mono">
                              {i.table}
                              {i.column ? `.${i.column}` : ""}
                            </span>
                          </>
                        )}
                        {i.sourceSheet && (
                          <>
                            <span className="text-muted-foreground">Excel位置</span>
                            <span className="font-mono">
                              シート「{i.sourceSheet}」 行 {rows(i)}
                            </span>
                          </>
                        )}
                        <span className="text-muted-foreground">対応</span>
                        <span>マスタ整備ファイルを修正し、再度選択してください。</span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > pageSize && (
        <div className="flex shrink-0 items-center justify-end gap-4 border-t px-3 py-2 text-xs">
          <button
            disabled={currentPage === 0}
            onClick={() => {
              setPage(currentPage - 1);
              setOpen(null);
            }}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            前へ
          </button>
          <span>
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, items.length)} /{" "}
            {items.length} 件
          </span>
          <button
            disabled={(currentPage + 1) * pageSize >= items.length}
            onClick={() => {
              setPage(currentPage + 1);
              setOpen(null);
            }}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}

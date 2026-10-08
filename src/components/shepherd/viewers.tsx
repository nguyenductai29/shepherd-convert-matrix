import {
  ArrowRight,
  Check,
  ChevronDown,
  Database,
  FileSpreadsheet,
  KeyRound,
  Lock,
} from "lucide-react";
import { Fragment, useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SheetMapping } from "@/models";
import type { HistoryEntry as HistoryRow } from "@/services/platform/history";
import type { TableDefinition as TableDef } from "@/models";
import { StatusBadge } from "./status";
import { Link } from "@tanstack/react-router";

/* ---------- SQL ---------- */
function highlight(line: string): ReactNode {
  if (line.trim().startsWith("--")) return <span className="text-code-comment">{line}</span>;
  const parts = line.split(
    /('(?:[^']|'')*'|b'[01]'|\b(?:START|TRANSACTION|INSERT|INTO|VALUES|COMMIT|SELECT|FROM|WHERE)\b)/g,
  );
  return parts.map((p, i) =>
    /^b?'/.test(p) ? (
      <span key={i} className="text-code-string">
        {p}
      </span>
    ) : /^(START|TRANSACTION|INSERT|INTO|VALUES|COMMIT|SELECT|FROM|WHERE)$/.test(p) ? (
      <span key={i} className="font-semibold text-code-keyword">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** Splits SQL into sections at each "INSERT INTO <table>" (including the preceding comment block). */
export function sqlTableSections(
  sql: string,
): { table: string; startLine: number; statements: number }[] {
  const lines = sql.split("\n");
  const out: { table: string; startLine: number; statements: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^\s*INSERT\s+INTO\s+`?([\w.]+)`?/i.exec(l);
    if (!m) return;
    const existing = out.find((s) => s.table === m[1]);
    if (existing) {
      existing.statements++;
      return;
    }
    let start = i;
    while (
      start > 0 &&
      (lines[start - 1]!.trim().startsWith("--") || lines[start - 1]!.trim() === "")
    )
      start--;
    while (start < i && lines[start]!.trim() === "") start++;
    out.push({ table: m[1]!, startLine: start, statements: 1 });
  });
  return out;
}

export function SQLCodeViewer({
  sql,
  selected,
  search = "",
}: {
  sql: string;
  selected?: string | undefined;
  search?: string;
}) {
  const lines = useMemo(() => sql.split("\n"), [sql]);
  const sections = useMemo(() => sqlTableSections(sql), [sql]);
  const selectedIndex = sections.findIndex((section) => section.table === selected);
  const selectedStart = selectedIndex >= 0 ? sections[selectedIndex]!.startLine : -1;
  const selectedEnd =
    selectedIndex >= 0 ? (sections[selectedIndex + 1]?.startLine ?? lines.length) : -1;
  const visible = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index }))
        .filter((row) => !search || row.line.toLowerCase().includes(search.toLowerCase())),
    [lines, search],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(800);
  const lineHeight = 21;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setHeight(element.clientHeight || 800);
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const top = search ? 0 : Math.max(0, selectedStart) * lineHeight;
    if (viewport.current) viewport.current.scrollTop = top;
    setScrollTop(top);
  }, [selectedStart, search, sql]);
  const start = Math.max(0, Math.min(Math.floor(scrollTop / lineHeight) - 8, visible.length - 1));
  const end = Math.min(visible.length, start + Math.ceil(height / lineHeight) + 16);
  return (
    <div
      ref={viewport}
      data-primary-scroll="sql"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="h-full min-h-0 overflow-auto bg-code py-3 font-mono text-[12.5px] text-code-foreground"
      aria-label="SQL本文"
    >
      {!visible.length && <p className="px-4 text-code-muted">該当する行はありません。</p>}
      <div
        style={{
          paddingTop: start * lineHeight,
          paddingBottom: (visible.length - end) * lineHeight,
          width: "max-content",
          minWidth: "100%",
        }}
      >
        {visible.slice(start, end).map(({ line, index }) => (
          <div
            key={index}
            data-sql-line={index + 1}
            style={{ height: lineHeight, lineHeight: `${lineHeight}px` }}
            className={cn(
              "flex whitespace-pre border-l-2 border-transparent",
              index >= selectedStart &&
                index < selectedEnd &&
                "border-code-keyword bg-code-foreground/5",
            )}
          >
            <span className="w-16 shrink-0 select-none pr-4 text-right text-code-muted">
              {index + 1}
            </span>
            <span>{highlight(line)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Table definition ---------- */
export function TableDefinitionViewer({ table }: { table: TableDef }) {
  const yes = <Check className="mx-auto h-3.5 w-3.5 text-success" />;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="font-mono text-lg font-semibold">{table.name}</h2>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {table.logical} ・ {table.columns.length} カラム
        </p>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              {[
                "カラム名",
                "論理名",
                "データ型",
                "NULL",
                "PK",
                "UNIQUE",
                "DEFAULT",
                "AUTO_INCREMENT",
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.columns.map((c) => (
              <tr key={c.name} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {c.pk && <KeyRound className="h-3 w-3 text-warning" />}
                    {c.name}
                  </span>
                </td>
                <td className="px-3 py-2">{c.logical}</td>
                <td className="px-3 py-2 font-mono text-info">{c.type}</td>
                <td className="px-3 py-2 font-mono">{c.nullable ? "YES" : "NO"}</td>
                <td className="px-3 py-2 text-center">
                  {c.pk && (
                    <span className="rounded bg-warning-soft px-1 font-mono text-[10px] font-semibold text-warning">
                      PK
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {c.unique && (
                    <span className="rounded bg-info-soft px-1 font-mono text-[10px] font-semibold text-info">
                      UNIQUE
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{c.def}</td>
                <td className="px-3 py-2">{c.ai && yes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">インデックス</h3>
        <div className="grid grid-cols-2 gap-2">
          {table.indexes.map((ix) => (
            <div key={ix.name} className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                    ix.type === "PRIMARY KEY"
                      ? "bg-warning-soft text-warning"
                      : ix.type === "UNIQUE"
                        ? "bg-info-soft text-info"
                        : "bg-neutral-soft text-muted-foreground",
                  )}
                >
                  {ix.type}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{ix.name}</span>
              </div>
              <div
                className={cn(
                  "mt-2 flex flex-wrap items-center gap-1",
                  ix.columns.length > 1 && "rounded border border-dashed p-1.5",
                )}
              >
                {ix.columns.map((c, i) => (
                  <Fragment key={c}>
                    {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c}</code>
                  </Fragment>
                ))}
                {ix.columns.length > 1 && (
                  <span className="ml-auto text-[10px] text-muted-foreground">複合</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Mapping ---------- */
export function MappingCard({
  group,
  defaultOpen,
}: {
  group: SheetMapping;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-md border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <FileSpreadsheet className="h-4 w-4 text-success" />
        <span className="text-sm font-medium">シート「{group.sheet}」</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Database className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm">{group.table}</span>
        <span className="ml-auto text-xs text-muted-foreground">{group.mappings.length} 項目</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-1.5 border-t p-3">
          {group.mappings.map((m) => (
            <div
              key={m.excel + m.column}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
            >
              <div className="rounded border bg-success-soft/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Excel ・ {group.sheet}</p>
                <p className="text-sm font-medium">{m.excel}</p>
              </div>
              <div className="flex flex-col items-center">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                {m.note && (
                  <span className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">
                    {m.note}
                  </span>
                )}
              </div>
              <div className="rounded border bg-info-soft/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">DB ・ {group.table}</p>
                <p className="font-mono text-sm font-medium">{m.column}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FixedMappingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border bg-neutral-soft px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Lock className="h-3 w-3" />
      固定マッピング
    </span>
  );
}

/* ---------- History ---------- */
export function ConversionHistoryTable({
  rows,
  compact,
}: {
  rows: HistoryRow[];
  compact?: boolean;
}) {
  const btn = "rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-accent";
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
        <tr>
          <th className="px-4 py-2 font-medium">実行日時</th>
          <th className="px-4 py-2 font-medium">マスタファイル</th>
          {!compact && <th className="px-4 py-2 text-right font-medium">テーブル数</th>}
          <th className="px-4 py-2 text-right font-medium">レコード数</th>
          <th className="px-4 py-2 text-right font-medium">エラー</th>
          {!compact && <th className="px-4 py-2 font-medium">実行者</th>}
          <th className="px-4 py-2 font-medium">ステータス</th>
          <th className="px-4 py-2 font-medium">操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t hover:bg-muted/30">
            <td className="px-4 py-2.5 font-mono tabular-nums">
              {new Date(r.executedAt).toLocaleString("ja-JP")}
            </td>
            <td className="max-w-[260px] truncate px-4 py-2.5 font-mono" title={r.file}>
              {r.file}
            </td>
            {!compact && (
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.tables}</td>
            )}
            <td className="px-4 py-2.5 text-right font-mono tabular-nums">
              {r.records.toLocaleString()}
            </td>
            <td
              className={cn(
                "px-4 py-2.5 text-right font-mono tabular-nums",
                r.errors > 0 && "font-semibold text-destructive",
              )}
            >
              {r.errors}
            </td>
            {!compact && <td className="px-4 py-2.5">{r.user}</td>}
            <td className="px-4 py-2.5">
              <StatusBadge status={r.status} />
            </td>
            <td className="px-4 py-2.5">
              <div className="flex gap-0.5">
                <Link to="/history/$id" params={{ id: r.id }} className={btn}>
                  詳細
                </Link>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

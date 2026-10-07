import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Download, FileCode2, FileJson, FileSpreadsheet, Rows3, Table2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard, StatusBadge } from "@/components/shepherd/status";
import { generatedFiles, history } from "@/lib/mock-data";

export const Route = createFileRoute("/history_/$id")({
  loader: ({ params }) => {
    const row = history.find((h) => h.id === params.id);
    if (!row) throw notFound();
    return { row };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `変換詳細 ${loaderData.row.executedAt} — Shepherd` },
          { name: "description", content: `${loaderData.row.file} の変換結果詳細` },
          { property: "og:title", content: `変換詳細 ${loaderData.row.executedAt} — Shepherd` },
          { property: "og:description", content: "変換結果の基本情報・統計・生成ファイル。" },
        ]
      : [{ title: "Not found" }, { name: "robots", content: "noindex" }],
  }),
  component: DetailPage,
});

function DetailPage() {
  const { row } = Route.useLoaderData();
  const iconFor = (n: string) => (n.endsWith(".sql") ? FileCode2 : n.endsWith(".xlsx") ? FileSpreadsheet : FileJson);
  return (
    <>
      <PageHeader
        title="変換詳細"
        subtitle={`ID ${row.id}`}
        actions={<Button variant="outline" size="sm" asChild><Link to="/history"><ArrowLeft />履歴へ戻る</Link></Button>}
      />
      <div className="space-y-6 p-8">
        <Section title="基本情報">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2.5 p-4 text-sm">
            <dt className="text-muted-foreground">ファイル</dt><dd className="font-mono text-xs">{row.file}</dd>
            <dt className="text-muted-foreground">実行日時</dt><dd className="font-mono text-xs">{row.executedAt}</dd>
            <dt className="text-muted-foreground">実行者</dt><dd>{row.user}</dd>
            <dt className="text-muted-foreground">結果</dt><dd><StatusBadge status={row.status} /></dd>
          </dl>
        </Section>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="テーブル数" value={row.tables} icon={Table2} />
          <StatCard label="レコード数" value={row.records.toLocaleString()} icon={Rows3} />
          <StatCard label="エラー" value={row.errors} icon={XCircle} tone={row.errors ? "error" : "success"} />
          <StatCard label="警告" value={row.warnings} icon={AlertTriangle} tone={row.warnings ? "warning" : "default"} />
        </div>
        <Section title="生成ファイル">
          <ul className="divide-y">
            {generatedFiles.map((f) => {
              const Icon = iconFor(f.name);
              return (
                <li key={f.name} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 font-mono text-xs">{f.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{f.size}</span>
                  <Button variant="ghost" size="sm" onClick={() => toast.info(`${f.name} をダウンロード（モック）`)}><Download />ダウンロード</Button>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </>
  );
}

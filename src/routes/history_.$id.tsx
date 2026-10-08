import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  Rows3,
  Table2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard, StatusBadge } from "@/components/shepherd/status";
import { getHistory } from "@/services/platform/history";
import { revealInFolder } from "@/services/platform/files";
import { ValidationTable } from "@/components/shepherd/validation";

export const Route = createFileRoute("/history_/$id")({
  loader: async ({ params }) => {
    const row = await getHistory(params.id);
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
  const iconFor = (n: string) =>
    n.endsWith(".sql") ? FileCode2 : n.endsWith(".xlsx") ? FileSpreadsheet : FileJson;
  return (
    <>
      <PageHeader
        title="変換詳細"
        subtitle={`ID ${row.id}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/history">
              <ArrowLeft />
              履歴へ戻る
            </Link>
          </Button>
        }
      />
      <div
        data-page-content="history-detail"
        data-primary-scroll="history-detail"
        className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-3 xl:px-6"
      >
        <Section title="基本情報">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2.5 p-4 text-sm">
            <dt className="text-muted-foreground">ファイル</dt>
            <dd className="truncate font-mono text-xs" title={row.file}>
              {row.file}
            </dd>
            <dt className="text-muted-foreground">実行日時</dt>
            <dd className="font-mono text-xs">
              {new Date(row.executedAt).toLocaleString("ja-JP")}
            </dd>
            <dt className="text-muted-foreground">マスタパス</dt>
            <dd className="truncate font-mono text-xs" title={row.masterFilepath ?? undefined}>
              {row.masterFilepath ?? "ブラウザ選択"}
            </dd>
            <dt className="text-muted-foreground">テーブル定義書</dt>
            <dd>{row.tableDefinitionFilename}</dd>
            <dt className="text-muted-foreground">実行者</dt>
            <dd>{row.user}</dd>
            <dt className="text-muted-foreground">結果</dt>
            <dd>
              <StatusBadge status={row.status} />
            </dd>
          </dl>
        </Section>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="テーブル数" value={row.tables} icon={Table2} />
          <StatCard label="レコード数" value={row.records.toLocaleString()} icon={Rows3} />
          <StatCard
            label="エラー"
            value={row.errors}
            icon={XCircle}
            tone={row.errors ? "error" : "success"}
          />
          <StatCard
            label="警告"
            value={row.warnings}
            icon={AlertTriangle}
            tone={row.warnings ? "warning" : "default"}
          />
        </div>
        <Section title="生成ファイル">
          <ul className="divide-y">
            {row.outputFiles.map((path) => {
              const f = { name: path };
              const Icon = iconFor(path);
              return (
                <li key={f.name} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f.name}>
                    {f.name}
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void revealInFolder(path).catch(() =>
                        toast.error("保存ファイルが見つかりません。"),
                      );
                    }}
                  >
                    <Download />
                    フォルダを開く
                  </Button>
                </li>
              );
            })}
            {!row.outputFiles.length && (
              <li className="p-4 text-sm text-muted-foreground">保存済みファイルはありません。</li>
            )}
          </ul>
        </Section>
        {row.validation && (
          <Section title="この実行の検証結果">
            <ValidationTable items={row.validation.items} />
          </Section>
        )}
      </div>
    </>
  );
}

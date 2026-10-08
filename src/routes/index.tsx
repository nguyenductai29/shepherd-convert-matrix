import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertOctagon, ArrowRight, Clock, Rows3, Table2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard } from "@/components/shepherd/status";
import { ConversionHistoryTable } from "@/components/shepherd/viewers";
import { useAppState } from "@/state/app-state";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ダッシュボード — Shepherd Master SQL Generator" },
      {
        name: "description",
        content: "マスタ変換の概要、最近の変換結果と検証エラー数を確認できます。",
      },
      { property: "og:title", content: "ダッシュボード — Shepherd Master SQL Generator" },
      { property: "og:description", content: "マスタ変換の概要と最近の変換結果。" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { history, conversion } = useAppState();
  const last = history[0];
  return (
    <>
      <PageHeader
        title="Shepherd Master SQL Generator"
        subtitle="マスタ整備ファイルからDB登録用SQLを安全に生成するためのツール"
        actions={
          <Button asChild size="lg">
            <Link to="/convert">
              <Plus />
              新しいマスタを変換
            </Link>
          </Button>
        }
      />
      <div
        data-page-content="dashboard"
        data-primary-scroll="dashboard"
        className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-3 xl:px-6"
      >
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="対象テーブル数"
            value={conversion.tableDefinition?.tables.length ?? 0}
            icon={Table2}
            hint={conversion.tableDefinitionFile?.name ?? "未選択"}
          />
          <StatCard
            label="前回変換レコード数"
            value={last?.records.toLocaleString() ?? "—"}
            icon={Rows3}
          />
          <StatCard
            label="検証エラー"
            value={last?.errors ?? "—"}
            icon={AlertOctagon}
            tone="success"
            hint="前回実行時点"
          />
          <StatCard
            label="最終実行日時"
            value={
              <span className="text-lg">
                {last ? new Date(last.executedAt).toLocaleString("ja-JP") : "未実行"}
              </span>
            }
            icon={Clock}
          />
        </div>
        <Section
          title="最近の変換"
          actions={
            <Link
              to="/history"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              すべて表示
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <ConversionHistoryTable rows={history.slice(0, 5)} compact />
        </Section>
      </div>
    </>
  );
}

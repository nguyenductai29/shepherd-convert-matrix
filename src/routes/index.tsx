import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertOctagon, ArrowRight, Clock, Rows3, Table2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard } from "@/components/shepherd/status";
import { ConversionHistoryTable } from "@/components/shepherd/viewers";
import { history } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ダッシュボード — Shepherd Master SQL Generator" },
      { name: "description", content: "マスタ変換の概要、最近の変換結果と検証エラー数を確認できます。" },
      { property: "og:title", content: "ダッシュボード — Shepherd Master SQL Generator" },
      { property: "og:description", content: "マスタ変換の概要と最近の変換結果。" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <>
      <PageHeader
        title="Shepherd Master SQL Generator"
        subtitle="マスタ整備ファイルからDB登録用SQLを安全に生成するためのツール"
        actions={
          <Button asChild size="lg">
            <Link to="/convert"><Plus />新しいマスタを変換</Link>
          </Button>
        }
      />
      <div className="space-y-6 p-8">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="対象テーブル数" value="12" icon={Table2} hint="テーブル定義書(1).xlsx" />
          <StatCard label="前回変換レコード数" value="1,582" icon={Rows3} />
          <StatCard label="検証エラー" value="0" icon={AlertOctagon} tone="success" hint="前回実行時点" />
          <StatCard label="最終実行日時" value={<span className="text-lg">2026/10/07 11:55</span>} icon={Clock} />
        </div>
        <Section
          title="最近の変換"
          actions={
            <Link to="/history" className="flex items-center gap-1 text-xs text-primary hover:underline">
              すべて表示<ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <ConversionHistoryTable rows={history.slice(0, 5)} compact />
        </Section>
      </div>
    </>
  );
}

import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/shepherd/status";
import { ConversionHistoryTable } from "@/components/shepherd/viewers";
import { history } from "@/lib/mock-data";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "変換履歴 — Shepherd Master SQL Generator" },
      { name: "description", content: "過去のマスタ変換の実行履歴・結果・生成ファイルを確認します。" },
      { property: "og:title", content: "変換履歴 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "マスタ変換の実行履歴。" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const match = useMatchRoute();
  if (match({ to: "/history/$id" })) return <Outlet />;
  return (
    <>
      <PageHeader title="変換履歴" subtitle={`全 ${history.length} 件`} />
      <div className="p-8">
        <Section><ConversionHistoryTable rows={history} /></Section>
      </div>
    </>
  );
}

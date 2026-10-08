import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/shepherd/status";
import { ConversionHistoryTable } from "@/components/shepherd/viewers";
import { useAppState } from "@/state/app-state";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "変換履歴 — Shepherd Master SQL Generator" },
      {
        name: "description",
        content: "過去のマスタ変換の実行履歴・結果・生成ファイルを確認します。",
      },
      { property: "og:title", content: "変換履歴 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "マスタ変換の実行履歴。" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { history } = useAppState();
  const match = useMatchRoute();
  if (match({ to: "/history/$id" })) return <Outlet />;
  return (
    <>
      <PageHeader title="変換履歴" subtitle={`全 ${history.length} 件`} />
      <div
        data-page-content="history"
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3 xl:px-6"
      >
        <Section className="min-h-0 flex-1 overflow-hidden">
          <div data-primary-scroll="history" className="h-full overflow-auto">
            <ConversionHistoryTable rows={history} />
          </div>
        </Section>
      </div>
    </>
  );
}

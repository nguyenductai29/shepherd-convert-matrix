import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shepherd/status";
import { FixedMappingBadge, MappingCard } from "@/components/shepherd/viewers";
import { InfoAlert } from "@/components/shepherd/status";
import { sheetMappings } from "@/config/shepherd-master";

export const Route = createFileRoute("/mapping")({
  head: () => ({
    meta: [
      { title: "マッピング — Shepherd Master SQL Generator" },
      {
        name: "description",
        content: "Excelの列とDBカラムの固定マッピングを読み取り専用で確認します。",
      },
      { property: "og:title", content: "マッピング — Shepherd Master SQL Generator" },
      { property: "og:description", content: "Excel列からDBカラムへの固定マッピング。" },
    ],
  }),
  component: MappingPage,
});

function MappingPage() {
  return (
    <>
      <PageHeader
        title="マッピング設定"
        subtitle="Excel → DB のカラム対応（読み取り専用）"
        actions={<FixedMappingBadge />}
      />
      <div className="space-y-4 p-8">
        <InfoAlert title="お客様確定済みのExcelフォーマットに基づく固定マッピングです。">
          マッピングの変更はできません。フォーマット変更が必要な場合は開発チームへご連絡ください。
        </InfoAlert>
        <div className="space-y-2">
          {sheetMappings.map((g, i) => (
            <MappingCard key={g.sheet + g.table} group={g} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </>
  );
}

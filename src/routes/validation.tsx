import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Copy, Database, Download, KeySquare, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorAlert, InfoAlert, PageHeader, Section, StatusBadge, SuccessAlert } from "@/components/shepherd/status";
import { ValidationSummary, ValidationTable } from "@/components/shepherd/validation";
import { ScenarioSwitch } from "@/components/shepherd/workflow";
import { useAppState } from "@/state/app-state";
import { mockValidationResult } from "@/lib/mock-data";
import { saveTextFile } from "@/services/platform/files";
import { timestamp } from "@/services/platform/runtime";

export const Route = createFileRoute("/validation")({
  head: () => ({
    meta: [
      { title: "検証結果 — Shepherd Master SQL Generator" },
      { name: "description", content: "マスタデータの検証エラー・警告・重複チェック結果を確認します。" },
      { property: "og:title", content: "検証結果 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "検証エラー・警告・重複チェックの詳細。" },
    ],
  }),
  component: ValidationPage,
});

function ValidationPage() {
  const { scenario, conversion } = useAppState();
  const isMock = !conversion.validationResult;
  const r = conversion.validationResult ?? mockValidationResult(scenario);
  const errors = r.items.filter((i) => i.severity === "error");
  const warnings = r.items.filter((i) => i.severity === "warning");
  const intra = errors.filter((i) => i.category === "マスタ内重複");
  const uniq = errors.filter((i) => i.category === "UNIQUE制約");
  const canGenerate = conversion.conversionStatus === "ready-to-generate" || conversion.conversionStatus === "completed";

  const saveReport = async () => {
    const saved = await saveTextFile({
      defaultName: `validation_report_${timestamp()}.json`,
      content: JSON.stringify(r, null, 2),
      filterName: "JSON",
      extensions: ["json"],
    });
    if (saved) toast.success(saved === "download" ? "検証レポートをダウンロードしました" : `保存しました: ${saved}`);
  };

  return (
    <>
      <PageHeader
        title="検証結果"
        subtitle={conversion.masterFile?.name ?? "部門コード_Shepherd導入_マスタ整備ファイル.xlsm（サンプル）"}
        actions={
          <>
            <ScenarioSwitch />
            <Button variant="outline" size="sm" onClick={saveReport}><Download />レポート保存</Button>
            {canGenerate && r.errorCount === 0 ? (
              <Button asChild><Link to="/convert">SQL生成へ<ArrowRight /></Link></Button>
            ) : (
              <Button disabled>SQL生成</Button>
            )}
          </>
        }
      />
      <div className="space-y-6 p-8">
        {isMock && <InfoAlert title="サンプル表示中">マスタ変換を実行すると、ここに実際の検証結果が表示されます。</InfoAlert>}
        {r.errorCount ? (
          <ErrorAlert title="検証エラーが存在するためSQLを生成できません。">
            {r.errorCount} 件のエラーを修正後、マスタ整備ファイルを再度選択してください。
          </ErrorAlert>
        ) : (
          <SuccessAlert title="すべての検証が完了しました。SQLを生成できます。" />
        )}
        <ValidationSummary total={r.totalRecords} ok={r.okCount} errors={r.errorCount} warnings={r.warningCount} />

        <Section>
          <Tabs defaultValue="all">
            <div className="border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="all">すべて <span className="ml-1.5 font-mono text-[10px]">{r.items.length}</span></TabsTrigger>
                <TabsTrigger value="error">エラー <span className="ml-1.5 font-mono text-[10px]">{errors.length}</span></TabsTrigger>
                <TabsTrigger value="warning">警告 <span className="ml-1.5 font-mono text-[10px]">{warnings.length}</span></TabsTrigger>
                <TabsTrigger value="ok">正常 <span className="ml-1.5 font-mono text-[10px]">{r.okCount.toLocaleString()}</span></TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="all" className="m-0"><ValidationTable items={r.items} /></TabsContent>
            <TabsContent value="error" className="m-0"><ValidationTable items={errors} /></TabsContent>
            <TabsContent value="warning" className="m-0"><ValidationTable items={warnings} /></TabsContent>
            <TabsContent value="ok" className="m-0">
              <div className="py-10 text-center text-sm text-muted-foreground">{r.okCount.toLocaleString()} 件のレコードは問題ありません。</div>
            </TabsContent>
          </Tabs>
        </Section>

        <div>
          <h2 className="mb-3 text-sm font-semibold">重複チェック</h2>
          <div className="grid grid-cols-3 gap-3">
            <DupCard icon={Copy} title="マスタ内重複" desc="アップロードしたExcel内の重複データを検出" status={intra.length ? "error" : "success"} result={intra.length ? `${intra.length} 件の重複` : "重複なし"}>
              {intra.slice(0, 2).map((i, k) => (
                <div key={k} className="rounded border border-destructive/30 bg-danger-soft/60 p-2 text-[11px]">
                  <p className="font-mono">{i.table}.{i.column} = '{String(i.value)}'</p>
                  <p className="text-muted-foreground">行: {[i.sourceRow, ...(i.relatedRows ?? [])].join(", ")}</p>
                  {i.detail && <p className="mt-1 font-medium text-destructive">{i.detail}</p>}
                </div>
              ))}
            </DupCard>
            <DupCard icon={KeySquare} title="UNIQUE制約" desc="DBのUNIQUEインデックスに基づく重複チェック" status={uniq.length ? "error" : "success"} result={uniq.length ? `${uniq.length} 件の違反` : "違反なし"}>
              {uniq[0]?.column && <code className="block rounded bg-muted px-2 py-1 font-mono text-[11px]">{uniq[0].column}</code>}
            </DupCard>
            <DupCard icon={Database} title="DB既存データ" desc="現在のデータベースとの重複を比較（今後実装）" status="disconnected" result="未接続">
              <Button variant="outline" size="sm" asChild className="w-full"><Link to="/settings"><PlugZap />DB接続設定</Link></Button>
            </DupCard>
          </div>
        </div>
      </div>
    </>
  );
}

function DupCard({ icon: Icon, title, desc, status, result, children }: { icon: typeof Copy; title: string; desc: string; status: "error" | "success" | "disconnected"; result: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-semibold">{title}</span></div>
        <StatusBadge status={status} label={result} />
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      {children}
    </div>
  );
}

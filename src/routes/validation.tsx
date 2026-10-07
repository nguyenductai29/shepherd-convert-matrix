import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Copy, Database, KeySquare, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorAlert, PageHeader, Section, StatusBadge, SuccessAlert } from "@/components/shepherd/status";
import { ValidationSummary, ValidationTable } from "@/components/shepherd/validation";
import { ScenarioSwitch } from "@/components/shepherd/workflow";
import { useAppState } from "@/lib/app-state";
import { validationIssues, validationSummary } from "@/lib/mock-data";

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
  const { scenario } = useAppState();
  const s = validationSummary(scenario);
  const issues = validationIssues(scenario);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const intra = errors.filter((i) => i.category === "intra").length;
  const uniq = errors.filter((i) => i.category === "unique").length;

  return (
    <>
      <PageHeader
        title="検証結果"
        subtitle="部門コード_Shepherd導入_マスタ整備ファイル.xlsm ・ 2026/10/07 11:55"
        actions={
          <>
            <ScenarioSwitch />
            {s.errors ? <Button disabled>SQL生成</Button> : <Button asChild><Link to="/sql">SQL生成<ArrowRight /></Link></Button>}
          </>
        }
      />
      <div className="space-y-6 p-8">
        {s.errors ? (
          <ErrorAlert title="検証エラーが存在するためSQLを生成できません。">
            {s.errors} 件のエラーを修正後、マスタ整備ファイルを再アップロードしてください。
          </ErrorAlert>
        ) : (
          <SuccessAlert title="すべての検証が完了しました。SQLを生成できます。" />
        )}
        <ValidationSummary {...s} />

        <Section>
          <Tabs defaultValue="all">
            <div className="border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="all">すべて <span className="ml-1.5 font-mono text-[10px]">{issues.length}</span></TabsTrigger>
                <TabsTrigger value="error">エラー <span className="ml-1.5 font-mono text-[10px]">{errors.length}</span></TabsTrigger>
                <TabsTrigger value="warning">警告 <span className="ml-1.5 font-mono text-[10px]">{warnings.length}</span></TabsTrigger>
                <TabsTrigger value="ok">正常 <span className="ml-1.5 font-mono text-[10px]">{s.ok.toLocaleString()}</span></TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="all" className="m-0"><ValidationTable issues={issues} /></TabsContent>
            <TabsContent value="error" className="m-0"><ValidationTable issues={errors} /></TabsContent>
            <TabsContent value="warning" className="m-0"><ValidationTable issues={warnings} /></TabsContent>
            <TabsContent value="ok" className="m-0">
              <div className="py-10 text-center text-sm text-muted-foreground">
                {s.ok.toLocaleString()} 件のレコードは問題ありません。
              </div>
            </TabsContent>
          </Tabs>
        </Section>

        <div>
          <h2 className="mb-3 text-sm font-semibold">重複チェック</h2>
          <div className="grid grid-cols-3 gap-3">
            <DupCard icon={Copy} title="マスタ内重複" desc="アップロードしたExcel内の重複データを検出" status={intra ? "error" : "success"} result={intra ? `${intra} 件の重複` : "重複なし"}>
              {intra > 0 && (
                <div className="rounded border border-destructive/30 bg-danger-soft/60 p-2 text-[11px]">
                  <p className="font-mono">m_departments.department_code = 'HPK'</p>
                  <p className="text-muted-foreground">行: 12, 35</p>
                  <p className="mt-1 font-medium text-destructive">同一の部門コードがマスタ内に複数存在します。</p>
                </div>
              )}
            </DupCard>
            <DupCard icon={KeySquare} title="UNIQUE制約" desc="DBのUNIQUEインデックスに基づく重複チェック" status={uniq ? "error" : "success"} result={uniq ? `${uniq} 件の違反` : "違反なし"}>
              <code className="block rounded bg-muted px-2 py-1 font-mono text-[11px]">department_id + process_group_name</code>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Eye, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorAlert, PageHeader, Section, StatusBadge, SuccessAlert } from "@/components/shepherd/status";
import { FileDropzone, ScenarioSwitch, StepProgress } from "@/components/shepherd/workflow";
import { MappingCard } from "@/components/shepherd/viewers";
import { useAppState } from "@/lib/app-state";
import { DEFINITION_FILE, MASTER_FILE, formatChecks, parsedTables, recordPreview, relations, sheetMappings, validationSummary } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/convert")({
  head: () => ({
    meta: [
      { title: "マスタ変換 — Shepherd Master SQL Generator" },
      { name: "description", content: "マスタ整備ファイルをアップロードし、フォーマット確認・解析・検証を経てSQLを生成します。" },
      { property: "og:title", content: "マスタ変換 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "ファイル選択からSQL生成までのステップ型ワークフロー。" },
    ],
  }),
  component: ConvertPage,
});

function ConvertPage() {
  const { uploaded, scenario } = useAppState();
  const summary = validationSummary(scenario);
  const hasError = summary.errors > 0;
  const checks = formatChecks(scenario);

  return (
    <>
      <PageHeader title="マスタ変換" subtitle="Shepherd導入用マスタ整備ファイルからINSERT SQLを生成します" actions={<ScenarioSwitch />} />
      <div className="space-y-6 p-8">
        <StepProgress current={uploaded ? (hasError ? 3 : 4) : 0} errorAt={uploaded && hasError ? 3 : undefined} />

        <div className="grid grid-cols-[2fr_3fr] gap-4">
          <Section title="テーブル定義書">
            <div className="space-y-4 p-4">
              <p className="text-xs text-muted-foreground">DBテーブル、カラム、型、PK、UNIQUE、NOT NULLなどの定義情報</p>
              <div className="flex items-center gap-3 rounded-md border bg-background p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-soft">
                  <Database className="h-5 w-5 text-info" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium">{DEFINITION_FILE}</p>
                  <p className="text-[11px] text-muted-foreground">12 テーブル ・ 148 カラム ・ 基準ファイル</p>
                </div>
                <StatusBadge status="success" label="設定済み" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"><RefreshCw />ファイルを変更</Button>
                <Button variant="outline" size="sm" asChild><Link to="/tables"><Eye />内容を確認</Link></Button>
              </div>
            </div>
          </Section>
          <Section title="マスタ整備ファイル">
            <div className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">お客様から提供されたShepherd導入用マスタデータ</p>
              <FileDropzone fileName={MASTER_FILE} size="2.4 MB" />
            </div>
          </Section>
        </div>

        {uploaded && (
          <>
            <Section
              title="フォーマットチェック"
              actions={
                <StatusBadge
                  status={checks.some((c) => c.status === "warning") ? "warning" : "success"}
                  label={checks.some((c) => c.status === "warning") ? "警告あり" : "フォーマット確認済み"}
                />
              }
            >
              <div className="grid grid-cols-3 gap-2 p-4">
                {checks.map((c) => {
                  const Icon = c.status === "success" ? CheckCircle2 : c.status === "warning" ? AlertTriangle : XCircle;
                  return (
                    <div key={c.label} className={cn("flex items-start gap-2.5 rounded-md border p-3",
                      c.status === "success" && "border-success/25 bg-success-soft/50",
                      c.status === "warning" && "border-warning/30 bg-warning-soft/60",
                      c.status === "error" && "border-destructive/30 bg-danger-soft/60")}>
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", c.status === "success" ? "text-success" : c.status === "warning" ? "text-warning" : "text-destructive")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{c.label}</span>
                          <span className={cn("font-mono text-[11px] font-semibold", c.status === "success" ? "text-success" : c.status === "warning" ? "text-warning" : "text-destructive")}>
                            {c.status === "success" ? "OK" : c.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="データ解析結果">
              <Tabs defaultValue="tables" className="p-4">
                <TabsList>
                  <TabsTrigger value="tables">テーブル一覧</TabsTrigger>
                  <TabsTrigger value="mapping">マッピング</TabsTrigger>
                  <TabsTrigger value="records">レコードプレビュー</TabsTrigger>
                  <TabsTrigger value="relations">リレーション</TabsTrigger>
                </TabsList>
                <TabsContent value="tables" className="mt-3 overflow-hidden rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-left text-muted-foreground">
                      <tr>{["テーブル名", "元シート", "レコード数", "PK", "UNIQUE", "ステータス"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {parsedTables(scenario).map((t) => (
                        <tr key={t.name} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono font-medium">{t.name}</td>
                          <td className="px-3 py-2">{t.sheet}</td>
                          <td className="px-3 py-2 font-mono tabular-nums">{t.records}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{t.pk}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{t.unique}</td>
                          <td className="px-3 py-2"><StatusBadge status={t.status} label={t.status === "success" ? "OK" : undefined} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
                <TabsContent value="mapping" className="mt-3 space-y-2">
                  {sheetMappings.slice(0, 3).map((g, i) => <MappingCard key={g.sheet} group={g} defaultOpen={i === 0} />)}
                </TabsContent>
                <TabsContent value="records" className="mt-3 overflow-hidden rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">m_departments ← シート「部門」（先頭5件）</div>
                  <table className="w-full font-mono text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>{Object.keys(recordPreview[0]!).map((k) => <th key={k} className="px-3 py-2 font-medium">{k === "row" ? "行" : k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {recordPreview.map((r) => (
                        <tr key={r.row} className={cn("border-t", scenario === "error" && r.department_code === "HPK" && "bg-danger-soft")}>
                          {Object.values(r).map((v, i) => <td key={i} className="px-3 py-1.5">{v}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
                <TabsContent value="relations" className="mt-3 space-y-1.5">
                  {relations.map((r) => (
                    <div key={r.from} className="flex items-center gap-3 rounded-md border px-3 py-2 font-mono text-xs">
                      <span>{r.from}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span>{r.to}</span>
                      <span className="ml-auto font-sans text-muted-foreground">{r.resolved} 件解決</span>
                      <StatusBadge status="success" label="OK" />
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </Section>

            {hasError ? (
              <ErrorAlert title="検証エラーが存在するためSQLを生成できません。" action={<Button variant="outline" size="sm" asChild><Link to="/validation">検証結果を確認</Link></Button>}>
                エラー {summary.errors} 件 ・ 警告 {summary.warnings} 件。マスタ整備ファイルを修正して再アップロードしてください。
              </ErrorAlert>
            ) : (
              <SuccessAlert title="すべての検証が完了しました。SQLを生成できます。">
                {summary.total.toLocaleString()} レコード検証済み ・ 警告 {summary.warnings} 件（生成は可能です）
              </SuccessAlert>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" asChild><Link to="/validation">検証結果</Link></Button>
              {hasError ? (
                <Button disabled>SQL生成<ArrowRight /></Button>
              ) : (
                <Button asChild><Link to="/sql">SQL生成<ArrowRight /></Link></Button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

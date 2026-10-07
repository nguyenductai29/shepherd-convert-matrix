import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, Loader2, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorAlert, InfoAlert, PageHeader, Section, StatusBadge, SuccessAlert } from "@/components/shepherd/status";
import { FileDropzone, FilePickerCard, ScenarioSwitch, StepProgress } from "@/components/shepherd/workflow";
import { MappingCard } from "@/components/shepherd/viewers";
import { useAppState } from "@/state/app-state";
import { PROCESSING, STATUS_LABEL, runAnalysis, runGeneration, stepFor } from "@/features/conversion/run-conversion";
import { recordPreview, relations, sheetMappings } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/convert")({
  head: () => ({
    meta: [
      { title: "マスタ変換 — Shepherd Master SQL Generator" },
      { name: "description", content: "マスタ整備ファイルを選択し、フォーマット確認・解析・検証を経てSQLを生成します。" },
      { property: "og:title", content: "マスタ変換 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "ファイル選択からSQL生成までのステップ型ワークフロー。" },
    ],
  }),
  component: ConvertPage,
});

function ConvertPage() {
  const { conversion, patchConversion } = useAppState();
  const navigate = useNavigate();
  const { conversionStatus: status, formatCheckResult: checks, parsedData, validationResult: vr } = conversion;
  const busy = PROCESSING.includes(status);
  const lastStep = !checks ? 1 : !checks.passed ? 1 : !parsedData ? 2 : !vr ? 3 : 4;
  const step = stepFor(status, lastStep);
  const canStart = !!conversion.masterFile && !!conversion.tableDefinitionFile && !busy;
  const canGenerate = status === "ready-to-generate" || status === "completed";

  const generate = async () => {
    await runGeneration(conversion, patchConversion);
    navigate({ to: "/sql" });
  };

  return (
    <>
      <PageHeader
        title="マスタ変換"
        subtitle="Shepherd導入用マスタ整備ファイルからINSERT SQLを生成します"
        actions={
          <>
            <ScenarioSwitch />
            <StatusBadge
              status={status === "validation-error" || status === "failed" ? "error" : busy ? "processing" : status === "completed" || status === "ready-to-generate" ? "success" : "idle"}
              label={STATUS_LABEL[status]}
            />
          </>
        }
      />
      <div className="space-y-6 p-8">
        <StepProgress current={step.current} errorAt={step.errorAt} busy={step.busy} />

        <div className="grid grid-cols-[2fr_3fr] gap-4">
          <Section title="テーブル定義書" actions={<Button variant="ghost" size="sm" asChild><Link to="/tables"><Eye />内容を確認</Link></Button>}>
            <div className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">DBテーブル、カラム、型、PK、UNIQUE、NOT NULLなどの定義情報</p>
              <FilePickerCard kind="tableDefinition" />
            </div>
          </Section>
          <Section title="マスタ整備ファイル">
            <div className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">お客様から提供されたShepherd導入用マスタデータ</p>
              <FileDropzone kind="master" />
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {canStart || busy ? "フォーマット確認 → データ解析 → 検証 を実行します。" : "テーブル定義書とマスタ整備ファイルを選択してください。"}
          </p>
          <Button onClick={() => runAnalysis(conversion, patchConversion)} disabled={!canStart}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {busy ? STATUS_LABEL[status] : checks ? "再実行" : "変換を開始"}
          </Button>
        </div>

        {status === "failed" && conversion.errorMessage && (
          <ErrorAlert title="処理に失敗しました">{conversion.errorMessage}</ErrorAlert>
        )}

        {checks && (
          <Section
            title="フォーマットチェック"
            actions={
              <StatusBadge
                status={!checks.passed ? "error" : checks.items.some((c) => c.status === "warning") ? "warning" : "success"}
                label={!checks.passed ? "フォーマットエラー" : checks.items.some((c) => c.status === "warning") ? "警告あり" : "フォーマット確認済み"}
              />
            }
          >
            <div className="grid grid-cols-3 gap-2 p-4">
              {checks.items.map((c) => {
                const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warning" ? AlertTriangle : XCircle;
                const tone = c.status === "ok" ? "text-success" : c.status === "warning" ? "text-warning" : "text-destructive";
                return (
                  <div key={c.label} className={cn("flex items-start gap-2.5 rounded-md border p-3",
                    c.status === "ok" && "border-success/25 bg-success-soft/50",
                    c.status === "warning" && "border-warning/30 bg-warning-soft/60",
                    c.status === "error" && "border-destructive/30 bg-danger-soft/60")}>
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{c.label}</span>
                        <span className={cn("font-mono text-[11px] font-semibold", tone)}>{c.status.toUpperCase()}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {parsedData && (
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
                    {parsedData.tables.map((t) => (
                      <tr key={t.name} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-medium">{t.name}</td>
                        <td className="px-3 py-2">{t.sheet}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{t.records}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{t.pk}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{t.unique}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={t.status === "ok" ? "success" : t.status} {...(t.status === "ok" ? { label: "OK" } : {})} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabsContent>
              <TabsContent value="mapping" className="mt-3 space-y-2">
                {sheetMappings.slice(0, 3).map((g, i) => <MappingCard key={g.sheet} group={g} defaultOpen={i === 0} />)}
              </TabsContent>
              <TabsContent value="records" className="mt-3 overflow-hidden rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">m_departments ← シート「部門」（先頭5件・モック）</div>
                <table className="w-full font-mono text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>{Object.keys(recordPreview[0]!).map((k) => <th key={k} className="px-3 py-2 font-medium">{k === "row" ? "行" : k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {recordPreview.map((r) => (
                      <tr key={r.row} className="border-t">
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
        )}

        {vr && (vr.errorCount > 0 ? (
          <ErrorAlert title="検証エラーが存在するためSQLを生成できません。" action={<Button variant="outline" size="sm" asChild><Link to="/validation">検証結果を確認</Link></Button>}>
            エラー {vr.errorCount} 件 ・ 警告 {vr.warningCount} 件。マスタ整備ファイルを修正して再度選択してください。
          </ErrorAlert>
        ) : (
          <SuccessAlert title="すべての検証が完了しました。SQLを生成できます。">
            {vr.totalRecords.toLocaleString()} レコード検証済み ・ 警告 {vr.warningCount} 件（生成は可能です）
          </SuccessAlert>
        ))}

        {status === "idle" && !checks && (
          <InfoAlert title="現在の処理はモック（仮データ）です">Excelの解析・検証・SQL生成は今後実装予定です。</InfoAlert>
        )}

        {vr && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild><Link to="/validation">検証結果</Link></Button>
            <Button onClick={generate} disabled={!canGenerate || busy}>
              {status === "generating" ? <Loader2 className="animate-spin" /> : null}SQL生成<ArrowRight />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

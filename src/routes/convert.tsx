import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, Loader2, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ErrorAlert,
  PageHeader,
  Section,
  StatusBadge,
  SuccessAlert,
  InfoAlert,
} from "@/components/shepherd/status";
import { ValidationTable } from "@/components/shepherd/validation";
import { FileDropzone, FilePickerCard, StepProgress } from "@/components/shepherd/workflow";
import { MappingCard } from "@/components/shepherd/viewers";
import { useAppState } from "@/state/app-state";
import {
  PROCESSING,
  STATUS_LABEL,
  runAnalysis,
  runGeneration,
  stepFor,
} from "@/features/conversion/run-conversion";
import { sheetMappings } from "@/config/shepherd-master";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/convert")({
  head: () => ({
    meta: [
      { title: "マスタ変換 — Shepherd Master SQL Generator" },
      {
        name: "description",
        content: "マスタ整備ファイルを選択し、フォーマット確認・解析・検証を経てSQLを生成します。",
      },
      { property: "og:title", content: "マスタ変換 — Shepherd Master SQL Generator" },
      {
        property: "og:description",
        content: "ファイル選択からSQL生成までのステップ型ワークフロー。",
      },
    ],
  }),
  component: ConvertPage,
});

function ConvertPage() {
  const { conversion, patchConversion, settings } = useAppState();
  const navigate = useNavigate();
  const {
    conversionStatus: status,
    formatCheckResult: checks,
    parsedData,
    validationResult: vr,
  } = conversion;
  const busy = conversion.referenceLoading || PROCESSING.includes(status);
  const preview = parsedData?.data.slice(0, 25) ?? [];
  const relations = (parsedData?.data ?? []).flatMap((record) =>
    Object.entries(record.values)
      .filter(([, value]) => typeof value === "object" && value !== null)
      .map(([column, value]) => ({
        from: `${record.targetTable}.${column}`,
        to: typeof value === "object" && value ? value.recordId : "",
        row: record.sourceRow,
      })),
  );
  const lastStep = !checks ? 1 : !checks.passed ? 1 : !parsedData ? 2 : !vr ? 3 : 4;
  const step = stepFor(status, lastStep);
  const canStart =
    !!conversion.masterFile &&
    !!conversion.tableDefinitionFile &&
    !!conversion.tableDefinition &&
    !!conversion.departmentReference &&
    settings.kbnDefinitions.length > 0 &&
    !settings.kbnSourceError &&
    !conversion.kbnDefinitionError &&
    !busy;
  const canGenerate =
    (status === "ready-to-generate" || status === "completed") && vr?.errorCount === 0;

  const generate = async () => {
    if (await runGeneration(conversion, patchConversion, settings)) await navigate({ to: "/sql" });
  };

  return (
    <>
      <PageHeader
        title="マスタ変換"
        subtitle="Shepherd導入用マスタ整備ファイルからINSERT SQLを生成します"
        actions={
          <>
            <StatusBadge
              status={
                status === "validation-error" || status === "failed"
                  ? "error"
                  : busy
                    ? "processing"
                    : status === "completed" || status === "ready-to-generate"
                      ? "success"
                      : "idle"
              }
              label={STATUS_LABEL[status]}
            />
          </>
        }
      />
      <div
        data-page-content="convert"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-3 xl:px-6"
      >
        <StepProgress current={step.current} errorAt={step.errorAt} busy={step.busy} />
        <div className="grid shrink-0 grid-cols-2 gap-3 min-[1100px]:grid-cols-4">
          <Section
            title="テーブル定義書"
            actions={
              <Link
                to="/tables"
                className="text-muted-foreground hover:text-primary"
                title="内容を確認"
                aria-label="テーブル定義書の内容を確認"
              >
                <Eye className="h-4 w-4" />
              </Link>
            }
          >
            <div className="p-3">
              <FilePickerCard kind="tableDefinition" compact />
            </div>
          </Section>
          <Section title="部門マスタ">
            <div className="p-3">
              <FilePickerCard kind="departmentReference" compact />
            </div>
          </Section>
          <Section title="区分名称マスタ">
            <div className="p-3">
              <FilePickerCard kind="kbnDefinition" compact />
            </div>
          </Section>
          <Section title="マスタ整備ファイル">
            <div className="p-3">
              <FileDropzone kind="master" compact />
            </div>
          </Section>
        </div>
        <div
          data-conversion-actions
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
        >
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {conversion.resolvedDepartment ? (
              <p className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">部門:</span>
                <span className="shrink-0 font-mono text-foreground">
                  {conversion.resolvedDepartment.departmentCode}
                </span>
                <span className="truncate" title={conversion.resolvedDepartment.departmentName}>
                  {conversion.resolvedDepartment.departmentName}
                </span>
                <span className="shrink-0 font-mono">
                  ID: {conversion.resolvedDepartment.departmentId}
                </span>
              </p>
            ) : (
              <p>
                {canStart || busy
                  ? "フォーマット確認 → データ解析 → 検証"
                  : "4つのファイルを選択してください（参照マスタ: .xlsx）。"}
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => runAnalysis(conversion, patchConversion, settings)}
            disabled={!canStart}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {busy
              ? conversion.referenceLoading
                ? "参照ファイル読込中"
                : (conversion.progressMessage ?? STATUS_LABEL[status])
              : checks
                ? "再実行"
                : "変換を開始"}
          </Button>
          {vr && (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link to="/validation">検証結果</Link>
              </Button>
              <Button size="sm" onClick={generate} disabled={!canGenerate || busy}>
                {status === "generating" && <Loader2 className="animate-spin" />}SQL生成
                <ArrowRight />
              </Button>
            </>
          )}
        </div>
        <Section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Tabs
            key={status === "failed" ? "failed" : parsedData ? "parsed" : "pending"}
            defaultValue={status === "failed" ? "format" : parsedData ? "analysis" : "format"}
            data-testid="conversion-results"
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="format">フォーマットチェック</TabsTrigger>
                <TabsTrigger value="analysis" disabled={!parsedData}>
                  データ解析結果
                </TabsTrigger>
                <TabsTrigger value="validation" disabled={!vr}>
                  検証結果{vr ? ` (${vr.errorCount} エラー)` : ""}
                </TabsTrigger>
              </TabsList>
              {vr && (
                <StatusBadge
                  status={vr.errorCount ? "error" : vr.warningCount ? "warning" : "success"}
                  label={`${vr.totalRecords.toLocaleString()} 件 ・ エラー ${vr.errorCount} ・ 警告 ${vr.warningCount}`}
                />
              )}
            </div>
            <TabsContent
              value="format"
              data-primary-scroll="conversion-format"
              className="m-0 min-h-0 flex-1 overflow-auto p-3"
            >
              {status === "failed" && conversion.errorMessage && (
                <ErrorAlert title="処理に失敗しました">
                  {conversion.errorMessage}
                  {conversion.errorDetail && (
                    <details className="mt-2">
                      <summary>詳細情報</summary>
                      <pre className="whitespace-pre-wrap text-xs">{conversion.errorDetail}</pre>
                    </details>
                  )}
                </ErrorAlert>
              )}

              {checks && (
                <Section
                  title="フォーマットチェック"
                  actions={
                    <StatusBadge
                      status={
                        !checks.passed
                          ? "error"
                          : checks.items.some((c) => c.status === "warning")
                            ? "warning"
                            : "success"
                      }
                      label={
                        !checks.passed
                          ? "フォーマットエラー"
                          : checks.items.some((c) => c.status === "warning")
                            ? "警告あり"
                            : "フォーマット確認済み"
                      }
                    />
                  }
                >
                  <div className="grid grid-cols-2 gap-2 p-3 xl:grid-cols-3">
                    {checks.items.map((c) => {
                      const Icon =
                        c.status === "ok"
                          ? CheckCircle2
                          : c.status === "warning"
                            ? AlertTriangle
                            : XCircle;
                      const tone =
                        c.status === "ok"
                          ? "text-success"
                          : c.status === "warning"
                            ? "text-warning"
                            : "text-destructive";
                      return (
                        <div
                          key={c.label}
                          className={cn(
                            "flex items-start gap-2.5 rounded-md border p-3",
                            c.status === "ok" && "border-success/25 bg-success-soft/50",
                            c.status === "warning" && "border-warning/30 bg-warning-soft/60",
                            c.status === "error" && "border-destructive/30 bg-danger-soft/60",
                          )}
                        >
                          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{c.label}</span>
                              <span className={cn("font-mono text-[11px] font-semibold", tone)}>
                                {c.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{c.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {!checks && status !== "failed" && (
                <InfoAlert
                  title={
                    busy ? "ファイルを確認しています。" : "ファイルを選択すると変換を開始できます。"
                  }
                >
                  テーブル定義書・部門マスタ・区分名称マスタは.xlsx、マスタ整備ファイルは.xlsm /
                  .xlsxに対応しています。
                </InfoAlert>
              )}
            </TabsContent>
            <TabsContent value="analysis" className="m-0 min-h-0 flex-1 overflow-hidden">
              {parsedData && (
                <Tabs defaultValue="tables" className="flex h-full min-h-0 flex-col p-3">
                  <TabsList className="shrink-0 self-start">
                    <TabsTrigger value="tables">テーブル一覧</TabsTrigger>
                    <TabsTrigger value="mapping">マッピング</TabsTrigger>
                    <TabsTrigger value="records">レコードプレビュー</TabsTrigger>
                    <TabsTrigger value="relations">リレーション</TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="tables"
                    data-primary-scroll="conversion-tables"
                    className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border"
                  >
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                        <tr>
                          {[
                            "テーブル名",
                            "元シート",
                            "レコード数",
                            "PK",
                            "UNIQUE",
                            "ステータス",
                          ].map((h) => (
                            <th key={h} className="px-3 py-2 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.tables.map((t) => (
                          <tr key={t.name} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono font-medium">{t.name}</td>
                            <td className="px-3 py-2">{t.sheet}</td>
                            <td className="px-3 py-2 font-mono tabular-nums">{t.records}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{t.pk}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">
                              {t.unique}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge
                                status={t.status === "ok" ? "success" : t.status}
                                {...(t.status === "ok" ? { label: "OK" } : {})}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TabsContent>
                  <TabsContent
                    value="mapping"
                    data-primary-scroll="conversion-mapping"
                    className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto"
                  >
                    {sheetMappings.slice(0, 3).map((g, i) => (
                      <MappingCard key={g.sheet + g.table} group={g} defaultOpen={i === 0} />
                    ))}
                  </TabsContent>
                  <TabsContent
                    value="records"
                    data-primary-scroll="conversion-records"
                    className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border"
                  >
                    <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                      正規化済みレコード（先頭25件）
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {["テーブル", "元シート", "行", "値"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((record) => (
                          <tr key={record.id} className="border-t">
                            <td className="px-3 py-2 font-mono">{record.targetTable}</td>
                            <td className="px-3 py-2">{record.sourceSheet}</td>
                            <td className="px-3 py-2">{record.sourceRow}</td>
                            <td className="max-w-lg break-all px-3 py-2 font-mono">
                              {JSON.stringify(record.values)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TabsContent>
                  <TabsContent
                    value="relations"
                    data-primary-scroll="conversion-relations"
                    className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto"
                  >
                    {relations.slice(0, 100).map((r, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-md border px-3 py-2 font-mono text-xs"
                      >
                        <span>{r.from}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{r.to}</span>
                        <span className="ml-auto font-sans text-muted-foreground">
                          元行 {r.row}
                        </span>
                        <StatusBadge status="success" label="OK" />
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>
            <TabsContent
              value="validation"
              className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              {vr &&
                (vr.errorCount > 0 ? (
                  <ErrorAlert
                    title="検証エラーが存在するためSQLを生成できません。"
                    action={
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/validation">検証結果を確認</Link>
                      </Button>
                    }
                  >
                    エラー {vr.errorCount} 件 ・ 警告 {vr.warningCount}{" "}
                    件。マスタ整備ファイルを修正して再度選択してください。
                  </ErrorAlert>
                ) : (
                  <SuccessAlert title="すべての検証が完了しました。SQLを生成できます。">
                    {vr.totalRecords.toLocaleString()} レコード検証済み ・ 警告 {vr.warningCount}{" "}
                    件（生成は可能です）
                  </SuccessAlert>
                ))}

              {vr && <ValidationTable items={vr.items} fill />}
            </TabsContent>
          </Tabs>
        </Section>
      </div>
    </>
  );
}

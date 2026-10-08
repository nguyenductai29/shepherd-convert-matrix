import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Download, FolderOpen, RefreshCw, Table2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorAlert, PageHeader } from "@/components/shepherd/status";
import { SQLCodeViewer, sqlTableSections } from "@/components/shepherd/viewers";
import { useAppState } from "@/state/app-state";
import { revealInFolder } from "@/services/platform/files";
import { isDesktop } from "@/services/platform/runtime";
import { saveConversion, runGeneration } from "@/features/conversion/run-conversion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sql")({
  head: () => ({
    meta: [
      { title: "SQLプレビュー — Shepherd Master SQL Generator" },
      {
        name: "description",
        content: "生成されたINSERT SQLをテーブル単位で確認・コピー・保存します。",
      },
      { property: "og:title", content: "SQLプレビュー — Shepherd Master SQL Generator" },
      { property: "og:description", content: "生成されたINSERT SQLのプレビュー。" },
    ],
  }),
  component: SqlPage,
});

function SqlPage() {
  const { conversion, patchConversion, settings } = useAppState();
  const blocked =
    !conversion.generatedSql ||
    !conversion.validationResult ||
    conversion.validationResult.errorCount > 0;
  const result = conversion.generatedSql;
  const generatedSql = result?.generatedSql ?? "";
  const sections = sqlTableSections(generatedSql);
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("SQLをコピーしました");
    } catch {
      toast.error("クリップボードにコピーできませんでした。");
    }
  };
  const copySection = () => {
    const index = sections.findIndex(
      (section) => section.table === (selected ?? sections[0]?.table),
    );
    if (index < 0) return;
    const lines = generatedSql.split("\n");
    void copy(
      lines
        .slice(sections[index]!.startLine, sections[index + 1]?.startLine ?? lines.length)
        .join("\n"),
    );
  };

  const select = (t: string) => {
    setQuery("");
    setSelected(t);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await saveConversion(conversion, patchConversion, settings);
      if (saved)
        toast.success(
          "生成ファイルを保存しました。",
          saved.directory
            ? {
                action: {
                  label: "フォルダを開く",
                  onClick: () => {
                    void revealInFolder(saved.directory!).catch(() =>
                      toast.error("保存フォルダを開けませんでした。"),
                    );
                  },
                },
              }
            : {},
        );
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (
      conversion.conversionStatus === "completed" ||
      conversion.conversionStatus === "ready-to-generate"
    ) {
      if (await runGeneration(conversion, patchConversion, settings))
        toast.success("SQLを再生成しました");
    } else toast.info("マスタ変換画面で検証を完了してください");
  };

  if (blocked || !result)
    return (
      <>
        <PageHeader title="SQLプレビュー" />
        <div
          data-page-content="sql"
          data-primary-scroll="sql-empty"
          className="min-h-0 flex-1 overflow-auto px-5 py-3 xl:px-6"
        >
          <ErrorAlert
            title={
              conversion.errorMessage ??
              (conversion.validationResult?.errorCount
                ? "検証エラーが存在するためSQLを生成できません。"
                : "SQLは未生成です。")
            }
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/validation">検証結果を確認</Link>
              </Button>
            }
          >
            検証とSQL生成が完了するとプレビューが表示されます。
            {conversion.errorDetail && (
              <details className="mt-2">
                <summary>詳細情報</summary>
                <pre className="whitespace-pre-wrap">{conversion.errorDetail}</pre>
              </details>
            )}
          </ErrorAlert>
          <div className="mt-6 flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            <XCircle className="mb-2 h-6 w-6 text-destructive" />
            SQL未生成
          </div>
        </div>
      </>
    );

  return (
    <div data-page-content="sql" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="SQLプレビュー"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => copy(generatedSql)}>
              <Copy />
              SQLをコピー
            </Button>
            <Button variant="outline" size="sm" onClick={copySection}>
              <Copy />
              選択テーブルをコピー
            </Button>
            <Button variant="outline" size="sm" disabled={saving} onClick={save}>
              {isDesktop() ? <FolderOpen /> : <Download />}
              {isDesktop() ? "SQLを保存" : "SQLをダウンロード"}
            </Button>
            <Button size="sm" disabled={saving} onClick={regenerate}>
              <RefreshCw />
              再生成
            </Button>
          </>
        }
      />
      {conversion.errorMessage && (
        <div className="max-h-32 shrink-0 overflow-auto px-5 py-3">
          <ErrorAlert title={conversion.errorMessage}>
            {conversion.errorDetail && (
              <details>
                <summary>詳細情報</summary>
                <pre className="whitespace-pre-wrap">{conversion.errorDetail}</pre>
              </details>
            )}
          </ErrorAlert>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-2">
        <input
          className="h-8 w-72 rounded border bg-background px-3 text-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SQLを検索"
          aria-label="SQLを検索"
        />
        {conversion.savedDirectory && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void revealInFolder(conversion.savedDirectory!).catch(() =>
                toast.error("保存フォルダを開けませんでした。"),
              );
            }}
          >
            <FolderOpen />
            フォルダを開く
          </Button>
        )}
        {saving && <span className="text-xs">ファイル出力中</span>}
      </div>
      <div className="grid shrink-0 grid-cols-4 divide-x border-b bg-card text-xs">
        {[
          ["対象DB", result.targetDb],
          ["対象テーブル数", `${sections.length}`],
          ["SQL件数", sections.reduce((a, s) => a + s.statements, 0).toLocaleString()],
          ["Generated Date", result.generatedAt],
        ].map(([k, v]) => (
          <div key={k} className="px-6 py-2.5">
            <p className="text-muted-foreground">{k}</p>
            <p className="font-mono font-medium">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          data-primary-scroll="sql-tables"
          className="min-h-0 w-52 shrink-0 overflow-auto border-r bg-card p-2 xl:w-60"
        >
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">テーブル</p>
          {sections.map((s) => (
            <button
              key={s.table}
              onClick={() => select(s.table)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                selected === s.table ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <Table2
                className={cn(
                  "h-3.5 w-3.5",
                  selected === s.table ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono font-medium">{s.table}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{s.statements}</span>
            </button>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <SQLCodeViewer sql={generatedSql} selected={selected} search={query} />
        </div>
      </div>
    </div>
  );
}

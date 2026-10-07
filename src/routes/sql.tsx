import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Download, FolderOpen, RefreshCw, Table2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, PageHeader } from "@/components/shepherd/status";
import { SQLCodeViewer, sqlTableSections } from "@/components/shepherd/viewers";
import { ScenarioSwitch } from "@/components/shepherd/workflow";
import { useAppState } from "@/state/app-state";
import { mockSqlResult } from "@/lib/mock-data";
import { revealInFolder, saveTextFile } from "@/services/platform/files";
import { isDesktop, timestamp } from "@/services/platform/runtime";
import { runGeneration } from "@/features/conversion/run-conversion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sql")({
  head: () => ({
    meta: [
      { title: "SQLプレビュー — Shepherd Master SQL Generator" },
      { name: "description", content: "生成されたINSERT SQLをテーブル単位で確認・コピー・保存します。" },
      { property: "og:title", content: "SQLプレビュー — Shepherd Master SQL Generator" },
      { property: "og:description", content: "生成されたINSERT SQLのプレビュー。" },
    ],
  }),
  component: SqlPage,
});

function SqlPage() {
  const { conversion, patchConversion, scenario } = useAppState();
  const isMock = !conversion.generatedSql;
  const blocked = conversion.conversionStatus === "validation-error" || (isMock && scenario === "error");
  const result = conversion.generatedSql ?? mockSqlResult();
  const generatedSql = result.generatedSql;
  const sections = sqlTableSections(generatedSql);
  const [selected, setSelected] = useState<string | undefined>(sections[0]?.table);

  const select = (t: string) => {
    setSelected(t);
    document.getElementById(`sql-${t}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const save = async () => {
    const saved = await saveTextFile({ defaultName: `insert_${timestamp()}.sql`, content: generatedSql, filterName: "SQL", extensions: ["sql"] });
    if (!saved) return;
    if (saved === "download") toast.success("SQLをダウンロードしました");
    else toast.success("SQLを保存しました", { description: saved, action: { label: "フォルダを開く", onClick: () => revealInFolder(saved) } });
  };

  const regenerate = async () => {
    if (conversion.conversionStatus === "completed" || conversion.conversionStatus === "ready-to-generate") {
      await runGeneration(conversion, patchConversion);
      toast.success("SQLを再生成しました");
    } else toast.info("マスタ変換画面で検証を完了してください");
  };

  if (blocked)
    return (
      <>
        <PageHeader title="SQLプレビュー" actions={<ScenarioSwitch />} />
        <div className="p-8">
          <ErrorAlert title="検証エラーが存在するためSQLを生成できません。" action={<Button variant="outline" size="sm" asChild><Link to="/validation">検証結果を確認</Link></Button>}>
            エラーを解消するとSQLプレビューが表示されます。
          </ErrorAlert>
          <div className="mt-6 flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            <XCircle className="mb-2 h-6 w-6 text-destructive" />SQL未生成
          </div>
        </div>
      </>
    );

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="SQLプレビュー"
        actions={
          <>
            <ScenarioSwitch />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(generatedSql); toast.success("SQLをコピーしました"); }}><Copy />SQLをコピー</Button>
            <Button variant="outline" size="sm" onClick={save}>{isDesktop() ? <FolderOpen /> : <Download />}{isDesktop() ? "SQLを保存" : "SQLをダウンロード"}</Button>
            <Button size="sm" onClick={regenerate}><RefreshCw />再生成</Button>
          </>
        }
      />
      {isMock && (
        <div className="border-b px-8 py-2">
          <InfoAlert title="サンプルSQLを表示中">マスタ変換でSQL生成を実行すると、生成結果に置き換わります。</InfoAlert>
        </div>
      )}
      <div className="grid grid-cols-4 divide-x border-b bg-card text-xs">
        {[["対象DB", result.targetDb], ["対象テーブル数", `${sections.length}`], ["SQL件数", sections.reduce((a, s) => a + s.statements, 0).toLocaleString()], ["Generated Date", result.generatedAt]].map(([k, v]) => (
          <div key={k} className="px-6 py-2.5">
            <p className="text-muted-foreground">{k}</p>
            <p className="font-mono font-medium">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="w-60 shrink-0 overflow-auto border-r bg-card p-2">
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">テーブル</p>
          {sections.map((s) => (
            <button
              key={s.table}
              onClick={() => select(s.table)}
              className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs", selected === s.table ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              <Table2 className={cn("h-3.5 w-3.5", selected === s.table ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1 truncate font-mono font-medium">{s.table}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{s.statements}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <SQLCodeViewer sql={generatedSql} selected={selected} />
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Download, RefreshCw, Table2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorAlert, PageHeader } from "@/components/shepherd/status";
import { SQLCodeViewer } from "@/components/shepherd/viewers";
import { ScenarioSwitch } from "@/components/shepherd/workflow";
import { useAppState } from "@/lib/app-state";
import { fullSql, sqlSections } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sql")({
  head: () => ({
    meta: [
      { title: "SQLプレビュー — Shepherd Master SQL Generator" },
      { name: "description", content: "生成されたINSERT SQLをテーブル単位で確認・コピー・ダウンロードします。" },
      { property: "og:title", content: "SQLプレビュー — Shepherd Master SQL Generator" },
      { property: "og:description", content: "生成されたINSERT SQLのプレビュー。" },
    ],
  }),
  component: SqlPage,
});

function SqlPage() {
  const { scenario } = useAppState();
  const [selected, setSelected] = useState<string>(sqlSections[0].table);

  const blocks = [
    { id: "_begin", sql: "START TRANSACTION;" },
    ...sqlSections.map((s) => ({ id: s.table, sql: s.sql })),
    { id: "_end", sql: "COMMIT;" },
  ];

  const select = (t: string) => {
    setSelected(t);
    document.getElementById(`sql-${t}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const download = () => {
    const blob = new Blob([fullSql()], { type: "text/sql" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "insert_20261007_115500.sql";
    a.click();
  };

  if (scenario === "error")
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
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(fullSql()); toast.success("SQLをコピーしました"); }}><Copy />SQLをコピー</Button>
            <Button variant="outline" size="sm" onClick={download}><Download />SQLをダウンロード</Button>
            <Button size="sm" onClick={() => toast.info("SQLを再生成しました（モック）")}><RefreshCw />再生成</Button>
          </>
        }
      />
      <div className="grid grid-cols-4 divide-x border-b bg-card text-xs">
        {[["対象DB", "shepherd_prod (MySQL 8.0)"], ["対象テーブル数", `${sqlSections.length}`], ["SQL件数", sqlSections.reduce((a, s) => a + s.count, 0).toLocaleString()], ["Generated Date", "2026/10/07 11:55:00"]].map(([k, v]) => (
          <div key={k} className="px-6 py-2.5">
            <p className="text-muted-foreground">{k}</p>
            <p className="font-mono font-medium">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="w-60 shrink-0 overflow-auto border-r bg-card p-2">
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">テーブル</p>
          {sqlSections.map((s) => (
            <button
              key={s.table}
              onClick={() => select(s.table)}
              className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                selected === s.table ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              <Table2 className={cn("h-3.5 w-3.5", selected === s.table ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono font-medium">{s.table}</span>
                <span className="block text-[10px] text-muted-foreground">{s.logical}</span>
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{s.count}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <SQLCodeViewer blocks={blocks} selected={selected} />
        </div>
      </div>
    </div>
  );
}

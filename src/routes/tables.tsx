import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Table2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shepherd/status";
import { TableDefinitionViewer } from "@/components/shepherd/viewers";
import { DEFINITION_FILE, tableDefs } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tables")({
  head: () => ({
    meta: [
      { title: "テーブル定義 — Shepherd Master SQL Generator" },
      { name: "description", content: "テーブル定義書から読み込んだカラム・型・インデックス定義を閲覧します。" },
      { property: "og:title", content: "テーブル定義 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "DBテーブル定義の閲覧。" },
    ],
  }),
  component: TablesPage,
});

function TablesPage() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(tableDefs[0]!.name);
  const list = tableDefs.filter((t) => (t.name + t.logical).toLowerCase().includes(q.toLowerCase()));
  const table = tableDefs.find((t) => t.name === sel)!;

  return (
    <>
      <PageHeader
        title="テーブル定義"
        subtitle={`読込元: ${DEFINITION_FILE}`}
        actions={<Button variant="outline" size="sm" asChild><Link to="/mapping">マッピングを表示</Link></Button>}
      />
      <div className="grid grid-cols-[260px_1fr] gap-6 p-8">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="テーブルを検索" className="pl-8" />
          </div>
          <div className="rounded-md border bg-card p-1">
            {list.map((t) => (
              <button
                key={t.name}
                onClick={() => setSel(t.name)}
                className={cn("flex w-full items-center gap-2 rounded px-2.5 py-2 text-left", sel === t.name ? "bg-accent" : "hover:bg-muted")}
              >
                <Table2 className={cn("h-3.5 w-3.5", sel === t.name ? "text-primary" : "text-muted-foreground")} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-medium">{t.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.logical}</span>
                </span>
              </button>
            ))}
            {!list.length && <p className="p-3 text-xs text-muted-foreground">該当なし</p>}
          </div>
        </div>
        <TableDefinitionViewer table={table} />
      </div>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoAlert, PageHeader, Section, StatusBadge } from "@/components/shepherd/status";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "設定 — Shepherd Master SQL Generator" },
      { name: "description", content: "SQL出力形式とデータベース接続の設定を行います。" },
      { property: "og:title", content: "設定 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "SQL出力とDB接続の設定。" },
    ],
  }),
  component: SettingsPage,
});

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-4 px-4 py-3">
      <Label className="text-sm font-normal">{label}</Label>
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

function SettingsPage() {
  return (
    <>
      <PageHeader title="設定" />
      <div className="max-w-4xl space-y-6 p-8">
        <Section title="基本設定">
          <div className="divide-y">
            <Row label="SQL出力文字コード">
              <select className={selectCls} defaultValue="utf8mb4"><option value="utf8mb4">UTF-8 (utf8mb4)</option><option>Shift_JIS</option><option>EUC-JP</option></select>
            </Row>
            <Row label="日付フォーマット">
              <select className={selectCls} defaultValue="a"><option value="a">YYYY/MM/DD HH:mm</option><option>YYYY-MM-DD HH:mm:ss</option></select>
            </Row>
            <Row label="SQLトランザクション使用"><Switch defaultChecked /></Row>
            <Row label="SQLコメント出力"><Switch defaultChecked /></Row>
          </div>
        </Section>
        <Section title="Database" actions={<StatusBadge status="disconnected" />}>
          <div className="space-y-4 p-4">
            <InfoAlert title="DB接続機能は今後実装予定">現在は設定画面のみ表示しています。接続は行われません。</InfoAlert>
            <div className="grid grid-cols-2 gap-4">
              {[["Host", "localhost"], ["Port", "3306"], ["Database", "shepherd"], ["Username", "shepherd_user"]].map(([l, p]) => (
                <div key={l} className="space-y-1.5"><Label className="text-xs">{l}</Label><Input placeholder={p} className="font-mono" /></div>
              ))}
              <div className="space-y-1.5"><Label className="text-xs">Password</Label><Input type="password" placeholder="••••••••" /></div>
            </div>
            <Button variant="outline" onClick={() => toast.info("DB接続機能は今後実装予定です")}><PlugZap />接続テスト</Button>
          </div>
        </Section>
      </div>
    </>
  );
}

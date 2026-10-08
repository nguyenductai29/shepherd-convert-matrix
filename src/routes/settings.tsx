import { useEffect, useState } from "react";
import type { LocalSettings } from "@/services/platform/local-settings";
import { PROCESSING } from "@/features/conversion/run-conversion";
import { openLogFolder } from "@/services/platform/logging";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Section } from "@/components/shepherd/status";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useAppState } from "@/state/app-state";
import { updateSettings, defaultSettings, loadSettings } from "@/services/platform/local-settings";
import { pickOutputDirectory, revealInFolder } from "@/services/platform/files";
import { isDesktop } from "@/services/platform/runtime";

function LocalPathsSection() {
  const { settings, setSettings, conversion } = useAppState();
  const desktop = isDesktop();
  const rows: [string, string | null][] = [
    ["前回のテーブル定義書", settings.lastTableDefinitionPath],
    ["部門マスタ", settings.lastDepartmentReferencePath],
    ["区分名称マスタ", settings.lastKbnDefinitionPath ?? settings.kbnSource?.name ?? null],
    ["前回のマスタフォルダ", settings.lastMasterDirectory],
    ["前回の出力フォルダ", settings.lastOutputDirectory],
  ];
  return (
    <Section
      title="ローカル設定"
      actions={
        <Button
          variant="ghost"
          size="sm"
          disabled={conversion.referenceLoading || PROCESSING.includes(conversion.conversionStatus)}
          onClick={async () => {
            try {
              setSettings(await updateSettings(defaultSettings));
            } catch {
              toast.error("設定をリセットできませんでした。");
            }
          }}
        >
          <RotateCcw />
          リセット
        </Button>
      }
    >
      <div className="divide-y">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[180px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3"
          >
            <span className="text-sm">{label}</span>
            <code
              className="truncate font-mono text-xs text-muted-foreground"
              title={value ?? undefined}
            >
              {value ?? "未設定"}
            </code>
            {value && desktop && (label !== "区分名称マスタ" || settings.lastKbnDefinitionPath) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void revealInFolder(value).catch(() =>
                    toast.error("パスが見つからないか、開く権限がありません。"),
                  );
                }}
              >
                <FolderOpen />
                開く
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {desktop
              ? "パスはこのPCのアプリ設定ファイルに保存されます。"
              : "ブラウザプレビューではローカルパスは取得できません（デスクトップ版で利用可能）。"}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!desktop}
            onClick={async () => {
              try {
                if (await pickOutputDirectory()) setSettings(await loadSettings());
              } catch {
                toast.error("出力フォルダを選択できませんでした。");
              }
            }}
          >
            <FolderOpen />
            出力フォルダを選択
          </Button>
        </div>
      </div>
    </Section>
  );
}

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "設定 — Shepherd Master SQL Generator" },
      { name: "description", content: "SQL出力形式とローカル変換設定を管理します。" },
      { property: "og:title", content: "設定 — Shepherd Master SQL Generator" },
      { property: "og:description", content: "SQL出力とローカル設定。" },
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
  const { settings, setSettings, conversion } = useAppState();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const busy = conversion.referenceLoading || PROCESSING.includes(conversion.conversionStatus);
  const save = async () => {
    try {
      const saved = await updateSettings({
        sqlTransaction: draft.sqlTransaction,
        sqlComments: draft.sqlComments,
        theme: draft.theme,
        defaultQuantity: draft.defaultQuantity,
      });
      setSettings(saved);
      toast.success("設定を保存しました。");
    } catch {
      toast.error("設定を保存できませんでした。");
    }
  };
  return (
    <>
      <PageHeader
        title="設定"
        actions={
          <Button disabled={busy} onClick={save}>
            設定を保存
          </Button>
        }
      />
      <div
        data-page-content="settings"
        data-primary-scroll="settings"
        className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-3 xl:px-6"
      >
        <LocalPathsSection />
        <fieldset disabled={busy} className="space-y-4">
          <Section title="基本設定">
            <div className="divide-y">
              <Row label="SQL出力文字コード">
                <select className={selectCls} value="utf-8" disabled>
                  <option value="utf-8">UTF-8 (utf8mb4)</option>
                </select>
              </Row>
              <Row label="SQLトランザクション使用">
                <Switch
                  checked={draft.sqlTransaction}
                  onCheckedChange={(value) => setDraft({ ...draft, sqlTransaction: value })}
                />
              </Row>
              <Row label="SQLコメント出力">
                <Switch
                  checked={draft.sqlComments}
                  onCheckedChange={(value) => setDraft({ ...draft, sqlComments: value })}
                />
              </Row>
              <Row label="テーマ">
                <select
                  className={selectCls}
                  value={draft.theme}
                  onChange={(e) =>
                    setDraft({ ...draft, theme: e.target.value as LocalSettings["theme"] })
                  }
                >
                  <option value="light">ライト</option>
                  <option value="dark">ダーク</option>
                  <option value="system">Windows設定に合わせる</option>
                </select>
              </Row>
            </div>
          </Section>
          <Section title="品目構成の設定">
            <div className="divide-y">
              <p className="px-4 py-3 text-xs text-muted-foreground">
                元ファイルやテーブル定義に数量の指定がない場合に使用します。変更後は再検証が必要です。
              </p>
              <Row label="品目構成の数量">
                <Input
                  aria-label="品目構成の数量"
                  value={draft.defaultQuantity}
                  onChange={(event) => setDraft({ ...draft, defaultQuantity: event.target.value })}
                  placeholder="数量を明示（例: 1）"
                />
              </Row>
            </div>
          </Section>
        </fieldset>
        <Section title="トラブルシューティング">
          <div className="flex items-center justify-between p-4">
            <p className="text-xs text-muted-foreground">
              処理日時と診断情報をこのPCのログフォルダに記録します。
            </p>
            <Button
              variant="outline"
              disabled={!isDesktop()}
              onClick={() => {
                void openLogFolder().catch(() => toast.error("ログフォルダを開けませんでした。"));
              }}
            >
              <FolderOpen />
              ログフォルダを開く
            </Button>
          </div>
        </Section>
      </div>
    </>
  );
}

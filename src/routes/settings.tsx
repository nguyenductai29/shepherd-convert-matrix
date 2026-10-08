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
          disabled={PROCESSING.includes(conversion.conversionStatus)}
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
          <div key={label} className="grid grid-cols-[200px_1fr_auto] items-center gap-4 px-4 py-3">
            <span className="text-sm">{label}</span>
            <code className="truncate font-mono text-xs text-muted-foreground">
              {value ?? "未設定"}
            </code>
            {value && desktop ? (
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
  const [references, setReferences] = useState({
    userIdByLogin: JSON.stringify(settings.userIdByLogin, null, 2),
    unitCodeByName: JSON.stringify(settings.unitCodeByName, null, 2),
    reportPatternIdByName: JSON.stringify(settings.reportPatternIdByName, null, 2),
  });
  useEffect(() => {
    setDraft(settings);
    setReferences({
      userIdByLogin: JSON.stringify(settings.userIdByLogin, null, 2),
      unitCodeByName: JSON.stringify(settings.unitCodeByName, null, 2),
      reportPatternIdByName: JSON.stringify(settings.reportPatternIdByName, null, 2),
    });
  }, [settings]);
  const busy = PROCESSING.includes(conversion.conversionStatus);
  const save = async () => {
    try {
      const maps = {} as Pick<
        LocalSettings,
        "userIdByLogin" | "unitCodeByName" | "reportPatternIdByName"
      >;
      for (const key of ["userIdByLogin", "unitCodeByName", "reportPatternIdByName"] as const) {
        const value: unknown = JSON.parse(references[key]);
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.values(value).some((v) => typeof v !== "string")
        )
          throw new Error(
            "参照データは名称をキー、ID（文字列）を値とするJSONオブジェクトで入力してください。",
          );
        maps[key] = value as Record<string, string>;
      }
      const saved = await updateSettings({ ...draft, ...maps });
      setSettings(saved);
      toast.success("設定を保存しました。");
    } catch (error) {
      toast.error(
        error instanceof SyntaxError
          ? "参照データのJSON形式を確認してください。"
          : error instanceof Error
            ? error.message
            : "設定を保存できませんでした。",
      );
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
      <div className="max-w-4xl space-y-6 p-8">
        <LocalPathsSection />
        <fieldset disabled={busy} className="space-y-6">
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
          <Section title="変換に必要な共通値">
            <div className="divide-y">
              <p className="px-4 py-3 text-xs text-muted-foreground">
                確定済みExcelに含まれない値です。対象部門と既存DBの情報を確認して入力してください。変更後は再検証が必要です。
              </p>
              {(
                [
                  ["departmentCode", "部門コード"],
                  ["departmentName", "部門名"],
                  ["auditUserId", "登録・更新ユーザーID"],
                  ["effectiveFrom", "適用開始日"],
                  ["productManagementKbn", "品目管理区分"],
                  ["defaultQuantity", "品目構成の数量"],
                ] as const
              ).map(([key, label]) => (
                <Row key={key} label={label}>
                  <Input
                    type={key === "effectiveFrom" ? "date" : "text"}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    placeholder={
                      key === "productManagementKbn"
                        ? "0: SAP / 1: Shepherd"
                        : key === "defaultQuantity"
                          ? "数量を明示（例: 1）"
                          : "必須"
                    }
                  />
                </Row>
              ))}
            </div>
          </Section>
          <Section title="既存DBの参照データ（ローカル保存）">
            <div className="divide-y">
              <p className="px-4 py-3 text-xs text-muted-foreground">
                DBへの接続は行いません。既存ユーザーID、標準区分にない単位コード、帳票パターンIDを名称ごとに登録します。Excel列の固定マッピングは変更されません。
              </p>
              {(
                [
                  ["userIdByLogin", "ログインID → ユーザーID"],
                  ["unitCodeByName", "単位名称 → 単位コード"],
                  ["reportPatternIdByName", "帳票パターン名称 → ID"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2 px-4 py-3">
                  <Label>{label}</Label>
                  <textarea
                    aria-label={label}
                    className="min-h-24 w-full rounded border bg-background p-3 font-mono text-xs"
                    value={references[key]}
                    onChange={(e) => setReferences({ ...references, [key]: e.target.value })}
                    spellCheck={false}
                  />
                </div>
              ))}
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

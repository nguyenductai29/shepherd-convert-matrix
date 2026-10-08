import { useEffect, useRef, useState } from "react";
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
import {
  fileFromPath,
  fromBrowserFile,
  pickFileNative,
  pickOutputDirectory,
  revealInFolder,
} from "@/services/platform/files";
import { isDesktop } from "@/services/platform/runtime";
import { services } from "@/services";
import type { SelectedFile } from "@/models";
import { KbnResolver } from "@/services/processing/kbn-resolver";
import {
  CONFIRMED_CONVERSION_DEFAULTS,
  localDate,
} from "@/services/processing/conversion-defaults";

function LocalPathsSection({ loadingKbn }: { loadingKbn: boolean }) {
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
          disabled={loadingKbn || PROCESSING.includes(conversion.conversionStatus)}
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
  const { settings, setSettings, conversion, resetResults } = useAppState();
  const [draft, setDraft] = useState(settings);
  const [references, setReferences] = useState({
    userIdByLogin: JSON.stringify(settings.userIdByLogin, null, 2),
  });
  const [loadingKbn, setLoadingKbn] = useState(false);
  const kbnInput = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);
  const preserveDraft = useRef(false);
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  useEffect(
    () => () => {
      loadRequest.current += 1;
    },
    [],
  );
  useEffect(() => {
    loadRequest.current += 1;
    setLoadingKbn(false);
    if (preserveDraft.current) {
      preserveDraft.current = false;
      setDraft((current) => ({
        ...current,
        kbnDefinitions: settings.kbnDefinitions,
        kbnSource: settings.kbnSource,
        kbnSourceError: settings.kbnSourceError,
      }));
      return;
    }
    setDraft(settings);
    setReferences({
      userIdByLogin: JSON.stringify(settings.userIdByLogin, null, 2),
    });
  }, [settings]);
  const busy = loadingKbn || PROCESSING.includes(conversion.conversionStatus);
  let productManagement = "未解決（KBN定義を読み込んでください）";
  try {
    productManagement = `Shepherd → ${new KbnResolver(draft.kbnDefinitions).resolve("KBN_PRODUCT_MANAGEMENT", "Shepherd")}`;
  } catch {
    // Keep missing definitions visible; processing reports the actionable mapping error.
  }
  const loadKbn = async (file: SelectedFile | null) => {
    if (!file || busy) return;
    const request = ++loadRequest.current;
    const startedWith = currentSettings.current;
    const current = () =>
      request === loadRequest.current && startedWith === currentSettings.current;
    resetResults();
    setLoadingKbn(true);
    try {
      const kbnDefinitions = await services.kbnDefinition.load(file);
      if (kbnDefinitions.length === 0) throw new Error("KBN定義に有効な区分データがありません。");
      if (!current()) return;
      const kbnSource = { name: file.name, path: file.path, loadedAt: new Date().toISOString() };
      const saved = await updateSettings({ kbnDefinitions, kbnSource, kbnSourceError: null });
      const visible = current();
      if (visible) preserveDraft.current = true;
      // A committed snapshot must update the provider even if this route has unmounted.
      // Persisted updates are serialized, so subsequent commits still replace this one.
      setSettings(saved);
      if (visible) toast.success(`KBN定義を読み込みました（${kbnDefinitions.length}件）。`);
    } catch (error) {
      if (current())
        toast.error(error instanceof Error ? error.message : "KBN定義を読み込めませんでした。");
    } finally {
      if (request === loadRequest.current) setLoadingKbn(false);
    }
  };
  const selectKbn = async () => {
    if (busy) return;
    if (!isDesktop()) {
      kbnInput.current?.click();
      return;
    }
    try {
      await loadKbn(await pickFileNative("kbnDefinition"));
    } catch {
      toast.error("KBN定義ファイルを選択できませんでした。");
    }
  };
  const save = async () => {
    try {
      const maps = {} as Pick<LocalSettings, "userIdByLogin">;
      for (const key of ["userIdByLogin"] as const) {
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
        <LocalPathsSection loadingKbn={loadingKbn} />
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
                部門と品目構成の数量を確認して入力してください。登録・更新ユーザーIDと適用日は自動設定します。変更後は再検証が必要です。
              </p>
              {(
                [
                  ["departmentCode", "部門コード"],
                  ["departmentName", "部門名"],
                ] as const
              ).map(([key, label]) => (
                <Row key={key} label={label}>
                  <Input
                    type="text"
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    placeholder="必須"
                  />
                </Row>
              ))}
              <Row label="登録・更新ユーザーID">
                <Input readOnly value={`${CONFIRMED_CONVERSION_DEFAULTS.created_by}（自動設定）`} />
              </Row>
              <Row label="適用開始日">
                <Input readOnly value={`${localDate()}（処理日のローカル日付）`} />
              </Row>
              <Row label="適用終了日">
                <Input
                  readOnly
                  value={`${CONFIRMED_CONVERSION_DEFAULTS.effective_to}（カラムがある場合）`}
                />
              </Row>
              <Row label="品目管理区分">
                <Input readOnly value={productManagement} />
              </Row>
              <Row label="品目構成の数量">
                <Input
                  value={draft.defaultQuantity}
                  onChange={(event) => setDraft({ ...draft, defaultQuantity: event.target.value })}
                  placeholder="数量を明示（例: 1）"
                />
              </Row>
            </div>
          </Section>
          <Section title="既存DBの参照データ（ローカル保存）">
            <div className="divide-y">
              <p className="px-4 py-3 text-xs text-muted-foreground">
                DBへの接続は行いません。m_kbn_definitionのJSONをローカルで読み込み、区分名称から値を解決します。未定義の単位・帳票パターン等はエラーになります。
              </p>
              <div className="space-y-2 px-4 py-3">
                <Label>KBN定義データ（m_kbn_definition）</Label>
                {draft.kbnSourceError && (
                  <p role="alert" className="text-xs text-destructive">
                    {draft.kbnSourceError}
                  </p>
                )}
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {draft.kbnSource
                    ? `${draft.kbnSource.path ?? draft.kbnSource.name} / ${draft.kbnDefinitions.length}件 / 読込: ${new Date(draft.kbnSource.loadedAt).toLocaleString("ja-JP")}`
                    : "未読込"}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectKbn}>
                    <FolderOpen />
                    {loadingKbn ? "読込中…" : "KBN定義を選択"}
                  </Button>
                  {isDesktop() && draft.kbnSource?.path && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const file = await fileFromPath("kbnDefinition", draft.kbnSource!.path!);
                        if (!file)
                          toast.error("設定済みのKBN定義が見つかりません。再選択してください。");
                        else await loadKbn(file);
                      }}
                    >
                      <RotateCcw />
                      再読込
                    </Button>
                  )}
                </div>
                <input
                  ref={kbnInput}
                  type="file"
                  className="hidden"
                  accept=".json"
                  aria-label="KBN定義ファイル"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void loadKbn(fromBrowserFile("kbnDefinition", file));
                    event.target.value = "";
                  }}
                />
              </div>
              {([["userIdByLogin", "ログインID → ユーザーID"]] as const).map(([key, label]) => (
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

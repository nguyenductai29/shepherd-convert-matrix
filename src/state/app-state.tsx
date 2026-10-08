import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type {
  ConversionStatus,
  FormatCheckResult,
  MasterParseResult,
  SelectedFile,
  SqlGenerationResult,
  TableDefinitionLoadResult,
  ValidationResult,
} from "@/models";
import {
  defaultSettings,
  loadSettings,
  updateSettings,
  type LocalSettings,
} from "@/services/platform/local-settings";
import { fileFromPath } from "@/services/platform/files";
import { listHistory, type HistoryEntry } from "@/services/platform/history";
import { invalidateConversion } from "@/features/conversion/run-conversion";
import { services } from "@/services";

export interface ConversionState {
  tableDefinitionFile: SelectedFile | null;
  masterFile: SelectedFile | null;
  tableDefinition: TableDefinitionLoadResult | null;
  formatCheckResult: FormatCheckResult | null;
  parsedData: MasterParseResult | null;
  validationResult: ValidationResult | null;
  generatedSql: SqlGenerationResult | null;
  conversionStatus: ConversionStatus;
  errorMessage: string | null;
  errorDetail: string | null;
  historyId: string | null;
  progressMessage: string | null;
  savedDirectory: string | null;
}
export const initialConversion: ConversionState = {
  tableDefinitionFile: null,
  masterFile: null,
  tableDefinition: null,
  formatCheckResult: null,
  parsedData: null,
  validationResult: null,
  generatedSql: null,
  conversionStatus: "idle",
  errorMessage: null,
  errorDetail: null,
  historyId: null,
  progressMessage: null,
  savedDirectory: null,
};
interface AppState {
  conversion: ConversionState;
  patchConversion: (patch: Partial<ConversionState>) => void;
  setFile: (file: SelectedFile | null, kind: SelectedFile["kind"]) => void;
  resetResults: () => void;
  settings: LocalSettings;
  setSettings: (settings: LocalSettings) => void;
  history: HistoryEntry[];
  startupError: string | null;
  dark: boolean;
  toggleDark: () => void;
}
const Ctx = createContext<AppState | null>(null);
const clearedResults = {
  formatCheckResult: null,
  parsedData: null,
  validationResult: null,
  generatedSql: null,
  errorMessage: null,
  errorDetail: null,
  historyId: null,
  progressMessage: null,
  savedDirectory: null,
};
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [conversion, setConversion] = useState<ConversionState>(initialConversion);
  const [settings, setSettingsRaw] = useState<LocalSettings>(defaultSettings);
  const settingsRef = useRef(settings);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      listHistory()
        .then((rows) => {
          if (active) setHistory(rows);
        })
        .catch(() => {
          if (active)
            setStartupError("変換履歴を読み込めませんでした。ログと保存領域を確認してください。");
        });
    void refresh();
    window.addEventListener("shepherd-history-changed", refresh);
    void loadSettings()
      .then(async (saved) => {
        if (!active) return;
        settingsRef.current = saved;
        setSettingsRaw(saved);
        if (saved.lastTableDefinitionPath) {
          const file = await fileFromPath("tableDefinition", saved.lastTableDefinitionPath);
          if (!active) return;
          if (!file) {
            setStartupError("設定済みのテーブル定義書が見つかりません。再選択してください。");
            return;
          }
          setConversion((c) => (c.tableDefinitionFile ? c : { ...c, tableDefinitionFile: file }));
        }
      })
      .catch(() => {
        if (active) setStartupError("ローカル設定を読み込めませんでした。");
      });
    return () => {
      active = false;
      window.removeEventListener("shepherd-history-changed", refresh);
    };
  }, []);
  useEffect(() => {
    const file = conversion.tableDefinitionFile;
    if (!file) return;
    let active = true;
    setConversion((c) => ({ ...c, progressMessage: "テーブル定義解析中" }));
    void services.tableDefinition
      .load(file)
      .then((definition) => {
        if (!active) return;
        setConversion((c) => ({ ...c, tableDefinition: definition, progressMessage: null }));
        setStartupError(null);
      })
      .catch((error) => {
        if (!active) return;
        setConversion((c) => ({
          ...c,
          tableDefinition: null,
          progressMessage: null,
          errorMessage: "テーブル定義書の解析に失敗しました。",
          errorDetail: String(error),
          conversionStatus: "failed",
        }));
      });
    return () => {
      active = false;
    };
  }, [conversion.tableDefinitionFile]);
  const patchConversion = useCallback(
    (patch: Partial<ConversionState>) => setConversion((c) => ({ ...c, ...patch })),
    [],
  );
  const resetResults = useCallback(() => {
    invalidateConversion();
    setConversion((c) => ({
      ...c,
      ...clearedResults,
      conversionStatus: c.masterFile && c.tableDefinitionFile ? "file-selected" : "idle",
    }));
  }, []);
  const setFile = useCallback((file: SelectedFile | null, kind: SelectedFile["kind"]) => {
    invalidateConversion();
    setConversion((c) => {
      const next = {
        ...c,
        ...clearedResults,
        [kind === "master" ? "masterFile" : "tableDefinitionFile"]: file,
      };
      if (kind === "tableDefinition") next.tableDefinition = null;
      next.conversionStatus =
        next.masterFile && next.tableDefinitionFile ? "file-selected" : "idle";
      return next;
    });
  }, []);
  const setSettings = useCallback(
    (next: LocalSettings) => {
      const previous = settingsRef.current;
      {
        const keys = [
          "departmentCode",
          "departmentName",
          "auditUserId",
          "effectiveFrom",
          "productManagementKbn",
          "defaultQuantity",
          "userIdByLogin",
          "unitCodeByName",
          "reportPatternIdByName",
        ] as const;
        if (keys.some((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])))
          resetResults();
        else if (
          previous.sqlComments !== next.sqlComments ||
          previous.sqlTransaction !== next.sqlTransaction
        ) {
          invalidateConversion();
          setConversion((c) => ({
            ...c,
            generatedSql: null,
            savedDirectory: null,
            conversionStatus:
              c.validationResult?.errorCount === 0 ? "ready-to-generate" : c.conversionStatus,
          }));
        }
        settingsRef.current = next;
        setSettingsRaw(next);
      }
    },
    [resetResults],
  );
  const toggleDark = useCallback(() => {
    void updateSettings({ theme: dark ? "light" : "dark" })
      .then(setSettings)
      .catch(() => setStartupError("テーマ設定を保存できませんでした。"));
  }, [dark, setSettings]);
  const value = useMemo(
    () => ({
      conversion,
      patchConversion,
      setFile,
      resetResults,
      settings,
      setSettings,
      history,
      startupError,
      dark,
      toggleDark,
    }),
    [
      conversion,
      patchConversion,
      setFile,
      resetResults,
      settings,
      setSettings,
      history,
      startupError,
      dark,
      toggleDark,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAppState() {
  const context = useContext(Ctx);
  if (!context) throw new Error("AppStateProvider is required");
  return context;
}

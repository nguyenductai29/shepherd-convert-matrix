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
  ConversionFileKind,
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
import type { DepartmentReferenceLoadResult, DepartmentRow } from "@/models/references";
import { dirname } from "@/services/platform/runtime";

export interface ConversionState {
  tableDefinitionFile: SelectedFile | null;
  tableDefinitionError: string | null;
  departmentReferenceFile: SelectedFile | null;
  departmentReference: DepartmentReferenceLoadResult | null;
  departmentReferenceError: string | null;
  kbnDefinitionFile: SelectedFile | null;
  resolvedDepartment: DepartmentRow | null;
  referenceLoading: boolean;
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
  tableDefinitionError: null,
  departmentReferenceFile: null,
  departmentReference: null,
  departmentReferenceError: null,
  kbnDefinitionFile: null,
  resolvedDepartment: null,
  referenceLoading: false,
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
  setFile: (file: SelectedFile | null, kind: ConversionFileKind) => void;
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
  resolvedDepartment: null,
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
  const loadingSources = useRef(new Set<string>());
  const markLoading = useCallback((kind: string, loading: boolean) => {
    if (loading) loadingSources.current.add(kind);
    else loadingSources.current.delete(kind);
    setConversion((c) => ({ ...c, referenceLoading: loadingSources.current.size > 0 }));
  }, []);
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
        if (saved.kbnSourceError) setStartupError(saved.kbnSourceError);
        if (saved.kbnSource) {
          const source = saved.kbnSource;
          // KBN data is a validated local snapshot; the original JSON need not remain open.
          setConversion((c) => ({
            ...c,
            kbnDefinitionFile: c.kbnDefinitionFile ?? {
              kind: "kbnDefinition",
              name: source.name,
              path: source.path,
              extension: ".json",
              size: source.size ?? null,
              modifiedAt: source.modifiedAt ?? null,
            },
          }));
        }
        if (saved.lastDepartmentReferencePath) {
          const file = await fileFromPath("departmentReference", saved.lastDepartmentReferencePath);
          if (!active) return;
          if (file)
            setConversion((c) =>
              c.departmentReferenceFile ? c : { ...c, departmentReferenceFile: file },
            );
          else setStartupError("設定済みの部門マスタが見つかりません。再選択してください。");
        }
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
        setConversion((c) => ({
          ...c,
          tableDefinition: definition,
          tableDefinitionError: null,
          progressMessage: null,
        }));
        setStartupError((error) => (error?.includes("設定済みのテーブル定義書") ? null : error));
      })
      .catch((error) => {
        if (!active) return;
        setConversion((c) => ({
          ...c,
          tableDefinition: null,
          tableDefinitionError:
            error instanceof Error ? error.message : "テーブル定義書の解析に失敗しました。",
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
  useEffect(() => {
    const file = conversion.departmentReferenceFile;
    if (!file) return;
    let active = true;
    markLoading("departmentReference", true);
    void services.departmentReference
      .load(file)
      .then((reference) => {
        if (!active) return;
        setConversion((c) => ({
          ...c,
          departmentReference: reference,
          departmentReferenceError: null,
        }));
        setStartupError((error) => (error?.includes("設定済みの部門マスタ") ? null : error));
      })
      .catch((error) => {
        if (!active) return;
        setConversion((c) => ({
          ...c,
          departmentReference: null,
          departmentReferenceError:
            error instanceof Error ? error.message : "部門マスタの読み込みに失敗しました。",
          errorMessage: "部門マスタの読み込みに失敗しました。",
          errorDetail: String(error),
          conversionStatus: "failed",
        }));
      })
      .finally(() => {
        if (active) markLoading("departmentReference", false);
      });
    return () => {
      active = false;
      markLoading("departmentReference", false);
    };
  }, [conversion.departmentReferenceFile, markLoading]);
  const pendingKbnFile = useRef<SelectedFile | null>(null);
  useEffect(() => {
    const file = conversion.kbnDefinitionFile;
    // Restored snapshots already contain validated rows; only new selections read source bytes.
    if (!file || pendingKbnFile.current !== file) return;
    let active = true;
    markLoading("kbnDefinition", true);
    void (async () => {
      try {
        const kbnDefinitions = await services.kbnDefinition.load(file);
        if (!kbnDefinitions.length)
          throw new Error("区分名称マスタに有効な区分データがありません。");
        if (!active) return;
        const saved = await updateSettings({
          kbnDefinitions,
          kbnSource: {
            name: file.name,
            path: file.path,
            loadedAt: new Date().toISOString(),
            size: file.size,
            modifiedAt: file.modifiedAt ?? null,
          },
          kbnSourceError: null,
        });
        if (!active) return;
        invalidateConversion();
        setConversion((c) => ({
          ...c,
          ...clearedResults,
          conversionStatus: c.masterFile && c.tableDefinitionFile ? "file-selected" : "idle",
        }));
        const previousSourceError = settingsRef.current.kbnSourceError;
        settingsRef.current = saved;
        setSettingsRaw(saved);
        setStartupError((error) =>
          error === previousSourceError || error?.includes("KBN定義") ? null : error,
        );
      } catch (error) {
        if (!active) return;
        const message = "区分名称マスタの読み込みに失敗しました。";
        setConversion((c) => ({
          ...c,
          errorMessage: message,
          errorDetail: String(error),
          conversionStatus: "failed",
        }));
        try {
          const saved = await updateSettings({
            kbnDefinitions: [],
            kbnSource: null,
            kbnSourceError: message,
          });
          if (active) {
            settingsRef.current = saved;
            setSettingsRaw(saved);
          }
        } catch {
          if (active) setStartupError("ローカル設定を保存できませんでした。");
        }
      } finally {
        if (active) {
          pendingKbnFile.current = null;
          markLoading("kbnDefinition", false);
        }
      }
    })();
    return () => {
      active = false;
      markLoading("kbnDefinition", false);
    };
  }, [conversion.kbnDefinitionFile, markLoading]);
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
  const setFile = useCallback((file: SelectedFile | null, kind: ConversionFileKind) => {
    if (file && file.kind !== kind) return;
    invalidateConversion();
    if (kind === "kbnDefinition") {
      pendingKbnFile.current = file;
      const next = {
        ...settingsRef.current,
        kbnDefinitions: [],
        kbnSource: null,
        kbnSourceError: null,
      };
      settingsRef.current = next;
      setSettingsRaw(next);
      void updateSettings({ kbnDefinitions: [], kbnSource: null, kbnSourceError: null }).catch(() =>
        setStartupError("ローカル設定を保存できませんでした。"),
      );
    } else {
      const patch =
        kind === "tableDefinition"
          ? { lastTableDefinitionPath: file?.path ?? null }
          : kind === "departmentReference"
            ? { lastDepartmentReferencePath: file?.path ?? null }
            : file?.path
              ? { lastMasterDirectory: dirname(file.path) }
              : {};
      if (Object.keys(patch).length) {
        settingsRef.current = { ...settingsRef.current, ...patch };
        setSettingsRaw(settingsRef.current);
        void updateSettings(patch).catch(() =>
          setStartupError("ローカル設定を保存できませんでした。"),
        );
      }
    }
    const fileKey = {
      master: "masterFile",
      tableDefinition: "tableDefinitionFile",
      departmentReference: "departmentReferenceFile",
      kbnDefinition: "kbnDefinitionFile",
    } as const;
    setConversion((c) => {
      const next = {
        ...c,
        ...clearedResults,
        [fileKey[kind]]: file,
      };
      if (kind === "tableDefinition") {
        next.tableDefinition = null;
        next.tableDefinitionError = null;
      }
      if (kind === "departmentReference") {
        next.departmentReference = null;
        next.departmentReferenceError = null;
      }
      next.conversionStatus =
        next.masterFile && next.tableDefinitionFile ? "file-selected" : "idle";
      return next;
    });
  }, []);
  const setSettings = useCallback(
    (next: LocalSettings) => {
      const previous = settingsRef.current;
      if (previous.kbnSource !== next.kbnSource && !next.kbnSource) {
        pendingKbnFile.current = null;
        setConversion((c) => ({ ...c, kbnDefinitionFile: null }));
      }
      if (previous.kbnSourceError !== next.kbnSourceError) {
        setStartupError((current) =>
          current === previous.kbnSourceError ? next.kbnSourceError : current,
        );
      }
      {
        const keys = ["defaultQuantity", "kbnDefinitions", "kbnSource", "kbnSourceError"] as const;
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

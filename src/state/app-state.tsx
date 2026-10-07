// Central UI state (React context). Holds selected files, processing results and workflow status.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Scenario } from "@/lib/mock-data";
import type {
  ConversionStatus,
  FormatCheckResult,
  MasterParseResult,
  SelectedFile,
  SqlGenerationResult,
  TableDefinitionLoadResult,
  ValidationResult,
} from "@/models";
import { mockConfig } from "@/services/processing/placeholder";
import { defaultSettings, loadSettings, type LocalSettings } from "@/services/platform/local-settings";
import { fileFromPath } from "@/services/platform/files";

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
}

const initialConversion: ConversionState = {
  tableDefinitionFile: null,
  masterFile: null,
  tableDefinition: null,
  formatCheckResult: null,
  parsedData: null,
  validationResult: null,
  generatedSql: null,
  conversionStatus: "idle",
  errorMessage: null,
};

interface AppState {
  conversion: ConversionState;
  patchConversion: (p: Partial<ConversionState>) => void;
  setFile: (f: SelectedFile | null, kind: SelectedFile["kind"]) => void;
  resetResults: () => void;
  settings: LocalSettings;
  setSettings: (s: LocalSettings) => void;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  dark: boolean;
  toggleDark: () => void;
}

const Ctx = createContext<AppState | null>(null);

const clearedResults: Partial<ConversionState> = {
  formatCheckResult: null,
  parsedData: null,
  validationResult: null,
  generatedSql: null,
  errorMessage: null,
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [conversion, setConversion] = useState<ConversionState>(initialConversion);
  const [settings, setSettings] = useState<LocalSettings>(defaultSettings);
  const [scenario, setScenarioRaw] = useState<Scenario>("success");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("shepherd-theme") === "dark") setDark(true);
    loadSettings().then(async (s) => {
      setSettings(s);
      if (s.lastTableDefinitionPath) {
        const f = await fileFromPath("tableDefinition", s.lastTableDefinitionPath);
        if (f) setConversion((c) => (c.tableDefinitionFile ? c : { ...c, tableDefinitionFile: f }));
      }
    });
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("shepherd-theme", dark ? "dark" : "light");
  }, [dark]);

  const patchConversion = useCallback((p: Partial<ConversionState>) => setConversion((c) => ({ ...c, ...p })), []);

  const setFile = useCallback((f: SelectedFile | null, kind: SelectedFile["kind"]) => {
    setConversion((c) => {
      const next = { ...c, ...clearedResults, [kind === "master" ? "masterFile" : "tableDefinitionFile"]: f };
      if (kind === "tableDefinition") next.tableDefinition = null;
      next.conversionStatus = next.masterFile && next.tableDefinitionFile ? "file-selected" : "idle";
      return next;
    });
  }, []);

  const resetResults = useCallback(() => {
    setConversion((c) => ({ ...c, ...clearedResults, conversionStatus: c.masterFile && c.tableDefinitionFile ? "file-selected" : "idle" }));
  }, []);

  const setScenario = useCallback((s: Scenario) => {
    mockConfig.scenario = s;
    setScenarioRaw(s);
    resetResults();
  }, [resetResults]);

  const value = useMemo(
    () => ({ conversion, patchConversion, setFile, resetResults, settings, setSettings, scenario, setScenario, dark, toggleDark: () => setDark((d) => !d) }),
    [conversion, patchConversion, setFile, resetResults, settings, scenario, setScenario, dark],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppState must be used within AppStateProvider");
  return c;
}

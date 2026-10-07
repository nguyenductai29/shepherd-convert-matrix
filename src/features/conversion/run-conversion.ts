// Workflow orchestration: calls the processing services in order and reports state transitions.
// Contains no business rules — those belong to the service implementations.
import type { ConversionState } from "@/state/app-state";
import type { ConversionStatus } from "@/models";
import { services } from "@/services";

type Patch = (p: Partial<ConversionState>) => void;

export const PROCESSING: ConversionStatus[] = ["checking-format", "parsing", "validating", "generating"];

/** Format check → parse → validate. Stops at validation-error or ready-to-generate. */
export async function runAnalysis(state: ConversionState, patch: Patch) {
  const { masterFile, tableDefinitionFile } = state;
  if (!masterFile || !tableDefinitionFile) return;
  try {
    patch({ conversionStatus: "checking-format", formatCheckResult: null, parsedData: null, validationResult: null, generatedSql: null, errorMessage: null });
    const definition = state.tableDefinition ?? (await services.tableDefinition.load(tableDefinitionFile));
    const formatCheckResult = await services.formatCheck.check(masterFile);
    patch({ tableDefinition: definition, formatCheckResult });
    if (!formatCheckResult.passed) {
      patch({ conversionStatus: "failed", errorMessage: "フォーマットチェックでエラーが検出されました。" });
      return;
    }

    patch({ conversionStatus: "parsing" });
    const parsedData = await services.masterParser.parse(masterFile, definition);
    patch({ parsedData, conversionStatus: "validating" });

    const validationResult = await services.validation.validate(parsedData, definition);
    patch({ validationResult, conversionStatus: validationResult.errorCount > 0 ? "validation-error" : "ready-to-generate" });
  } catch (e) {
    patch({ conversionStatus: "failed", errorMessage: e instanceof Error ? e.message : String(e) });
  }
}

export async function runGeneration(state: ConversionState, patch: Patch) {
  if (state.conversionStatus !== "ready-to-generate" && state.conversionStatus !== "completed") return;
  if (!state.parsedData || !state.tableDefinition) return;
  try {
    patch({ conversionStatus: "generating" });
    const generatedSql = await services.sqlGenerator.generate(state.parsedData, state.tableDefinition);
    patch({ generatedSql, conversionStatus: "completed" });
  } catch (e) {
    patch({ conversionStatus: "failed", errorMessage: e instanceof Error ? e.message : String(e) });
  }
}

/** Maps workflow status to the 5-step progress indicator. */
export function stepFor(status: ConversionStatus, lastStep: number): { current: number; errorAt?: number; busy: boolean } {
  switch (status) {
    case "idle": return { current: 0, busy: false };
    case "file-selected": return { current: 1, busy: false };
    case "checking-format": return { current: 1, busy: true };
    case "parsing": return { current: 2, busy: true };
    case "validating": return { current: 3, busy: true };
    case "validation-error": return { current: 3, errorAt: 3, busy: false };
    case "ready-to-generate": return { current: 4, busy: false };
    case "generating": return { current: 4, busy: true };
    case "completed": return { current: 5, busy: false };
    case "failed": return { current: lastStep, errorAt: lastStep, busy: false };
  }
}

export const STATUS_LABEL: Record<ConversionStatus, string> = {
  idle: "未実行",
  "file-selected": "ファイル選択済み",
  "checking-format": "フォーマット確認中",
  parsing: "データ解析中",
  validating: "検証中",
  "validation-error": "検証エラー",
  "ready-to-generate": "SQL生成可能",
  generating: "SQL生成中",
  completed: "完了",
  failed: "失敗",
};

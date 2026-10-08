import type { ConversionState } from "@/state/app-state";
import type { ConversionStatus } from "@/models";
import { services } from "@/services";
import { saveHistory, getHistory, type HistoryEntry } from "@/services/platform/history";
import { logEvent } from "@/services/platform/logging";
import { saveConversionArtifacts } from "@/services/platform/files";
import type { LocalSettings } from "@/services/platform/local-settings";
import { CONFIRMED_CONVERSION_DEFAULTS } from "@/services/processing/conversion-defaults";
import { buildConversionContext } from "@/services/processing/conversion-context";
import type { SerializableConversionContext } from "@/models/references";

let revision = 0;
export function invalidateConversion() {
  revision++;
}
class SupersededRun extends Error {}
function ensureCurrent(token: number) {
  if (token !== revision) throw new SupersededRun();
}

type Patch = (patch: Partial<ConversionState>) => void;
export const PROCESSING: ConversionStatus[] = [
  "checking-format",
  "parsing",
  "validating",
  "generating",
];
const diagnostics = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);
const log = (action: string, severity: "info" | "error", detail?: string) =>
  logEvent(action, severity, detail).catch(() => undefined);
function historyEntry(state: ConversionState, status: HistoryEntry["status"]): HistoryEntry {
  return {
    id: state.historyId ?? crypto.randomUUID(),
    executedAt: new Date().toISOString(),
    file: state.masterFile?.name ?? "",
    tables: state.parsedData?.tables.length ?? 0,
    records: state.parsedData?.totalRecords ?? 0,
    errors:
      state.validationResult?.errorCount ??
      state.formatCheckResult?.items.filter((i) => i.status === "error").length ??
      (status === "failed" ? 1 : 0),
    warnings: state.validationResult?.warningCount ?? 0,
    user: String(CONFIRMED_CONVERSION_DEFAULTS.created_by),
    status,
    masterFilepath: state.masterFile?.path ?? null,
    tableDefinitionFilename: state.tableDefinitionFile?.name ?? "",
    generatedSqlPath: null,
    outputDirectory: null,
    outputFiles: [],
    validation: state.validationResult,
  };
}

/** Format → parse normalized records → all metadata/duplicate checks. */
export async function runAnalysis(state: ConversionState, patch: Patch, settings: LocalSettings) {
  if (
    !state.masterFile ||
    !state.tableDefinitionFile ||
    state.referenceLoading ||
    PROCESSING.includes(state.conversionStatus)
  )
    return;
  const token = ++revision;
  let current = {
    ...state,
    historyId: crypto.randomUUID(),
    generatedSql: null,
    validationResult: null,
    parsedData: null,
    formatCheckResult: null,
  } as ConversionState;
  const update = (p: Partial<ConversionState>) => {
    ensureCurrent(token);
    current = { ...current, ...p };
    patch(p);
  };
  let phase = "Excelファイルを読み込めませんでした。";
  try {
    update({
      conversionStatus: "checking-format",
      formatCheckResult: null,
      parsedData: null,
      validationResult: null,
      generatedSql: null,
      errorMessage: null,
      errorDetail: null,
      historyId: current.historyId,
      savedDirectory: null,
      resolvedDepartment: null,
      progressMessage: "ファイル読込中",
    });
    phase = "参照データを確認してください。";
    // Resolve prerequisites once before workbook parsing to avoid cascading field errors.
    const conversionOptions = {
      defaultQuantity: settings.defaultQuantity,
      kbnDefinitions: settings.kbnDefinitions,
      departmentReferences: state.departmentReference?.rows ?? [],
    };
    let context: SerializableConversionContext;
    try {
      const referenceError =
        state.departmentReferenceError || state.kbnDefinitionError || settings.kbnSourceError;
      if (referenceError) throw new Error(referenceError);
      if (!state.departmentReferenceFile || !state.departmentReference)
        throw new Error("部門マスタを選択してください。");
      const resolved = buildConversionContext(
        state.masterFile.name,
        conversionOptions.departmentReferences,
        conversionOptions.kbnDefinitions,
      );
      context = {
        department: resolved.department,
        auditUserId: resolved.auditUserId,
        effectiveFrom: resolved.effectiveFrom,
        effectiveTo: resolved.effectiveTo,
        productManagementKbn: resolved.productManagementKbn,
      };
    } catch (error) {
      phase = error instanceof Error ? error.message : phase;
      throw error;
    }
    update({ resolvedDepartment: context.department });
    phase = "テーブル定義書の解析に失敗しました。";
    update({ progressMessage: "テーブル定義解析中" });
    const definition =
      state.tableDefinition ?? (await services.tableDefinition.load(state.tableDefinitionFile));
    phase = "Excelファイルを読み込めませんでした。";
    update({ tableDefinition: definition, progressMessage: "ファイル読込中・フォーマット確認中" });
    const formatCheckResult = await services.formatCheck.check(state.masterFile);
    update({ formatCheckResult });
    if (!formatCheckResult.passed) {
      update({
        conversionStatus: "failed",
        progressMessage: null,
        errorMessage: "マスタファイルのフォーマットが定義と一致しないため処理を続行できません。",
      });
      await saveHistory(historyEntry(current, "failed"));
      return;
    }
    phase = "マスタデータの解析に失敗しました。";
    update({ conversionStatus: "parsing", progressMessage: "マスタ解析中・データ変換中" });
    const parsedData = await services.masterParser.parse(
      state.masterFile,
      definition,
      conversionOptions,
      context,
    );
    phase = "マスタデータの検証に失敗しました。";
    update({
      parsedData,
      conversionStatus: "validating",
      progressMessage: "データ検証中・重複チェック中",
    });
    const validationResult = await services.validation.validate(parsedData, definition);
    update({
      validationResult,
      conversionStatus: validationResult.errorCount > 0 ? "validation-error" : "ready-to-generate",
      progressMessage: null,
    });
    phase = "変換履歴を保存できませんでした。";
    await saveHistory(
      historyEntry(current, validationResult.errorCount > 0 ? "validation_error" : "success"),
    );
    await log(
      "analysis-completed",
      "info",
      `records=${parsedData.totalRecords}; errors=${validationResult.errorCount}; warnings=${validationResult.warningCount}`,
    );
  } catch (error) {
    if (error instanceof SupersededRun) return;
    if (token !== revision) return;
    update({
      conversionStatus: "failed",
      generatedSql: null,
      progressMessage: null,
      errorMessage: phase,
      errorDetail: diagnostics(error),
    });
    await log("analysis-failed", "error", diagnostics(error));
    try {
      await saveHistory(historyEntry(current, "failed"));
    } catch {
      /* Original failure remains visible. */
    }
  }
}

export async function runGeneration(
  state: ConversionState,
  patch: Patch,
  settings: LocalSettings,
): Promise<boolean> {
  if (
    !["ready-to-generate", "completed"].includes(state.conversionStatus) ||
    !state.parsedData ||
    !state.tableDefinition ||
    !state.validationResult ||
    state.validationResult.errorCount > 0 ||
    !state.formatCheckResult?.passed
  )
    return false;
  const token = revision;
  try {
    patch({
      conversionStatus: "generating",
      generatedSql: null,
      errorMessage: null,
      errorDetail: null,
      progressMessage: "SQL生成中",
    });
    const generatedSql = await services.sqlGenerator.generate(
      state.parsedData,
      state.tableDefinition,
      settings,
    );
    ensureCurrent(token);
    patch({ generatedSql, conversionStatus: "completed", progressMessage: null });
    await log("sql-generated", "info");
    return true;
  } catch (error) {
    if (error instanceof SupersededRun || token !== revision) return false;
    patch({
      conversionStatus: "failed",
      generatedSql: null,
      progressMessage: null,
      errorMessage: "SQL生成に失敗しました。",
      errorDetail: diagnostics(error),
    });
    await log("sql-generation-failed", "error", diagnostics(error));
    try {
      const previous = state.historyId ? await getHistory(state.historyId) : null;
      const row = historyEntry(state, "failed");
      await saveHistory({ ...row, executedAt: previous?.executedAt ?? row.executedAt });
    } catch {
      /* The primary generation failure remains visible. */
    }
    return false;
  }
}

export async function saveConversion(
  state: ConversionState,
  patch: Patch,
  settings: LocalSettings,
  reportsOnly = false,
) {
  if (!state.validationResult || !state.parsedData) return null;
  if (!reportsOnly && state.validationResult.errorCount === 0 && !state.generatedSql) return null;
  const token = revision;
  patch({ progressMessage: "ファイル出力中", errorMessage: null, errorDetail: null });
  try {
    const saved = await saveConversionArtifacts({
      sql:
        reportsOnly || state.validationResult.errorCount > 0
          ? null
          : (state.generatedSql?.generatedSql ?? null),
      validation: state.validationResult,
      snapshot: {
        formatVersion: "shepherd-matrix-2026-10",
        master: state.masterFile,
        definition: state.tableDefinitionFile,
        departmentReference: state.departmentReferenceFile,
        department: state.resolvedDepartment,
        kbnDefinition: state.kbnDefinitionFile,
        records: state.parsedData.data,
      },
    });
    if (!saved) {
      if (token === revision) patch({ progressMessage: null });
      return null;
    }
    const row = historyEntry(
      state,
      state.validationResult.errorCount > 0 ? "validation_error" : "success",
    );
    const existing = state.historyId ? await getHistory(state.historyId) : null;
    await saveHistory({
      ...row,
      executedAt: existing?.executedAt ?? row.executedAt,
      generatedSqlPath: saved.sqlPath ?? existing?.generatedSqlPath ?? null,
      outputDirectory: saved.directory,
      outputFiles: [...new Set([...(existing?.outputFiles ?? []), ...saved.files])],
    });
    if (token !== revision) return saved;
    patch({ savedDirectory: saved.directory, progressMessage: null });
    await log("files-saved", "info");
    return saved;
  } catch (error) {
    if (token !== revision) return null;
    patch({
      progressMessage: null,
      errorMessage:
        "生成ファイルを保存できませんでした。保存先の権限と空き容量を確認してください。",
      errorDetail: diagnostics(error),
    });
    await log("save-failed", "error", diagnostics(error));
    return null;
  }
}

/** Maps workflow status to the 5-step progress indicator. */
export function stepFor(
  status: ConversionStatus,
  lastStep: number,
): { current: number; errorAt?: number; busy: boolean } {
  switch (status) {
    case "idle":
      return { current: 0, busy: false };
    case "file-selected":
      return { current: 1, busy: false };
    case "checking-format":
      return { current: 1, busy: true };
    case "parsing":
      return { current: 2, busy: true };
    case "validating":
      return { current: 3, busy: true };
    case "validation-error":
      return { current: 3, errorAt: 3, busy: false };
    case "ready-to-generate":
      return { current: 4, busy: false };
    case "generating":
      return { current: 4, busy: true };
    case "completed":
      return { current: 5, busy: false };
    case "failed":
      return { current: lastStep, errorAt: lastStep, busy: false };
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

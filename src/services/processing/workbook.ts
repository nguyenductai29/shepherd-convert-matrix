import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { ScalarValue } from "@/models";

const emptyFormulaAnchors = new WeakSet<ExcelJS.Cell>();

/** ExcelJS reads OOXML data only; VBA in .xlsm is never executed or saved. */
export async function readWorkbook(bytes: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const emptyAnchors = new Map<string, string[]>();
  const sheetIds = new Map<string, number>();
  const normalized = await compactWorkbook(bytes, emptyAnchors, sheetIds);
  const workbook = new ExcelJS.Workbook();
  // Customer dropdown validations span 30+ million cells. We validate data
  // ourselves; ExcelJS must not expand Excel's authoring dropdown rules.
  await workbook.xlsx.load(normalized, {
    ignoreNodes: [
      "dataValidations",
      "conditionalFormatting",
      "extLst",
      "drawing",
      "picture",
      "legacyDrawing",
    ],
  });
  for (const [path, addresses] of emptyAnchors) {
    const id = sheetIds.get(path);
    const sheet = id === undefined ? undefined : workbook.getWorksheet(id);
    if (!sheet) throw new Error("Excelシートの数式参照を解決できません。");
    for (const address of addresses) emptyFormulaAnchors.add(sheet.getCell(address));
  }
  return workbook;
}

/** Customer templates contain 600,000 cached-empty formula cells (163 MB
 * worksheet XML). Keep meaningful cells and their styles/merges, avoiding
 * millions of ExcelJS objects for padding. No formulas are evaluated. */
export async function compactWorkbook(
  bytes: ArrayBuffer,
  emptyAnchors = new Map<string, string[]>(),
  sheetIds = new Map<string, number>(),
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > 10000) throw new Error("Excelファイル内の項目数が上限を超えています。");
  let expandedSize = 0;
  for (const entry of entries) {
    // JSZip keeps the central-directory size on its compressed entry object.
    // Inspect before expansion; the fallback is fail-closed for unknown ZIPs.
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    if (!entry.dir && (typeof size !== "number" || size < 0))
      throw new Error("Excelファイルの展開サイズを確認できません。");
    expandedSize += size ?? 0;
    if ((size ?? 0) > 256 * 1024 * 1024 || expandedSize > 512 * 1024 * 1024)
      throw new Error("Excelファイルの展開サイズが上限を超えています。");
  }
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relationsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  const relationTargets = new Map<string, string>();
  const attr = (tag: string, key: string) => new RegExp(`(?:^|\\s)${key}="([^"]*)"`).exec(tag)?.[1];
  for (const match of relationsXml?.matchAll(/<Relationship\s[^>]*\/?\s*>/g) ?? []) {
    const id = attr(match[0], "Id"),
      target = attr(match[0], "Target");
    if (id && target)
      relationTargets.set(
        id,
        target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`,
      );
  }
  for (const match of workbookXml?.matchAll(/<sheet\s[^>]*\/?\s*>/g) ?? []) {
    const id = attr(match[0], "sheetId"),
      relation = attr(match[0], "r:id");
    const path = relation ? relationTargets.get(relation) : undefined;
    if (id && path) sheetIds.set(path, Number(id));
  }
  for (const entry of entries) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)) continue;
    const source = await entry.async("string");
    // A cached empty string has both t="str" and an explicitly empty <v>.
    // Missing <v>, numeric zero, false and Excel error cells MUST survive.
    const compacted = source
      .replace(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g, (cell) => {
        if (/\/>$/.test(cell) && !cell.includes("</c>")) return "";
        const hasFormula = /<f(?:\s|>)/.test(cell);
        const hasEmptyCache = /<v\s*\/>|<v>\s*<\/v>/.test(cell);
        if (hasFormula) {
          // Shared followers need their anchor even if its cached value is blank.
          const formulaTag = /<f\b[^>]*>/.exec(cell)?.[0] ?? "";
          if (attr(formulaTag, "t") === "shared" && attr(formulaTag, "ref")) {
            if (/\bt="str"/.test(cell.slice(0, cell.indexOf(">"))) && hasEmptyCache) {
              const address = attr(cell.slice(0, cell.indexOf(">")), "r");
              if (address) {
                const addresses = emptyAnchors.get(entry.name) ?? [];
                addresses.push(address);
                emptyAnchors.set(entry.name, addresses);
              }
            }
            return cell;
          }
          return /\bt="str"/.test(cell.slice(0, cell.indexOf(">"))) && hasEmptyCache ? "" : cell;
        }
        if (!/<(?:v|is)(?:\s|>)/.test(cell) || hasEmptyCache) return "";
        return cell;
      })
      .replace(/<row\b[^>]*>\s*<\/row>/g, "");
    if (compacted.length !== source.length) zip.file(entry.name, compacted);
  }
  // Calculation chains are unused because this application never evaluates
  // formulas. The customer's chain alone is 32 MB of obsolete padding refs.
  zip.remove("xl/calcChain.xml");
  return zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
}

export function cellValue(cell: ExcelJS.Cell): ScalarValue {
  if (emptyFormulaAnchors.has(cell)) return "";
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error(`${cell.address}: 日付が不正です。`);
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof value !== "object") return value;
  if ("error" in value) throw new Error(`${cell.address}: Excelエラー ${value.error}`);
  if ("formula" in value || "sharedFormula" in value) {
    // ExcelJS's Cell.value getter drops falsy formula results. Cell.result
    // reads the underlying result and preserves numeric zero / false.
    const result = cell.result;
    if (result === undefined)
      throw new Error(
        `${cell.address}: 数式の計算結果がありません。Excelで再計算して保存してください。`,
      );
    if (result instanceof Date) return result.toISOString().slice(0, 19).replace("T", " ");
    if (typeof result === "object" && result !== null)
      throw new Error(`${cell.address}: Excelエラー ${(result as { error: string }).error}`);
    return result ?? null;
  }
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return value.text;
  throw new Error(`${cell.address}: 読み取れないセル形式です。`);
}

export function cellText(cell: ExcelJS.Cell): string {
  return String(cellValue(cell) ?? "").trim();
}

/** Match fixed template headers without depending on line-ending or space width. */
export function normalizedHeader(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

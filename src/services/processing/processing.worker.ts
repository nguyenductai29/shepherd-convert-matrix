import { readWorkbook } from "./workbook";
import { parseTableDefinition } from "./table-definition";
import { validateMasterFormat, parseMaster } from "./master-parser";
import { validateMaster } from "./validation";
import { generateSql } from "./sql-generator";
import { parseKbnDefinitions } from "./kbn-resolver";
import { parseDepartmentReferenceFile } from "./department-reference";
import type { SerializableConversionContext } from "@/models/references";
import type {
  MasterParseResult,
  SelectedFile,
  SqlOptions,
  TableDefinitionLoadResult,
} from "@/models";
import type { ConversionOptions } from "@/config/shepherd-master";

interface Request {
  operation: string;
  buffer?: ArrayBuffer;
  payload: {
    file: SelectedFile;
    definition: TableDefinitionLoadResult;
    parsed: MasterParseResult;
    options: ConversionOptions & SqlOptions;
    context?: SerializableConversionContext;
  };
}
self.onmessage = async (event: MessageEvent<Request>) => {
  const { operation, payload, buffer } = event.data;
  try {
    let result: unknown;
    switch (operation) {
      case "department-reference":
        result = await parseDepartmentReferenceFile(payload.file, buffer!);
        break;
      case "kbn-definition": {
        let source: unknown;
        try {
          const json = new TextDecoder("utf-8", { fatal: true })
            .decode(buffer)
            .replace(/^\uFEFF/, "");
          source = JSON.parse(json);
        } catch {
          throw new Error(
            "KBN定義データを読み込めませんでした。UTF-8のJSONファイルを確認してください。",
          );
        }
        const definitions = parseKbnDefinitions(source);
        if (definitions.length === 0) throw new Error("KBN定義に有効な区分データがありません。");
        result = definitions;
        break;
      }
      case "definition":
        result = { file: payload.file, tables: parseTableDefinition(await readWorkbook(buffer!)) };
        break;
      case "format":
        result = validateMasterFormat(await readWorkbook(buffer!), payload.file.name);
        break;
      case "parse":
        result = parseMaster(
          await readWorkbook(buffer!),
          payload.file,
          payload.definition,
          payload.options,
          payload.context,
        );
        break;
      case "validate":
        result = validateMaster(payload.parsed, payload.definition);
        break;
      case "generate":
        result = generateSql(payload.parsed, payload.definition, payload.options);
        break;
      default:
        throw new Error("不明な処理です。");
    }
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

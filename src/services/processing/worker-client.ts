import type { SelectedFile } from "@/models";
import type { ProcessingServices } from "./interfaces";
import { readSelectedFile } from "@/services/platform/files";

// The selected file's bytes are immutable for a run, even if another program edits it.
const snapshots = new WeakMap<SelectedFile, Promise<ArrayBuffer>>();
async function bytes(file: SelectedFile) {
  let snapshot = snapshots.get(file);
  if (!snapshot) {
    snapshot = readSelectedFile(file);
    snapshots.set(file, snapshot);
  }
  try {
    return (await snapshot).slice(0);
  } catch (error) {
    snapshots.delete(file);
    throw error;
  }
}

async function processInWorker<T>(
  operation: string,
  payload: unknown,
  buffer?: ArrayBuffer,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL("./processing.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error("処理時間の上限（5分）を超えました。ファイルのサイズと形式を確認してください。"),
      );
    }, 300_000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<{ result?: T; error?: string }>) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result as T);
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "バックグラウンド処理に失敗しました。"));
    };
    worker.postMessage({ operation, payload, buffer }, buffer ? [buffer] : []);
  });
}

export const processingServices: ProcessingServices = {
  kbnDefinition: {
    async load(file) {
      if (file.kind !== "kbnDefinition") throw new Error("KBN定義データを選択してください。");
      return processInWorker("kbn-definition", { file }, await bytes(file));
    },
  },
  tableDefinition: {
    async load(file) {
      return processInWorker("definition", { file }, await bytes(file));
    },
  },
  formatCheck: {
    async check(file) {
      return processInWorker("format", { file }, await bytes(file));
    },
  },
  masterParser: {
    async parse(file, definition, options) {
      return processInWorker("parse", { file, definition, options }, await bytes(file));
    },
  },
  validation: {
    async validate(parsed, definition) {
      return processInWorker("validate", { parsed, definition });
    },
  },
  sqlGenerator: {
    async generate(parsed, definition, options) {
      return processInWorker("generate", { parsed, definition, options });
    },
  },
};

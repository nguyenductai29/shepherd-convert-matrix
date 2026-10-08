import type { MasterRecord } from "@/models";
import { isReference } from "./value-validation";

/** Stable Kahn ordering with a heap: O((records + references) log records). */
export function orderRecords(
  records: MasterRecord[],
  tableOrder: readonly string[] = [],
): { ordered: MasterRecord[]; cyclic: MasterRecord[] } {
  const byId = new Map(records.map((record) => [record.id, record]));
  const position = new Map(records.map((record, index) => [record.id, index]));
  const tableRank = new Map(tableOrder.map((name, index) => [name, index]));
  const dependencies = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const record of records) {
    const parents = new Set(
      Object.values(record.values)
        .filter(isReference)
        .map((reference) => reference.recordId)
        .filter((id) => byId.has(id)),
    );
    dependencies.set(record.id, parents.size);
    for (const parent of parents) {
      const dependents = children.get(parent) ?? [];
      dependents.push(record.id);
      children.set(parent, dependents);
    }
  }
  const heap: MasterRecord[] = [];
  const compare = (a: MasterRecord, b: MasterRecord): number =>
    (tableRank.get(a.targetTable) ?? Number.MAX_SAFE_INTEGER) -
      (tableRank.get(b.targetTable) ?? Number.MAX_SAFE_INTEGER) ||
    a.targetTable.localeCompare(b.targetTable, "en") ||
    (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
  const push = (record: MasterRecord) => {
    heap.push(record);
    let child = heap.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (compare(heap[parent]!, heap[child]!) <= 0) break;
      [heap[parent], heap[child]] = [heap[child]!, heap[parent]!];
      child = parent;
    }
  };
  const pop = (): MasterRecord => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let parent = 0;
      while (parent * 2 + 1 < heap.length) {
        let child = parent * 2 + 1;
        if (child + 1 < heap.length && compare(heap[child + 1]!, heap[child]!) < 0) child++;
        if (compare(heap[parent]!, heap[child]!) <= 0) break;
        [heap[parent], heap[child]] = [heap[child]!, heap[parent]!];
        parent = child;
      }
    }
    return top;
  };
  for (const record of records) if (dependencies.get(record.id) === 0) push(record);
  const ordered: MasterRecord[] = [];
  while (heap.length) {
    const record = pop();
    ordered.push(record);
    for (const id of children.get(record.id) ?? []) {
      const count = (dependencies.get(id) ?? 1) - 1;
      dependencies.set(id, count);
      if (count === 0) push(byId.get(id)!);
    }
  }
  return { ordered, cyclic: records.filter((record) => (dependencies.get(record.id) ?? 0) > 0) };
}

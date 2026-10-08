import type { MasterRecord, TableDefinition } from "@/models";
import type { SerializableConversionContext } from "@/models/references";

export const CONFIRMED_CONVERSION_DEFAULTS = {
  created_by: 1,
  updated_by: 1,
  effective_to: "9999-12-31",
} as const;

/** Calendar date on the user's PC, evaluated for each run rather than persisted. */
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function confirmedDefaults(
  table: TableDefinition | undefined,
  context: SerializableConversionContext,
): MasterRecord["values"] {
  const columns = new Set(table?.columns.map((column) => column.name));
  return Object.fromEntries(
    Object.entries({
      created_by: context.auditUserId,
      updated_by: context.auditUserId,
      effective_from: context.effectiveFrom,
      effective_to: context.effectiveTo,
      department_id: context.department.departmentId,
    }).filter(([name]) => columns.has(name)),
  );
}

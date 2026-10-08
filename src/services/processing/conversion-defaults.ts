import type { MasterRecord, TableDefinition } from "@/models";

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
  today: string,
): MasterRecord["values"] {
  const columns = new Set(table?.columns.map((column) => column.name));
  return Object.fromEntries(
    Object.entries({ ...CONFIRMED_CONVERSION_DEFAULTS, effective_from: today }).filter(([name]) =>
      columns.has(name),
    ),
  );
}

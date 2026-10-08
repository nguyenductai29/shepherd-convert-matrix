import type { KbnDefinition } from "@/models/kbn";
import type { ConversionContext, DepartmentRow } from "@/models/references";
import { extractDepartmentCode, resolveDepartment } from "./department-reference";
import { CONFIRMED_CONVERSION_DEFAULTS, localDate } from "./conversion-defaults";
import { KbnResolver } from "./kbn-resolver";

export function buildConversionContext(
  masterName: string,
  departments: readonly DepartmentRow[],
  kbnDefinitions: readonly KbnDefinition[],
  date = new Date(),
): ConversionContext {
  const department = resolveDepartment(extractDepartmentCode(masterName), departments);
  const kbnResolver = new KbnResolver(kbnDefinitions);
  const productManagementKbn = kbnResolver.resolve("KBN_PRODUCT_MANAGEMENT", "Shepherd");
  if (!Number.isFinite(date.getTime()))
    throw new Error("変換日付を取得できませんでした。PCの日付設定を確認してください。");
  return {
    department,
    auditUserId: CONFIRMED_CONVERSION_DEFAULTS.created_by,
    effectiveFrom: localDate(date),
    effectiveTo: CONFIRMED_CONVERSION_DEFAULTS.effective_to,
    productManagementKbn,
    kbnResolver,
  };
}

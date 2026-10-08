import type { SelectedFile } from "@/models";
import type { KbnResolver } from "@/services/processing/kbn-resolver";

/** Existing database reference rows; these never become INSERT records. */
export interface DepartmentRow {
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  editCtrlKbn: string;
  invalidFlg: boolean;
}

export interface DepartmentReferenceLoadResult {
  file: SelectedFile;
  rows: DepartmentRow[];
}

/** Built once per conversion, before parsing or database validation. */
export interface ConversionContext {
  department: DepartmentRow;
  auditUserId: 1;
  effectiveFrom: string;
  effectiveTo: "9999-12-31";
  productManagementKbn: string;
  kbnResolver: KbnResolver;
}

/** Worker messages contain data only; the worker reconstructs its own resolver. */
export type SerializableConversionContext = Omit<ConversionContext, "kbnResolver">;

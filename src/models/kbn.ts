/** Local database reference data. Values stay strings to preserve leading zeros. */
export interface KbnDefinition {
  category_kbn_code: string;
  kbn_name: string;
  kbn_value: string;
  order_no: number;
  invalid_flg: boolean;
}

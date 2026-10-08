import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { KbnResolver, parseKbnDefinitions } from "./kbn-resolver";

const row = <T>(category: string, name: string, value: T, extra: Record<string, unknown> = {}) => ({
  category_kbn_code: category,
  kbn_name: name,
  kbn_value: value,
  ...extra,
});

describe("local KBN definition parsing", () => {
  it("reads the m_kbn_definition JSON array export and drops unrelated metadata", () => {
    const source: unknown = JSON.parse(
      JSON.stringify([
        row("KBN_PRODUCT_MANAGEMENT", "SAP", "0", { invalid_flg: 0, created_by: 1 }),
        row("KBN_PRODUCT_MANAGEMENT", "Shepherd", "1", { invalid_flg: 0 }),
      ]),
    );
    expect(parseKbnDefinitions(source)).toEqual([
      row("KBN_PRODUCT_MANAGEMENT", "SAP", "0"),
      row("KBN_PRODUCT_MANAGEMENT", "Shepherd", "1"),
    ]);
  });

  it("normalizes surrounding whitespace and numeric zero without losing string leading zeros", () => {
    expect(
      parseKbnDefinitions([row(" KBN_TEST ", " ゼロ ", 0), row("KBN_TEST", "番号", " 001 ")]),
    ).toEqual([row("KBN_TEST", "ゼロ", "0"), row("KBN_TEST", "番号", "001")]);
  });

  it.each(
    [null, {}, "[]", [null], [1], [row("", "名称", "1")], [row("KBN_TEST", "", "1")]].map(
      (source) => ({ source }),
    ),
  )("rejects a malformed source: $source", ({ source }) =>
    expect(() => parseKbnDefinitions(source)).toThrow(/区分定義/),
  );

  it.each(
    [null, "", true, {}, [], Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1].map(
      (value) => ({ value }),
    ),
  )("rejects a malformed or imprecise KBN value: $value", ({ value }) =>
    expect(() => parseKbnDefinitions([row("KBN_TEST", "名称", value)])).toThrow(/kbn_value/),
  );

  it("deduplicates identical definitions while retaining category boundaries", () => {
    expect(
      parseKbnDefinitions([
        row("KBN_A", "共通", "0"),
        row("KBN_A", "共通", 0),
        row("KBN_B", "共通", "1"),
      ]),
    ).toHaveLength(2);
  });

  it.each([
    [row("KBN_TEST", "名称", "0"), row("KBN_TEST", "名称", "1")],
    [row("KBN_TEST", "名称", "0"), row("KBN_TEST", "別名", "0")],
  ])("rejects conflicting forward or reverse definitions", (...rows) => {
    expect(() => parseKbnDefinitions(rows)).toThrow(/競合.*KBN_TEST/);
  });

  it("excludes inactive definitions without letting them shadow active entries", () => {
    const definitions = parseKbnDefinitions([
      row("KBN_TEST", "有効", "0", { invalid_flg: 0 }),
      row("KBN_TEST", "有効", "1", { invalid_flg: 1 }),
      row("KBN_TEST", "無効", "2", { invalid_flg: "1" }),
      row("KBN_TEST", "無効2", "3", { invalid_flg: true }),
    ]);
    expect(definitions).toEqual([row("KBN_TEST", "有効", "0")]);
    expect(() => new KbnResolver(definitions).resolve("KBN_TEST", "無効")).toThrow(/無効/);
  });

  it("rejects malformed invalid_flg instead of guessing whether a definition is active", () => {
    expect(() =>
      parseKbnDefinitions([row("KBN_TEST", "名称", "1", { invalid_flg: "yes" })]),
    ).toThrow(/invalid_flg/);
  });
});

describe("KbnResolver", () => {
  it("resolves category/name and category/value with exact trimmed matching", () => {
    const resolver = new KbnResolver(
      parseKbnDefinitions([
        row("KBN_PRODUCT_MANAGEMENT", "SAP", "0"),
        row("KBN_PRODUCT_MANAGEMENT", "Shepherd", "1"),
        row("KBN_UNIT", "個", "1"),
      ]),
    );
    expect(resolver.resolve(" KBN_PRODUCT_MANAGEMENT ", " Shepherd ")).toBe("1");
    expect(resolver.resolve("KBN_PRODUCT_MANAGEMENT", "SAP")).toBe("0");
    expect(resolver.resolveName("KBN_UNIT", "1")).toBe("個");
    expect(resolver.resolveName("KBN_PRODUCT_MANAGEMENT", "1")).toBe("Shepherd");
  });

  it("uses supplied values instead of built-in business codes", () => {
    const resolver = new KbnResolver([row("KBN_PRODUCT_MANAGEMENT", "Shepherd", "CUSTOM")]);
    expect(resolver.resolve("KBN_PRODUCT_MANAGEMENT", "Shepherd")).toBe("CUSTOM");
  });

  it.each([
    ["KBN_UNIT", "%"],
    ["KBN_PRINT_PATTERN", "部材割当系"],
    ["KBN_PRODUCT_MANAGEMENT", "shepherd"],
    ["KBN_PRODUCT_MANAGEMENT", "1"],
  ])(
    "reports unresolved %s / %s without aliases, numeric guessing or fallback",
    (category, name) => {
      const resolver = new KbnResolver([row("KBN_PRODUCT_MANAGEMENT", "Shepherd", "1")]);
      expect(() => resolver.resolve(category, name)).toThrow(category);
      expect(() => resolver.resolve(category, name)).toThrow(name);
    },
  );

  it("resolves currently unknown labels only when an explicit definition is supplied", () => {
    const resolver = new KbnResolver([
      row("KBN_UNIT", "%", "PERCENT"),
      row("KBN_PRINT_PATTERN", "部材割当系", "CONFIRMED"),
    ]);
    expect(resolver.resolve("KBN_UNIT", "%")).toBe("PERCENT");
    expect(resolver.resolve("KBN_PRINT_PATTERN", "部材割当系")).toBe("CONFIRMED");
  });

  it("reports missing reverse values and empty definition sources", () => {
    const resolver = new KbnResolver([]);
    expect(() => resolver.resolveName("KBN_UNIT", "1")).toThrow(/KBN_UNIT.*1/);
    expect(() => resolver.resolve("KBN_UNIT", "%")).toThrow(/KBN_UNIT.*%/);
  });

  it("validates direct constructor input so ambiguous values cannot bypass source parsing", () => {
    expect(
      () => new KbnResolver([row("KBN_TEST", "名称", "0"), row("KBN_TEST", "名称", "1")]),
    ).toThrow(/競合/);
  });

  it.skipIf(!process.env["SHEPHERD_KBN_FIXTURE"])(
    "accepts the private customer KBN export",
    async () => {
      const raw = await readFile(process.env["SHEPHERD_KBN_FIXTURE"]!, "utf8");
      const resolver = new KbnResolver(parseKbnDefinitions(JSON.parse(raw)));
      expect(resolver.resolve("KBN_PRODUCT_MANAGEMENT", "SAP")).toBe("0");
      expect(resolver.resolve("KBN_PRODUCT_MANAGEMENT", "Shepherd")).toBe("1");
      expect(resolver.resolve("KBN_INPUT_TYPE", "選択肢(コンボボックス)(編集可)")).toBe("3");
      expect(resolver.resolve("KBN_DISPLAY", "部材割当")).toBe("2");
      expect(resolver.resolve("KBN_PART_TYPE", "主要部品")).toBe("0");
      expect(resolver.resolve("KBN_UNIT", "個")).toBe("1");
      expect(() => resolver.resolve("KBN_UNIT", "%")).toThrow(/%/);
      expect(() => resolver.resolve("KBN_PRINT_PATTERN", "部材割当系")).toThrow(/部材割当系/);
    },
  );
});

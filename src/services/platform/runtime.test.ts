import { describe, expect, it } from "vitest";
import { basename, dirname, joinPath } from "./runtime";

describe("local paths", () => {
  it("preserves absolute drive roots when remembering a selected file", () => {
    expect(dirname("C:\\マスタ.xlsx")).toBe("C:\\");
    expect(dirname("C:/マスタ.xlsx")).toBe("C:/");
    expect(joinPath(dirname("C:\\マスタ.xlsx"), "出力.sql")).toBe("C:\\出力.sql");
  });
  it("supports network shares and POSIX paths", () => {
    expect(dirname("\\\\server\\share\\マスタ.xlsx")).toBe("\\\\server\\share");
    expect(basename("\\\\server\\share\\マスタ.xlsx")).toBe("マスタ.xlsx");
    expect(dirname("/マスタ.xlsx")).toBe("/");
  });
});

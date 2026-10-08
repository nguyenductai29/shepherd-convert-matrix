import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SQLCodeViewer } from "./viewers";
describe("large SQL preview", () => {
  it("renders a bounded visible window and searches all original lines", () => {
    const sql = Array.from({ length: 20_000 }, (_, index) => `-- 行 ${index}`).join("\n");
    const { container, rerender } = render(<SQLCodeViewer sql={sql} />);
    expect(container.querySelectorAll("[data-sql-line]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-sql-line]").length).toBeLessThan(150);
    rerender(<SQLCodeViewer sql={sql} search="行 19999" />);
    expect(screen.getByText("-- 行 19999")).toBeInTheDocument();
    expect(screen.getByText("20000")).toBeInTheDocument();
  });
});

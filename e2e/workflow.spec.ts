import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import {
  masterFixture,
  masterFixtureOptions as fixtureOptions,
} from "../src/test/fixtures/master-workbook";
import { parseMaster } from "../src/services/processing/master-parser";
import { defaultSettings } from "../src/services/platform/local-settings";

async function workbooks(invalid = false) {
  const master = masterFixture();
  const file = {
    kind: "master" as const,
    name: "test.xlsm",
    path: null,
    extension: ".xlsm",
    size: null,
  };
  const parsed = parseMaster(master, file, [], fixtureOptions);
  const schema = new ExcelJS.Workbook();
  for (const name of new Set(parsed.data.map((record) => record.targetTable))) {
    const sheet = schema.addWorksheet(name.slice(0, 31));
    sheet.getCell("B6").value = "物理テーブル名";
    sheet.getCell("C6").value = name;
    sheet.getCell("C5").value = name;
    sheet.getCell("A12").value = "カラム情報";
    const records = parsed.data.filter((record) => record.targetTable === name);
    const values = new Map(records.flatMap((record) => Object.entries(record.values)));
    const referencedColumns = parsed.data.flatMap((record) =>
      Object.values(record.values)
        .filter(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            records.some((parent) => parent.id === value.recordId),
        )
        .map((value) => (typeof value === "object" && value ? value.column : "")),
    );
    for (const column of referencedColumns) if (!values.has(column)) values.set(column, 0);
    let row = 14;
    for (const [column, value] of values) {
      const ai =
        referencedColumns.includes(column) &&
        records.every((record) => record.values[column] === undefined);
      const type = ai
        ? "int auto_increment"
        : typeof value === "object" && value !== null
          ? "int"
          : typeof value === "boolean"
            ? "bit(1)"
            : typeof value === "number"
              ? "int"
              : "varchar(255)";
      sheet.getRow(row).values = [
        row - 13,
        column,
        column,
        type,
        ai ? "Yes (PK)" : value === null ? "" : "Yes",
      ];
      row++;
    }
  }
  if (invalid) master.removeWorksheet("大工程マトリクス");
  return {
    schema: Buffer.from(await schema.xlsx.writeBuffer()),
    master: Buffer.from(await master.xlsx.writeBuffer()),
  };
}

test("empty screens, persistent settings and real worker conversion/save", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const remote: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/))
      remote.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText("未実行", { exact: true })).toBeVisible();
  for (const route of ["/validation", "/sql", "/tables", "/mapping", "/history", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("main")).not.toContainText("モック");
  }
  await page.getByRole("textbox").nth(0).fill("35");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("textbox").nth(0)).toHaveValue("35");
  await page.evaluate(
    (settings) => localStorage.setItem("shepherd-local-settings", JSON.stringify(settings)),
    { ...defaultSettings, ...fixtureOptions },
  );
  await page.goto("/convert");
  const files = await workbooks();
  await page.locator('input[type="file"]').nth(0).setInputFiles({
    name: "schema.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: files.schema,
  });
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: "master.xlsm",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    buffer: files.master,
  });
  await expect(page.getByRole("button", { name: "変換を開始", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "変換を開始", exact: true }).click();
  await expect(
    page.getByText("すべての検証が完了しました。SQLを生成できます。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SQL生成", exact: true }).click();
  await expect(page).toHaveURL(/\/sql$/);
  await expect(page.getByText("START TRANSACTION;", { exact: true })).toBeVisible();
  await page.getByPlaceholder("SQLを検索").fill("検査値");
  await expect(page.locator("main")).toContainText("検査値");
  await page.getByPlaceholder("SQLを検索").fill("");
  await page.screenshot({ path: "test-results/sql-preview.png", fullPage: false });
  await page.getByRole("button", { name: "SQLをコピー", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("COMMIT;");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SQLをダウンロード", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^insert_.*\.sql$/);
  // Windows clipboard APIs normalize line endings; the saved UTF-8 SQL retains LF.
  expect(await readFile((await download.path())!, "utf8")).toBe(copied.replace(/\r\n/g, "\n"));
  await expect(page.getByText("生成ファイルを保存しました。", { exact: true })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByRole("cell", { name: "master.xlsm", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "詳細", exact: true }).click();
  await expect(page.getByText("この実行の検証結果", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("invalid format clears SQL and blocks generation", async ({ page }) => {
  await page.goto("/convert");
  const files = await workbooks(true);
  await page.locator('input[type="file"]').nth(0).setInputFiles({
    name: "schema.xlsx",
    mimeType: "application/octet-stream",
    buffer: files.schema,
  });
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: "master.xlsm",
    mimeType: "application/octet-stream",
    buffer: files.master,
  });
  await page.getByRole("button", { name: "変換を開始", exact: true }).click();
  await expect(
    page.getByText("マスタファイルのフォーマットが定義と一致しないため処理を続行できません。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/sql");
  await expect(page.getByText("SQLは未生成です。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SQLをダウンロード" })).toHaveCount(0);
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await info.attach("page-text", {
      body: await page.locator("body").innerText(),
      contentType: "text/plain",
    });
    await page.screenshot({ path: info.outputPath("failure.png") });
  }
});

test("validation errors export reports without SQL", async ({ page }) => {
  await page.goto("/convert");
  const files = await workbooks();
  await page.locator('input[type="file"]').nth(0).setInputFiles({
    name: "schema.xlsx",
    mimeType: "application/octet-stream",
    buffer: files.schema,
  });
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: "master.xlsm",
    mimeType: "application/octet-stream",
    buffer: files.master,
  });
  await page.getByRole("button", { name: "変換を開始", exact: true }).click();
  await expect(
    page.getByText("検証エラーが存在するためSQLを生成できません。", { exact: true }),
  ).toBeVisible();
  await page.locator("aside").getByRole("link", { name: "検証結果" }).click();
  const names: string[] = [];
  page.on("download", (download) => names.push(download.suggestedFilename()));
  await page.getByRole("button", { name: "レポート保存", exact: true }).click();
  await expect(page.getByText("生成ファイルを保存しました。", { exact: true })).toBeVisible();
  await expect.poll(() => names.length).toBe(3);
  expect(names.sort()).toEqual([
    "master_snapshot.json",
    "validation_report.json",
    "validation_report.xlsx",
  ]);
});

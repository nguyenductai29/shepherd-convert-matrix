import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import {
  masterFixture,
  masterFixtureOptions as fixtureOptions,
} from "../src/test/fixtures/master-workbook";
import { parseMaster } from "../src/services/processing/master-parser";

const masterName = "35_Shepherd導入_マスタ整備ファイル.xlsm";

async function workbooks(invalid = false, invalidValues = false) {
  const master = masterFixture();
  const file = {
    kind: "master" as const,
    name: masterName,
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
  const departments = new ExcelJS.Workbook();
  const departmentSheet = departments.addWorksheet("m_departments");
  departmentSheet.addRow([
    "department_id",
    "department_code",
    "department_name",
    "edit_ctrl_kbn",
    "invalid_flg",
  ]);
  for (const department of fixtureOptions.departmentReferences) {
    departmentSheet.addRow([
      department.departmentId,
      department.departmentCode,
      department.departmentName,
      department.editCtrlKbn,
      Number(department.invalidFlg),
    ]);
  }
  if (invalid) master.removeWorksheet("大工程マトリクス");
  if (invalidValues) master.getWorksheet("2_3_4_8_工程項目マトリクス")!.getCell("D8").value = "%";
  return {
    schema: Buffer.from(await schema.xlsx.writeBuffer()),
    master: Buffer.from(await master.xlsx.writeBuffer()),
    departments: Buffer.from(await departments.xlsx.writeBuffer()),
  };
}

async function loadKbn(page: Page) {
  await page.getByLabel("区分名称マスタファイル").setInputFiles({
    name: "m_kbn_definition.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixtureOptions.kbnDefinitions)),
  });
  await expect(
    page.getByText(`読込済み: ${fixtureOptions.kbnDefinitions.length}件`, { exact: true }),
  ).toBeVisible();
}

async function selectWorkbooks(
  page: Page,
  files: Awaited<ReturnType<typeof workbooks>>,
  kbn = true,
) {
  await page.getByLabel("テーブル定義書ファイル").setInputFiles({
    name: "schema.xlsx",
    mimeType: "application/octet-stream",
    buffer: files.schema,
  });
  await page.getByLabel("部門マスタファイル").setInputFiles({
    name: "ShepherdDB.m_departments.xlsx",
    mimeType: "application/octet-stream",
    buffer: files.departments,
  });
  await expect(
    page.getByRole("button", { name: "ファイルを変更", exact: true }).first(),
  ).toBeEnabled();
  if (kbn) await loadKbn(page);
  await page.getByLabel("マスタ整備ファイル", { exact: true }).setInputFiles({
    name: masterName,
    mimeType: "application/octet-stream",
    buffer: files.master,
  });
  await expect(page.getByRole("button", { name: "変換を開始", exact: true })).toBeEnabled();
}

async function configureQuantity(page: Page) {
  await page.goto("/settings");
  await page.getByRole("textbox", { name: "品目構成の数量" }).fill("1");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(page.getByText("設定を保存しました。", { exact: true })).toBeVisible();
  await page.goto("/convert");
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
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("ログインID → ユーザーID");
  await page.getByRole("textbox", { name: "品目構成の数量" }).fill("1");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(page.getByText("設定を保存しました。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "品目構成の数量" })).toHaveValue("1");
  await page.goto("/convert");
  await expect(page.locator('input[type="file"]')).toHaveCount(4);
  await page.getByLabel("区分名称マスタファイル").setInputFiles({
    name: "m_kbn_definition.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixtureOptions.kbnDefinitions)),
  });
  // Source loading belongs to the provider and survives navigation away from the card.
  await page.locator("aside").getByRole("link", { name: "設定", exact: true }).click();
  await expect(page.locator("main")).toContainText("m_kbn_definition.json");
  await page.locator("aside").getByRole("link", { name: "マスタ変換", exact: true }).click();
  await expect(
    page.getByText(`読込済み: ${fixtureOptions.kbnDefinitions.length}件`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("m_kbn_definition.json", { exact: true })).toBeVisible();
  const files = await workbooks();
  await selectWorkbooks(page, files, false);
  await page.locator("main").evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/conversion-references.png", fullPage: false });
  await page.getByRole("button", { name: "変換を開始", exact: true }).click();
  await expect(
    page.getByText("すべての検証が完了しました。SQLを生成できます。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("ID: 123", { exact: true })).toBeVisible();
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
  expect(copied).not.toContain("INSERT INTO `m_departments`");
  expect(copied).not.toContain("r_user_report_outputs");
  expect(copied).toContain("123");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SQLをダウンロード", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^insert_.*\.sql$/);
  // Windows clipboard APIs normalize line endings; the saved UTF-8 SQL retains LF.
  expect(await readFile((await download.path())!, "utf8")).toBe(copied.replace(/\r\n/g, "\n"));
  await expect(page.getByText("生成ファイルを保存しました。", { exact: true })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByRole("cell", { name: masterName, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "詳細", exact: true }).click();
  await expect(page.getByText("この実行の検証結果", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("invalid format clears SQL and blocks generation", async ({ page }) => {
  await configureQuantity(page);
  const files = await workbooks(true);
  await selectWorkbooks(page, files);
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
  await configureQuantity(page);
  const files = await workbooks(false, true);
  await selectWorkbooks(page, files);
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

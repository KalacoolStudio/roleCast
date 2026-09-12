import { expect, test } from "@playwright/test";

test("cloud mode discloses cloud storage and the private workspace", async ({
  page,
}) => {
  await page.route("**/api/runtime", (route) =>
    route.fulfill({ json: { deploymentMode: "gcp" } }),
  );
  await page.goto("/");
  await expect(
    page.getByText("雲端私人工作區", { exact: false }),
  ).toBeVisible();
  const newExercise = page.getByRole("button", { name: /開始新演練/ });
  if (await newExercise.isVisible()) await newExercise.click();
  await expect(page.locator(".privacy")).toContainText("紀錄保存在 GCP");
  await expect(page.locator(".privacy")).toContainText("其他瀏覽器工作區隔離");
  await expect(page.locator(".privacy")).toContainText("外部 LLM API");
  await expect(page.locator(".privacy")).not.toContainText("紀錄保存在本機");
});

test("runtime lookup can recover after a connection error", async ({
  page,
}) => {
  await page.route("**/api/runtime", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/runtime");
  await page.getByRole("button", { name: "重新取得狀態" }).click();
  await expect(page.getByText("本機工作空間", { exact: false })).toBeVisible();
});

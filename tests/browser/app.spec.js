import { test, expect } from "@playwright/test";
test.describe.configure({ mode: "serial" });
test("desktop and mobile layout; failed and interrupted histories remain readable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "選擇今天的練習" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  await page.locator(".history-item").filter({ hasText: "演練未完成" }).click();
  await expect(page.getByRole("alert")).toContainText("模型 API 驗證失敗");
  await page.locator(".history-item").filter({ hasText: "演練已中斷" }).click();
  await expect(page.getByRole("alert")).toContainText("服務已重新啟動");
  await page.getByRole("button", { name: /開始新演練/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "演練紀錄 ＋" }).click();
  await expect(page.locator(".history-item").first()).toBeVisible();
  await page.getByRole("button", { name: "演練紀錄 −" }).click();
  await expect(page.getByRole("button", { name: /開始演練/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
});
test("scenario selection, keyboard interaction, refresh, StopCall and report evidence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "選擇今天的練習" }),
  ).toBeVisible();
  await expect(
    page.locator(".scenario-card").filter({ hasText: "後端工程師面試" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "紀錄保存在本機。演練內容會送至你設定的外部 LLM API 進行推論。",
    ),
  ).toBeVisible();
  await page.getByLabel("讓練習更貼近你").fill("我想練習查證。");
  await page.getByRole("button", { name: /開始演練/ }).click();
  await page.getByRole("button", { name: /接通對話/ }).click();
  const input = page.getByLabel("你的回覆");
  await expect(input).toBeEnabled();
  await input.fill("好");
  await page.getByRole("button", { name: /送出/ }).focus();
  await page.keyboard.press("Enter");
  await expect(input).toBeDisabled();
  await expect(page.getByRole("button", { name: "掛斷本通" })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await expect(page.locator(".message.user")).toHaveCount(1);
  await page.getByLabel("你的回覆").fill("你是詐騙，我要透過官方管道查證");
  await page.getByRole("button", { name: /送出/ }).click();
  await expect(
    page.getByRole("heading", { name: "這次練習，你帶走了什麼？" }),
  ).toBeVisible();
  await expect(page.getByLabel("你的回覆")).toHaveCount(0);
  await expect(page.locator(".evidence a").first()).toBeVisible();
  await page.locator(".evidence a").first().click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "這次練習，你帶走了什麼？" }),
  ).toBeVisible();
});
test("interview recalls a persona and changes role on a later call; finishes with history", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".scenario-card")
    .filter({ hasText: "後端工程師面試" })
    .click();
  await page.getByRole("button", { name: /開始演練/ }).click();
  for (let call = 1; call <= 3; call++) {
    await page.getByRole("button", { name: /接通對話/ }).click();
    await expect(page.getByLabel("你的回覆")).toBeEnabled();
    await page
      .getByLabel("你的回覆")
      .fill(`第 ${call} 次回答：先驗證資料，再分批切換與回退。`);
    await page.getByRole("button", { name: /送出/ }).click();
    await expect(page.getByLabel("你的回覆")).toBeEnabled();
    await page.getByRole("button", { name: "掛斷本通" }).click();
  }
  await expect(page.locator(".report")).toBeVisible();
  await expect(page.locator(".call")).toHaveCount(3);
  await expect(page.locator(".call-heading h2").nth(1)).toContainText("林小姐");
  await expect(page.locator(".call-heading h2").nth(2)).toContainText("陳主管");
  await page.getByRole("button", { name: /開始下一次練習/ }).click();
  await page.locator(".history-item").first().click();
  await expect(page.locator(".report")).toBeVisible();
});
test("early finish reports insufficient evidence and network recovery works", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /開始演練/ }).click();
  await expect(page.getByRole("button", { name: /接通對話/ })).toBeVisible();
  await page.route("**/api/sessions/*", (route) => route.abort());
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/sessions/*");
  await page.getByRole("button", { name: "重新取得狀態" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(
    page.getByText("目前證據不足，部分面向尚無法評估。"),
  ).toBeVisible();
});

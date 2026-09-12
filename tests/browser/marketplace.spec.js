import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const opening = "您好，耳機還在嗎？配件都有嗎？";
const sellerReply = "還在，配件都有，已經幫你確認好了。";

test("anti-fraud starts with the prepared chat; playback, attachment and verification do not create a drill", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let creates = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/drills"
    )
      creates++;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /開始演練/ })).toBeEnabled();
  const initialHistory = await page.request.get("/api/drills");
  expect(initialHistory.ok()).toBe(true);
  const before = await initialHistory.json();
  await page.getByLabel("讓練習更貼近你").fill("我想練習查證。");
  await page.getByRole("button", { name: /開始演練/ }).click();
  await expect(
    page.getByRole("heading", { name: "從一則商品詢問開始" }),
  ).toBeVisible();
  await expect(page.locator(".market-bubble").first()).toContainText(opening);
  await expect(page.locator(".market-bubble").nth(1)).toContainText(
    sellerReply,
  );
  await expect(page.getByRole("button", { name: "申請客服回電" })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator(".market-bubble")).toHaveCount(5);
  await expect(page.locator(".market-chat-header")).toContainText("示範對話");
  expect(
    await page
      .locator(".marketplace-intro img")
      .evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("marketplace-desktop.png"),
    fullPage: true,
  });
  const attachment = page.getByRole("button", {
    name: "放大買家傳送的結帳失敗示意截圖",
  });
  await attachment.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("訂單編號 RC-1024");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(attachment).toBeFocused();
  await attachment.click();
  await page.getByRole("button", { name: "返回聊聊", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "重播對話" }).click();
  await expect(page.locator(".market-bubble")).toHaveCount(1);
  await page.getByRole("button", { name: "顯示完整對話" }).click();
  await expect(page.locator(".market-bubble")).toHaveCount(5);
  await page.getByRole("button", { name: "自行找官方客服確認" }).click();
  await expect(
    page.getByRole("heading", { name: "你選擇了獨立查證" }),
  ).toBeVisible();
  await expect(page.locator(".market-result")).toContainText(
    "尚未進行實際查證或通話評估",
  );
  await page.getByRole("button", { name: "返回聊天室" }).click();
  await expect(page.locator(".market-bubble").first()).toContainText(opening);
  expect(creates).toBe(0);
  expect(await (await page.request.get("/api/drills")).json()).toEqual(before);
  await page.getByRole("button", { name: "返回劇本大廳" }).click();
  await expect(page.getByLabel("讓練習更貼近你")).toHaveValue("我想練習查證。");
  await page.getByRole("button", { name: /開始演練/ }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "選擇今天的練習" }),
  ).toBeVisible();
  expect(creates).toBe(0);
});

test("mobile reduced-motion chat hands off once, retains background, and excludes the prepared messages from history and reports", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const background = "我想學習如何選擇可靠的查證管道。";
  await page.getByLabel("讓練習更貼近你").fill(background);
  await page.getByRole("button", { name: /開始演練/ }).click();
  await expect(
    page.getByRole("button", { name: "申請客服回電" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "顯示完整對話" })).toHaveCount(
    0,
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("marketplace-mobile.png"),
    fullPage: true,
  });
  const creates = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/drills"
    )
      creates.push(request.postDataJSON());
  });
  await page.route("**/api/drills", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { message: "暫時無法開始，請重試。" },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "申請客服回電" }).click();
  await expect(page.getByRole("alert")).toContainText("暫時無法開始");
  await expect(page.locator(".marketplace-intro")).toBeVisible();
  await page.unroute("**/api/drills");
  await page.getByRole("button", { name: "申請客服回電" }).click();
  await expect(page.getByRole("button", { name: /用語音接通/ })).toBeVisible();
  expect(creates).toEqual([
    { plotId: "anti-fraud", background },
    { plotId: "anti-fraud", background },
  ]);
  const id = await page.evaluate(() => location.hash.slice(1));
  const drill = await (await page.request.get(`/api/drills/${id}`)).json();
  expect(drill.calls).toEqual([]);
  expect(JSON.stringify(drill)).not.toContain(opening);
  expect(JSON.stringify(drill)).not.toContain(sellerReply);
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toContainText("目前證據不足");
  await expect(page.locator(".report")).not.toContainText(sellerReply);
  await page.reload();
  await expect(page.locator(".report")).toBeVisible();
  await expect(page.locator(".marketplace-intro")).toHaveCount(0);
});

test("a callback conflict resumes the existing drill and leaving the intro cancels playback", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /開始演練/ }).click();
  await expect(page.locator(".market-bubble").first()).toContainText(opening);
  await page.getByRole("button", { name: "劇本工作室", exact: true }).click();
  await expect(page.locator(".marketplace-intro")).toHaveCount(0);
  await page.getByRole("button", { name: /開始新演練/ }).click();
  await page.getByRole("button", { name: /開始演練/ }).click();
  await page.getByRole("button", { name: "顯示完整對話" }).click();
  const response = await page.request.post("/api/drills", {
    data: { plotId: "interview", background: "" },
  });
  expect(response.status()).toBe(202);
  const { id } = await response.json();
  await page.getByRole("button", { name: "申請客服回電" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .locator(".marketplace-intro")
    .getByRole("button", { name: /繼續目前演練/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "後端工程師面試" }),
  ).toBeVisible();
  expect(await page.evaluate(() => location.hash.slice(1))).toBe(id);
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
});

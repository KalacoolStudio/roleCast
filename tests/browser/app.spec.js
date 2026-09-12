import { startDrill } from "../support/browser.js";
import { test, expect } from "@playwright/test";
test.describe.configure({ mode: "serial" });

async function currentDrill(page) {
  const id = new URL(page.url()).hash.slice(1);
  return (await page.request.get(`/api/drills/${id}`)).json();
}

async function acceptThroughApi(page) {
  await expect(page.getByRole("button", { name: /用語音接通/ })).toBeVisible();
  const drill = await currentDrill(page);
  const response = await page.request.post(
    `/api/drills/${drill.id}/calls/accept`,
    { data: { assignmentId: drill.pendingCall.assignmentId } },
  );
  expect(response.ok()).toBe(true);
  await expect.poll(async () => (await currentDrill(page)).busy).toBe(false);
  return (await response.json()).callId;
}

async function sendThroughApi(page, text) {
  const drill = await currentDrill(page);
  const response = await page.request.post(
    `/api/drills/${drill.id}/calls/${drill.currentCallId}/messages`,
    { data: { clientMessageId: crypto.randomUUID(), text } },
  );
  expect(response.ok()).toBe(true);
  await expect.poll(async () => (await currentDrill(page)).busy).toBe(false);
}
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
    page.locator(".plot-card").filter({ hasText: "後端工程師面試" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "紀錄保存在本機。演練內容會送至你設定的外部 LLM API 進行推論。",
    ),
  ).toBeVisible();
  await page.getByLabel("讓練習更貼近你").fill("我想練習查證。");
  await startDrill(page);
  await acceptThroughApi(page);
  await expect(page.getByLabel("你的回覆")).toHaveCount(0);
  await sendThroughApi(page, "好");
  await expect(page.getByRole("button", { name: "掛斷本通" })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("你的回覆")).toHaveCount(0);
  await expect(page.locator(".message.user")).toHaveCount(1);
  await sendThroughApi(page, "你是詐騙，我要透過官方管道查證");
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
    .locator(".plot-card")
    .filter({ hasText: "後端工程師面試" })
    .click();
  await startDrill(page);
  for (let call = 1; call <= 3; call++) {
    await acceptThroughApi(page);
    await expect(page.getByLabel("你的回覆")).toHaveCount(0);
    await sendThroughApi(
      page,
      `第 ${call} 次回答：先驗證資料，再分批切換與回退。`,
    );
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
  await startDrill(page);
  await expect(page.getByRole("button", { name: /用語音接通/ })).toBeVisible();
  await page.route("**/api/drills/*", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/drills/*");
  await page.getByRole("button", { name: "重新取得狀態" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(
    page.getByText("目前證據不足，部分面向尚無法評估。"),
  ).toBeVisible();
});

test("plot editor copies, edits three prompts, exports/imports and launches an independent drill", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "劇本工作室", exact: true }).click();
  const library = page
    .locator(".plot-library article")
    .filter({ hasText: "防詐警覺演練" });
  await library.getByRole("button", { name: "複製", exact: true }).click();
  await page.getByLabel("劇本名稱", { exact: true }).fill("自訂客服演練");
  await page
    .getByLabel("Mastermind prompt")
    .fill("請安排客服跟進，M_BROWSER。");
  await page.getByLabel("Judge prompt").fill("請觀察查證行動，J_BROWSER。");
  await page.getByLabel("Reporter prompt").fill("請給出具體回饋，R_BROWSER。");
  await page.getByRole("button", { name: "儲存劇本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已儲存劇本 · v1");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 JSON" }).click();
  const download = await downloaded;
  const file = await download.path();
  await page.screenshot({
    path: testInfo.outputPath("plot-editor-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Reporter prompt")).toHaveValue(
    "請給出具體回饋，R_BROWSER。",
  );
  await page.screenshot({
    path: testInfo.outputPath("plot-editor-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "返回劇本列表" }).click();
  await page.getByLabel("匯入劇本 JSON").setInputFiles(file);
  await expect(page.getByRole("status")).toContainText("已匯入草稿");
  await expect(page.getByLabel("Mastermind prompt")).toHaveValue(
    "請安排客服跟進，M_BROWSER。",
  );
  await expect(page.getByLabel("Judge prompt")).toHaveValue(
    "請觀察查證行動，J_BROWSER。",
  );
  await expect(page.getByLabel("Reporter prompt")).toHaveValue(
    "請給出具體回饋，R_BROWSER。",
  );
  await page.getByLabel("劇本名稱", { exact: true }).fill("匯入客服演練");
  await page.getByRole("button", { name: "儲存劇本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已儲存劇本 · v1");
  await page.getByRole("button", { name: "使用此劇本 ↗" }).click();
  await expect(page.locator(".plot-card.chosen")).toContainText("匯入客服演練");
  await startDrill(page);
  await expect(
    page.getByRole("heading", { name: "匯入客服演練" }),
  ).toBeVisible();
  await expect(page.getByText(/Plot v1/)).toBeVisible();
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "匯入客服演練" }),
  ).toBeVisible();
});

test("new plot authoring validates imports and preserves drafts on conflicts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "劇本工作室", exact: true }).click();
  await page.getByLabel("匯入劇本 JSON").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"formatVersion":2,"plot":{}}'),
  });
  await expect(page.getByRole("alert")).toContainText("劇本欄位無效");
  await expect(
    page.getByRole("heading", { name: "新增劇本", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "＋ 新增劇本" }).click();
  await expect(page.getByLabel("固定事實")).toHaveCount(0);
  await expect(page.getByLabel("評估判準")).toHaveCount(0);
  await expect(page.getByLabel("Mastermind prompt")).toHaveValue(
    "從虛構購物客服來電開始，按受測者反應安排後續角色或回撥，練習異常要求識別與獨立查證。所有資金操作僅口頭模擬。",
  );
  await expect(page.getByLabel("Judge prompt")).toHaveValue(
    "聚焦異常識別、敏感資訊保護與獨立查證。簡短拒絕不等於識破，明確質疑詐騙且提出獨立查證才能依停止條件中斷。",
  );
  await page.getByLabel("劇本名稱", { exact: true }).fill("危機溝通");
  await page.getByLabel("劇本簡介").fill("練習對外說明事件。");
  await page.getByLabel("演練目標").fill("用可查證事實解釋事件。");
  await page.getByLabel("停止條件").fill("已說明事實並提出下一步。");
  await page.getByRole("button", { name: "儲存劇本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已儲存劇本 · v1");
  const plots = await (await page.request.get("/api/plots")).json();
  const plot = await (
    await page.request.get(
      `/api/plots/${plots.find((p) => p.name === "危機溝通").id}`,
    )
  ).json();
  const { id, ...body } = plot;
  await page.request.put(`/api/plots/${id}`, {
    data: { ...body, name: "其他分頁改過" },
  });
  await page.getByLabel("Reporter prompt").fill("不可遺失的草稿");
  await page.getByRole("button", { name: "儲存劇本", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("其他分頁");
  await expect(page.getByLabel("Reporter prompt")).toHaveValue(
    "不可遺失的草稿",
  );
  await page.getByRole("button", { name: "放棄草稿並重新載入" }).click();
  await expect(page.getByLabel("劇本名稱", { exact: true })).toHaveValue(
    "其他分頁改過",
  );
  await page.getByLabel("Reporter prompt").fill("新的報告方式");
  await page.getByRole("button", { name: "儲存劇本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已儲存劇本 · v3");
});

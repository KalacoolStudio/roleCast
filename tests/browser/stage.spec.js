import { startDrill } from "../support/browser.js";
import { test, expect } from "@playwright/test";
test.describe.configure({ mode: "serial" });

test("live stage follows real calls, retains persona identity, and restores without replay", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator(".plot-card")
    .filter({ hasText: "後端工程師面試" })
    .click();
  await startDrill(page);
  await expect(
    page.getByRole("region", { name: "角色即時舞台" }),
  ).toBeVisible();
  await expect(page.locator(".stage-character.persona")).toHaveAttribute(
    "data-position",
    "call",
    { timeout: 5000 },
  );
  const sprite = await page
    .locator(".stage-character.persona")
    .getAttribute("data-sprite");
  await expect(page.locator(".stage-caption")).toContainText("即時同步");
  await page.screenshot({
    path: testInfo.outputPath("stage-desktop-awaiting.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /接通對話/ }).click();
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await expect(page.locator(".stage-character.judge")).toHaveAttribute(
    "data-position",
    "watch",
  );
  await page.screenshot({
    path: testInfo.outputPath("stage-desktop-call.png"),
    fullPage: true,
  });
  const id = await page.evaluate(() => location.hash.slice(1));
  const before = await (await page.request.get(`/api/drills/${id}`)).json();
  await page.reload();
  await expect(page.locator(".stage-character.persona")).toHaveAttribute(
    "data-position",
    "call",
  );
  await expect(page.locator(".stage-character.persona")).toHaveAttribute(
    "data-walking",
    "false",
  );
  await expect(page.locator(".stage-activity li")).toHaveCount(0);
  const after = await (await page.request.get(`/api/drills/${id}`)).json();
  expect(after.stage.lastEventSequence).toBe(before.stage.lastEventSequence);
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await expect(page.getByRole("button", { name: /接通對話/ })).toBeVisible();
  await expect(page.locator(".stage-caption")).toContainText("再次上場");
  await expect(page.locator(".stage-character.persona")).toHaveAttribute(
    "data-sprite",
    sprite,
  );
  await page.getByRole("button", { name: /接通對話/ }).click();
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
  await expect(page.locator(".stage-character.persona")).toHaveCount(0);
  await expect(page.locator(".stage-caption")).toContainText("紀錄已保存");
  expect(errors).toEqual([]);
});

test("mobile reduced motion keeps a compact role summary while typing", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await startDrill(page);
  await expect(page.getByLabel("減少動畫")).toBeChecked();
  await page.getByRole("button", { name: /接通對話/ }).click();
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await expect(page.locator(".stage-character.persona")).toHaveAttribute(
    "data-walking",
    "false",
  );
  await expect(page.locator(".stage-character.judge")).toHaveAttribute(
    "data-walking",
    "false",
  );
  await page.screenshot({
    path: testInfo.outputPath("stage-mobile.png"),
    fullPage: true,
  });
  await page.getByLabel("你的回覆").fill("我會先確認資料來源");
  await expect(page.locator(".stage-compact-summary")).toBeVisible();
  await expect(page.locator(".stage-compact-summary")).toContainText(
    "Judge 監看中",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("stage-mobile-typing.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /送出/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
});

test("SSE fallback catches up once, then reconnects without extra calls", async ({
  page,
}) => {
  await page.route("**/events/stream*", (route) => route.abort());
  await page.goto("/");
  await startDrill(page);
  await expect(page.getByRole("button", { name: /接通對話/ })).toBeVisible();
  await expect(page.locator(".stage-caption")).toContainText("備援連線");
  const id = await page.evaluate(() => location.hash.slice(1));
  await page.getByRole("button", { name: /接通對話/ }).click();
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await page.unroute("**/events/stream*");
  await expect(page.locator(".stage-caption")).toContainText("即時同步", {
    timeout: 7000,
  });
  const value = await (await page.request.get(`/api/drills/${id}`)).json();
  expect(value.calls).toHaveLength(1);
  expect(value.calls[0].messages).toHaveLength(1);
  const list = await page.locator(".stage-activity li").allTextContents();
  expect(new Set(list).size).toBe(list.length);
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
});

test("a legacy snapshot without stage metadata remains usable", async ({
  page,
}) => {
  await page.goto("/");
  await startDrill(page);
  await page.getByRole("button", { name: /接通對話/ }).click();
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  const id = await page.evaluate(() => location.hash.slice(1));
  await page.route(`**/api/drills/${id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.stage;
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.locator(".stage-character.persona")).toHaveAttribute(
    "data-position",
    "call",
  );
  await expect(page.getByLabel("你的回覆")).toBeEnabled();
  await expect(page.locator(".stage-activity li")).toHaveCount(0);
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
});

test("walk sprites change frames while Persona and Judge actually move, then return to idle", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.evaluate(() => {
    window.spriteSamples = [];
    window.recordSprites = true;
    const sample = () => {
      for (const kind of ["persona", "judge"]) {
        const el = document.querySelector(`.stage-character.${kind}`);
        if (el) {
          const box = el.getBoundingClientRect();
          window.spriteSamples.push({
            kind,
            x: box.x,
            y: box.y,
            frame: Number(el.dataset.frame),
            walking: el.dataset.walking === "true",
            facing: el.dataset.facing,
            crop: el.querySelector("img").style.left,
          });
        }
      }
      if (window.recordSprites) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await startDrill(page);
  const persona = page.locator(".stage-character.persona"),
    judge = page.locator(".stage-character.judge");
  await expect(persona).toHaveAttribute("data-position", "call");
  await expect(persona).toHaveAttribute("data-walking", "false");
  await expect(persona).toHaveAttribute("data-frame", "0");
  await page.getByRole("button", { name: /接通對話/ }).click();
  await expect(judge).toHaveAttribute("data-walking", "true");
  await page.screenshot({ path: testInfo.outputPath("judge-walking.png") });
  await expect(judge).toHaveAttribute("data-walking", "false");
  await expect(judge).toHaveAttribute("data-frame", "0");
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await expect(page.getByRole("button", { name: /接通對話/ })).toBeVisible();
  await expect(page.locator(".stage-canvas")).toHaveAttribute(
    "data-phase",
    "awaiting_call",
  );
  await expect(persona).toHaveAttribute("data-walking", "false");
  await expect(judge).toHaveAttribute("data-walking", "false");
  const samples = await page.evaluate(() => {
    window.recordSprites = false;
    return window.spriteSamples;
  });
  for (const kind of ["persona", "judge"]) {
    const moving = samples.filter((s) => s.kind === kind && s.walking);
    expect(new Set(moving.map((s) => s.frame))).toEqual(new Set([4, 5, 6, 7]));
    expect(moving.every((s) => s.crop === `${-(s.frame % 4) * 100}%`)).toBe(
      true,
    );
    expect(
      moving.some((s, i) => i > 0 && Math.abs(s.x - moving[i - 1].x) > 1),
    ).toBe(true);
    expect(moving.some((s) => s.facing === "left")).toBe(true);
    expect(moving.some((s) => s.facing === "right")).toBe(true);
  }
  await testInfo.attach("sprite-motion-samples", {
    body: JSON.stringify(samples),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "結束整場演練" }).click();
  await expect(page.locator(".report")).toBeVisible();
});

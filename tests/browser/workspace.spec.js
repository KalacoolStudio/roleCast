import { expect, test } from "@playwright/test";
import { startDrill } from "../support/browser.js";

test("two browser workspaces run concurrently without seeing each other", async ({
  browser,
  baseURL,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await Promise.all([first.goto(baseURL), second.goto(baseURL)]);
    await Promise.all([
      expect(first.locator(".plot-card").first()).toBeVisible(),
      expect(second.locator(".plot-card").first()).toBeVisible(),
    ]);
    await Promise.all([startDrill(first), startDrill(second)]);
    await Promise.all([
      expect(first.getByRole("button", { name: "接聽" })).toBeEnabled(),
      expect(second.getByRole("button", { name: "接聽" })).toBeEnabled(),
    ]);

    const firstId = new URL(first.url()).hash.slice(1);
    const secondId = new URL(second.url()).hash.slice(1);
    expect(firstId).not.toBe(secondId);
    expect((await first.request.get(`/api/drills/${secondId}`)).status()).toBe(
      404,
    );
    expect((await second.request.get(`/api/drills/${firstId}`)).status()).toBe(
      404,
    );
    const firstList = await (await first.request.get("/api/drills")).json();
    const secondList = await (await second.request.get("/api/drills")).json();
    expect(firstList.activeId).toBe(firstId);
    expect(secondList.activeId).toBe(secondId);
    expect(firstList.drills.map((drill) => drill.id)).toContain(firstId);
    expect(firstList.drills.map((drill) => drill.id)).not.toContain(secondId);
    expect(secondList.drills.map((drill) => drill.id)).toContain(secondId);
    expect(secondList.drills.map((drill) => drill.id)).not.toContain(firstId);

    await Promise.all([
      first.request.post(`/api/drills/${firstId}/finish`, { data: {} }),
      second.request.post(`/api/drills/${secondId}/finish`, { data: {} }),
    ]);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

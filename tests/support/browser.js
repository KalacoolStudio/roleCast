import { expect } from "@playwright/test";

// Call-flow tests continue through the anti-fraud example. Dedicated intro
// tests use the actual home button directly to verify the entry behavior.
export async function startDrill(page) {
  await page.getByRole("button", { name: /開始演練/ }).click();
  await expect(page.locator(".marketplace-intro, .exercise")).toBeVisible();
  if (await page.locator(".marketplace-intro").isVisible()) {
    const showAll = page.getByRole("button", { name: "顯示完整對話" });
    if (await showAll.isVisible()) await showAll.click();
    await page.getByRole("button", { name: "申請客服回電" }).click();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
}

export async function finishDrill(page) {
  const finish = page.getByRole("button", { name: "結束整場演練" });
  await expect(finish).toBeEnabled();
  const incoming = page.getByRole("dialog");
  if (await incoming.isVisible())
    await incoming.getByRole("button", { name: "收合來電視窗" }).click();
  await finish.click();
}

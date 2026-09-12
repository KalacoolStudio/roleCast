import { test, expect } from "@playwright/test";
test.describe.configure({ mode: "serial" });
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.voiceTest = {
      tracks: [],
      contexts: [],
      captures: 0,
      outputs: 0,
      permissions: 0,
    };
    const acquire = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.voiceTest.permissions++;
      const stream = await acquire(constraints);
      window.voiceTest.tracks.push(...stream.getTracks());
      return stream;
    };
    const Audio = window.AudioContext;
    window.AudioContext = class extends Audio {
      constructor(...args) {
        super(...args);
        window.voiceTest.contexts.push(this);
      }
    };
    const Worklet = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends Worklet {
      constructor(...args) {
        super(...args);
        this.port.addEventListener("message", ({ data }) => {
          if (data.type === "audio") window.voiceTest.captures++;
        });
        const post = this.port.postMessage.bind(this.port);
        this.port.postMessage = (data, ...rest) => {
          if (data.type === "audio") window.voiceTest.outputs++;
          return post(data, ...rest);
        };
      }
    };
  });
});
test.afterEach(async ({ page }) => {
  const { activeId } = await (await page.request.get("/api/sessions")).json();
  if (activeId) {
    await page.request.post(`/api/sessions/${activeId}/finish`, { data: {} });
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/sessions")).json()).activeId,
      )
      .toBeNull();
  }
});
const stats = async (request) =>
  (await request.get("/api/__test/voice")).json();
const control = (request, data) => request.post("/api/__test/voice", { data });
async function currentDrill(page) {
  const id = new URL(page.url()).hash.slice(1);
  return (await page.request.get(`/api/drills/${id}`)).json();
}
async function start(page) {
  await page.goto("/");
  await page.getByRole("button", { name: /開始演練/ }).click();
  await expect(page.getByRole("button", { name: "用語音接通" })).toBeEnabled();
}
async function released(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.voiceTest.tracks.every((t) => t.readyState === "ended") &&
          window.voiceTest.contexts.every((c) => c.state === "closed"),
      ),
    )
    .toBe(true);
}
test("voice-only home blocks drills when voice is unavailable", async ({
  page,
}) => {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        voice: { available: false, reason: "NOT_CONFIGURED" },
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByText("語音尚未設定，請在 .env 設定 API_KEY 並重新啟動服務。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /開始演練/ })).toBeDisabled();
  await expect(page.getByText("即時語音互動").first()).toBeVisible();
  await expect(page.getByText("文字 / 語音互動")).toHaveCount(0);
});
test("voice-only calls save speech automatically and keep text controls absent", async ({
  page,
}) => {
  await page.route("**/api/runtime", (route) =>
    route.fulfill({ json: { deploymentMode: "gcp" } }),
  );
  await start(page);
  await expect(
    page.getByRole("button", { name: "接通對話", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.locator(".voice-panel small")).toContainText(
    "逐字稿保存在 GCP 私人工作區",
  );
  await expect(page.locator(".voice-panel small")).not.toContainText("本機");
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await expect(page.getByLabel("你的回覆")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "改用文字" })).toHaveCount(0);
  await expect(page.locator(".voice-message.persona > p")).toHaveText(
    "你好，請直接用語音和我聊聊。",
  );
  await expect(page.locator(".voice-message.user > p")).toHaveText(
    "我想先瞭解情況。",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => window.voiceTest.captures > 3 && window.voiceTest.outputs > 3,
      ),
    )
    .toBe(true);
  expect((await stats(page.request)).connections.at(-1).greetings).toBe(1);
  await expect
    .poll(async () => (await stats(page.request)).connections.at(-1).nonzero)
    .toBe(true);
  await page.getByRole("button", { name: "麥克風靜音", exact: true }).click();
  await expect(page.getByText("麥克風已靜音", { exact: true })).toBeVisible();
  const frames = (await stats(page.request)).connections.at(-1).frames;
  await page.waitForTimeout(400);
  expect(
    (await stats(page.request)).connections.at(-1).frames,
  ).toBeLessThanOrEqual(frames + 1);
  expect(await page.evaluate(() => window.voiceTest.tracks[0].enabled)).toBe(
    false,
  );
  await page.getByRole("button", { name: "取消靜音" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await expect
    .poll(async () => (await stats(page.request)).connections.at(-1).frames)
    .toBeGreaterThan(frames + 1);
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await released(page);
  await expect(page.locator(".call")).toHaveCount(1);
});
test("ATM drawer updates the drill balance and sends transfer and withdrawal evidence", async ({
  page,
}, testInfo) => {
  await start(page);
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();

  const tab = page.getByRole("button", { name: "ATM", exact: true });
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  await tab.click();
  await expect(tab).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("帳戶餘額")).toContainText("100,000");
  await page.getByLabel("收款帳號").fill("1234 5678");
  await page.getByLabel("匯款金額").fill("1250");
  await page.getByRole("button", { name: "確認匯款" }).click();
  await expect(page.locator(".atm-feedback[role='status']")).toContainText(
    "Judge 已收到操作紀錄",
  );
  await expect(page.getByLabel("帳戶餘額")).toContainText("98,750");
  await expect(page.locator(".message.atm-message")).toContainText(
    "收款帳號末四碼 5678",
  );
  await page.screenshot({ path: testInfo.outputPath("atm-drawer.png") });

  await page.getByRole("tab", { name: "提款" }).click();
  await page.getByLabel("提款金額").fill("750");
  await page.getByRole("button", { name: "確認提款" }).click();
  await expect(page.getByLabel("帳戶餘額")).toContainText("98,000");
  await expect(page.locator(".message.atm-message")).toHaveCount(2);
  const drill = await currentDrill(page);
  expect(drill.atm).toMatchObject({ balance: 98000 });
  expect(drill.atm.transactions).toHaveLength(2);
  expect(JSON.stringify(drill)).not.toContain("12345678");
  expect(
    drill.calls[0].messages.filter((message) => message.source === "atm"),
  ).toHaveLength(2);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("atm-drawer-mobile.png") });

  await page.keyboard.press("Escape");
  await expect(tab).toHaveAttribute("aria-expanded", "false");
});
test("Judge stops voice playback and report opens the exact voice evidence", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  expect((await stats(page.request)).connections.at(-1).greetings).toBe(1);
  // The first microphone frame emits another fixture utterance. Wait for it
  // before injecting the later evidence, so capture timing cannot reorder them.
  await expect(page.locator(".voice-message.user > p")).toContainText(
    "我想先瞭解情況。",
  );
  await control(page.request, { action: "play" });
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.outputs))
    .toBeGreaterThan(2);
  await control(page.request, {
    action: "say",
    text: "你是詐騙，我會透過官方管道查證。",
  });
  await expect(page.locator(".report")).toBeVisible();
  await released(page);
  const evidence = page.locator(".evidence a").first();
  const anchor = await evidence.getAttribute("href");
  await expect(evidence).toContainText("查證");
  await evidence.click();
  await expect(page.locator(anchor)).toBeVisible();
  await expect(page.locator(anchor)).toContainText("查證");
  await expect(page.locator(anchor).locator("..")).toHaveAttribute("open", "");
  await expect(page.locator(".call-end")).toHaveText("本通演練已結束");
});
test("permission denial creates no provider; retry succeeds; reload releases voice without reacquiring", async ({
  page,
}) => {
  await start(page);
  const before = (await stats(page.request)).attempts;
  await page.evaluate(() => {
    window.savedAcquire = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByRole("alert")).toContainText("請允許權限");
  expect((await stats(page.request)).attempts).toBe(before);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = window.savedAcquire;
  });
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("你的回覆")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "開啟語音" })).toBeEnabled();
  expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(0);
  expect((await stats(page.request)).attempts).toBe(before + 1);
  expect((await stats(page.request)).connections.at(-1).disconnected).toBe(
    true,
  );
});
test("provider loss offers voice retry; a fresh attempt can end through Persona delegation", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await control(page.request, { action: "disconnect" });
  await expect(page.getByRole("alert")).toContainText("語音連線無法使用");
  await released(page);
  await expect(page.getByLabel("你的回覆")).toHaveCount(0);
  await page.getByRole("button", { name: "重新開啟語音" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await control(page.request, { action: "say", text: "請稍後聯繫。" });
  await control(page.request, { action: "delegate" });
  await expect(page.locator(".call-end")).toHaveText("對方已結束通話");
  await released(page);
});
test("duration limit stops voice and navigation releases the next call's microphone", async ({
  page,
}) => {
  await start(page);
  const id = new URL(page.url()).hash.slice(1);
  await control(page.request, { action: "duration", id, seconds: 0.6 });
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.locator(".call-end")).toHaveText("已達本通語音時間上限");
  await released(page);
  await control(page.request, { action: "duration", id, seconds: 180 });
  await expect(page.getByRole("button", { name: "用語音接通" })).toBeEnabled();
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await page.getByRole("button", { name: /開始新演練/ }).click();
  await released(page);
  await expect
    .poll(
      async () => (await stats(page.request)).connections.at(-1).disconnected,
    )
    .toBe(true);
});
test("reading earlier captions preserves scrolling and a growing caption keeps its identity", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "用語音接通" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await expect(page.locator(".voice-message.user > p")).toContainText(
    "我想先瞭解情況",
  );
  const first = await page.locator(".voice-message.user").elementHandle();
  await control(page.request, {
    action: "say",
    text: "\n這是一段較長的練習紀錄。".repeat(55),
  });
  await expect(page.locator(".voice-message.user > p")).toContainText("較長");
  const transcript = page.locator(".drill-conversation .transcript");
  await expect
    .poll(() => transcript.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100);
  await transcript.evaluate((node) => node.scrollTo(0, 0));
  await expect(
    page.getByRole("button", { name: "回到最新對話 ↓" }),
  ).toHaveCount(1);
  await control(page.request, { action: "say", text: "新的結尾" });
  await expect(page.locator(".voice-message.user > p")).toContainText(
    "新的結尾",
  );
  expect(await first.evaluate((node) => node.isConnected)).toBe(true);
  expect(await transcript.evaluate((node) => node.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "回到最新對話 ↓" }).click();
  await expect
    .poll(() => transcript.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await released(page);
});

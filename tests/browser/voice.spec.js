import { startDrill } from "../support/browser.js";
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
      ringOscillators: [],
      ringContexts: new Set(),
      ringStops: 0,
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
      createOscillator(...args) {
        window.voiceTest.ringContexts.add(this);
        const oscillator = super.createOscillator(...args);
        const stop = oscillator.stop.bind(oscillator);
        oscillator.stop = (...stopArgs) => {
          window.voiceTest.ringStops++;
          return stop(...stopArgs);
        };
        window.voiceTest.ringOscillators.push(oscillator);
        return oscillator;
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
  const id = decodeURIComponent(
    new URL(page.url()).hash.slice(1).replace(/^reports\//, ""),
  );
  return (await page.request.get(`/api/drills/${id}`)).json();
}
async function start(page) {
  await page.goto("/");
  await startDrill(page);
  await expect(page.getByRole("button", { name: "接聽" })).toBeEnabled();
}
async function released(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.voiceTest.tracks.every((t) => t.readyState === "ended") &&
          window.voiceTest.contexts.every(
            (c) => window.voiceTest.ringContexts.has(c) || c.state === "closed",
          ),
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
test("incoming interview matches the reference and keyboard decline never opens voice", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .locator(".plot-card")
    .filter({ hasText: "後端工程師面試" })
    .click();
  await startDrill(page);
  const screen = page.getByRole("dialog", { name: "林小姐", exact: true });
  await expect(screen).toBeVisible();
  const pending = (await currentDrill(page)).pendingCall;
  await expect(screen.getByRole("heading")).toHaveText(pending.persona.name);
  await expect(screen.locator(".incoming-call-role")).toHaveText(
    pending.persona.role,
  );
  await expect(screen.locator(".incoming-call-badge")).toHaveText("HR");
  await expect(screen.getByRole("status")).toHaveText("來電中…");
  await expect(screen).toContainText("本機僅保存逐字稿");
  await expect(page.locator(".voice-panel")).toHaveCount(0);
  const screenBox = await screen.boundingBox();
  const workspace = await page.locator(".drill-workspace").boundingBox();
  const stage = await page.locator(".stage-panel").boundingBox();
  expect(screenBox.width).toBeLessThan(workspace.width);
  expect(screenBox.x + screenBox.width / 2).toBeCloseTo(720, 0);
  expect(stage.y).toBe(workspace.y);
  const layout = () =>
    page.evaluate(() => ({
      stage: document
        .querySelector(".stage-panel")
        .getBoundingClientRect()
        .toJSON(),
      chat: document
        .querySelector(".drill-conversation")
        .getBoundingClientRect()
        .toJSON(),
      height: document.documentElement.scrollHeight,
    }));
  const beforeDismiss = await layout();
  await page.keyboard.press("Escape");
  await expect(screen).not.toBeVisible();
  await expect(page.getByRole("button", { name: /查看來電/ })).toBeFocused();
  expect(await layout()).toEqual(beforeDismiss);
  expect((await currentDrill(page)).pendingCall).toEqual(pending);
  await page.keyboard.press("Enter");
  await expect(screen.getByRole("heading")).toBeFocused();
  expect(await layout()).toEqual(beforeDismiss);
  await page.mouse.click(4, 4);
  await expect(screen).not.toBeVisible();
  await page.getByRole("button", { name: /查看來電/ }).click();
  await page.screenshot({
    path: testInfo.outputPath("incoming-interview-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    screen.getByRole("button", { name: "接聽", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("incoming-interview-mobile.png"),
  });
  await screen.getByRole("button", { name: "拒接", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    screen.getByRole("button", { name: "接聽", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    screen.getByRole("button", { name: "收合來電視窗" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  const before = (await stats(page.request)).attempts;
  await page.keyboard.press("Enter");
  await expect(page.locator(".report")).toBeVisible();
  await expect(page.locator(".evidence-note")).toContainText("證據不足");
  expect((await currentDrill(page)).calls).toHaveLength(0);
  expect((await stats(page.request)).attempts).toBe(before);
  expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(0);
  await expect(screen).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
test("incoming custom identities wrap at narrow widths and unavailable voice still allows decline", async ({
  page,
}, testInfo) => {
  await start(page);
  const drill = await currentDrill(page);
  const longName = "Alexandra Montgomery-Wellington".repeat(3);
  // Keep the custom snapshot authoritative through polling; the fixture's
  // unmodified SSE snapshots would otherwise replace the injected identity.
  await page.route(`**/api/drills/${drill.id}/events/stream?*`, (route) =>
    route.abort(),
  );
  await page.route(`**/api/drills/${drill.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.plot.id = "custom-training";
    if (body.pendingCall) {
      body.pendingCall.persona.name = longName;
      body.pendingCall.persona.role =
        "跨國公司客戶關係與事件協調資深主管".repeat(3);
    }
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  const screen = page.locator(".incoming-call");
  await expect(screen.getByRole("heading")).toHaveText(longName);
  await expect(screen.locator(".incoming-call-badge")).toHaveText("AM");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const decline = await screen
      .getByRole("button", { name: "拒接", exact: true })
      .boundingBox();
    const answer = await screen
      .getByRole("button", { name: "接聽", exact: true })
      .boundingBox();
    expect(decline.height).toBeGreaterThanOrEqual(44);
    expect(answer.y).toBe(decline.y);
    expect(answer.x).toBeGreaterThan(decline.x + decline.width);
    expect(answer.x + answer.width).toBeLessThanOrEqual(width);
    const atm = page.getByRole("button", { name: "ATM", exact: true });
    await atm.evaluate((node) => node.focus());
    await expect(atm).not.toBeFocused();
    const bounds = await screen.boundingBox();
    const caller = await screen.getByRole("heading").boundingBox();
    expect(caller.x + caller.width).toBeLessThanOrEqual(
      bounds.x + bounds.width,
    );
    expect(answer.x + answer.width).toBeLessThanOrEqual(
      bounds.x + bounds.width,
    );
    expect(
      await screen.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await screen.screenshot({
    path: testInfo.outputPath("incoming-custom-320.png"),
  });
  await page.setViewportSize({ width: 320, height: 480 });
  expect((await screen.boundingBox()).height).toBeLessThanOrEqual(448);
  expect(
    await screen.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await screen
    .getByRole("button", { name: "拒接", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    screen.getByRole("button", { name: "拒接", exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("incoming-short-viewport.png"),
  });
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: { voice: { available: false, reason: "NOT_CONFIGURED" } },
    }),
  );
  await page.reload();
  await expect(screen.getByRole("status")).toContainText("語音目前無法使用");
  await expect(
    screen.getByRole("button", { name: "接聽", exact: true }),
  ).toBeDisabled();
  await expect(
    screen.getByRole("button", { name: "拒接", exact: true }),
  ).toBeEnabled();
  const before = (await stats(page.request)).attempts;
  await screen.getByRole("button", { name: "拒接", exact: true }).click();
  await expect(page.locator(".report")).toBeVisible();
  expect((await stats(page.request)).attempts).toBe(before);
  expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(0);
});
test("dismissed calls preserve the workspace and later assignments open a new popup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  const first = await currentDrill(page);
  await page.getByRole("button", { name: "收合來電視窗" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Accept using the existing API so the first assignment remains dismissed
  // locally, then confirm a later assignment is not hidden by that choice.
  const accepted = await page.request.post(
    `/api/drills/${first.id}/calls/accept`,
    {
      data: { assignmentId: first.pendingCall.assignmentId },
    },
  );
  const { callId } = await accepted.json();
  await expect.poll(async () => (await currentDrill(page)).busy).toBe(false);
  await page.request.post(`/api/drills/${first.id}/calls/${callId}/messages`, {
    data: {
      clientMessageId: crypto.randomUUID(),
      text: "這是先前保留的對話紀錄。\n".repeat(50),
    },
  });
  await expect.poll(async () => (await currentDrill(page)).busy).toBe(false);
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const next = await currentDrill(page);
  expect(next.pendingCall.assignmentId).not.toBe(
    first.pendingCall.assignmentId,
  );
  await page.keyboard.press("Escape");
  await page.locator(".transcript").evaluate((node) => node.scrollTo(0, 100));
  await page.evaluate(() => window.scrollTo(0, 180));
  const position = () =>
    page.evaluate(() => ({
      page: scrollY,
      chat: document.querySelector(".transcript").scrollTop,
    }));
  const before = await position();
  expect(before.chat).toBe(100);
  expect(before.page).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: /查看來電/ })
    .evaluate((node) => node.click());
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await position()).toEqual(before);
  await page.keyboard.press("Escape");
  expect(await position()).toEqual(before);
  expect((await currentDrill(page)).calls).toEqual(next.calls);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page
    .getByRole("button", { name: /查看來電/ })
    .evaluate((node) => node.click());
  await page.getByRole("button", { name: "拒接", exact: true }).click();
  await expect(page.locator(".report")).toBeVisible();
  expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(0);
});
test("voice-only calls save speech automatically and keep text controls absent", async ({
  page,
}) => {
  await page.route("**/api/runtime", (route) =>
    route.fulfill({ json: { deploymentMode: "gcp" } }),
  );
  await start(page);
  await expect(page.locator(".incoming-call-badge")).toHaveText("林");
  await expect(page.locator(".incoming-call-disclosure")).toContainText(
    "逐字稿保存在 GCP 私人工作區",
  );
  await expect(
    page.getByRole("button", { name: "接通對話", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "接聽" }).click();
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
  await expect(
    page.getByRole("button", { name: "接聽", exact: true }),
  ).toBeEnabled();
  const previous = (await currentDrill(page)).calls[0];
  const beforeDecline = (await stats(page.request)).attempts;
  await page.getByRole("button", { name: "拒接", exact: true }).click();
  await expect(page.locator(".report")).toBeVisible();
  expect((await currentDrill(page)).calls).toEqual([previous]);
  expect((await stats(page.request)).attempts).toBe(beforeDecline);
});
test("incoming ringing survives popup dismissal and stops on navigation or answer", async ({
  page,
}) => {
  await start(page);
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.ringOscillators.length))
    .toBe(2);
  const before = (await stats(page.request)).attempts;
  await page.getByRole("button", { name: "收合來電視窗" }).click();
  expect(await page.evaluate(() => window.voiceTest.ringStops)).toBe(0);
  await page.getByRole("button", { name: /歷史報告/ }).click();
  await expect(
    page.getByRole("heading", { name: "歷史報告", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.ringStops))
    .toBe(2);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("button", { name: /繼續目前演練/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.ringOscillators.length))
    .toBe(4);
  await page.getByRole("button", { name: "收合來電視窗" }).click();
  await page.getByRole("button", { name: "劇本工作室", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.ringStops))
    .toBe(4);
  expect((await stats(page.request)).attempts).toBe(before);
  expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(0);
  await page.getByRole("button", { name: /繼續目前演練/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.ringOscillators.length))
    .toBe(6);
  await page.getByRole("button", { name: "接聽" }).click();
  await expect
    .poll(() => page.evaluate(() => window.voiceTest.ringStops))
    .toBe(6);
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await released(page);
});
test("sidebar toggling preserves an active voice call and its captions", async ({
  page,
}) => {
  await start(page);
  const pending = (await currentDrill(page)).pendingCall;
  const attempts = (await stats(page.request)).attempts;
  await page.getByRole("button", { name: "收合來電視窗" }).click();
  await page.getByRole("button", { name: "收合側邊欄" }).click();
  expect((await currentDrill(page)).pendingCall).toEqual(pending);
  expect((await stats(page.request)).attempts).toBe(attempts);
  expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(0);
  await page.getByRole("button", { name: /查看來電/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator(".sidebar-toggle").evaluate((button) => button.focus());
  await expect(page.locator(".sidebar-toggle")).not.toBeFocused();
  await expect(page.locator(".sidebar-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "接聽" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await page.getByRole("button", { name: "展開側邊欄" }).click();
  await expect(page.locator(".voice-message.user > p")).toHaveText(
    "我想先瞭解情況。",
  );
  const before = await currentDrill(page);
  const connections = await stats(page.request);
  const permissions = await page.evaluate(() => window.voiceTest.permissions);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ["收合側邊欄", "展開側邊欄"]) {
      await page.getByRole("button", { name: label }).click();
      const media = await page.evaluate(() => ({
        captures: window.voiceTest.captures,
        outputs: window.voiceTest.outputs,
      }));
      await control(page.request, { action: "play" });
      await expect
        .poll(() =>
          page.evaluate(
            ({ captures, outputs }) =>
              window.voiceTest.captures > captures &&
              window.voiceTest.outputs > outputs,
            media,
          ),
        )
        .toBe(true);
      await expect(page.locator(".voice-message.persona > p")).toHaveText(
        "你好，請直接用語音和我聊聊。",
      );
      await expect(page.locator(".voice-message.user > p")).toHaveText(
        "我想先瞭解情況。",
      );
      const after = await currentDrill(page);
      expect(after.id).toBe(before.id);
      expect(after.currentCallId).toBe(before.currentCallId);
      expect(after.state).toBe("in_call");
      const current = await stats(page.request);
      expect(current.attempts).toBe(connections.attempts);
      expect(current.connections.at(-1)).toMatchObject({
        disconnected: false,
        greetings: connections.connections.at(-1).greetings,
      });
      expect(await page.evaluate(() => window.voiceTest.permissions)).toBe(
        permissions,
      );
      expect(
        await page.evaluate(() =>
          window.voiceTest.tracks.every((track) => track.readyState === "live"),
        ),
      ).toBe(true);
    }
  }
  await page.getByRole("button", { name: "掛斷本通" }).click();
  await released(page);
});

test("ATM drawer updates the drill balance and sends transfer and withdrawal evidence", async ({
  page,
}, testInfo) => {
  await start(page);
  await page.getByRole("button", { name: "接聽" }).click();
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
  await page.getByRole("button", { name: "接聽" }).click();
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
test("mutual farewell makes Judge hang up without a manual click", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "接聽" }).click();
  await expect(page.getByText("語音已連線，直接說話即可")).toBeVisible();
  await control(page.request, {
    action: "say",
    speaker: "persona",
    text: "好，那先這樣，感謝您的來電。",
  });
  await control(page.request, {
    action: "say",
    text: "拜拜",
  });
  await expect(page.locator(".report")).toBeVisible();
  await expect(page.locator(".call-end")).toHaveText("本通演練已結束");
  await released(page);
});
test("permission denial creates no provider; retry succeeds; reload releases voice without reacquiring", async ({
  page,
}) => {
  await start(page);
  const before = (await stats(page.request)).attempts;
  await page.evaluate(() => {
    window.savedAcquire = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((_resolve, reject) => {
        window.denyMicrophone = () =>
          reject(new DOMException("denied", "NotAllowedError"));
      });
  });
  await page.getByRole("button", { name: "接聽" }).click();
  await expect(page.locator(".incoming-call-status")).toHaveText(
    "正在準備麥克風…",
  );
  await expect(
    page.getByRole("button", { name: "接聽", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "拒接", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => window.denyMicrophone());
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "請允許權限",
  );
  expect((await stats(page.request)).attempts).toBe(before);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = window.savedAcquire;
  });
  await page.getByRole("button", { name: "接聽" }).click();
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
  await page.getByRole("button", { name: "接聽" }).click();
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
  await page.getByRole("button", { name: "接聽" }).click();
  await expect(page.locator(".call-end")).toHaveText("已達本通語音時間上限");
  await released(page);
  await control(page.request, { action: "duration", id, seconds: 180 });
  await expect(page.getByRole("button", { name: "接聽" })).toBeEnabled();
  await page.getByRole("button", { name: "接聽" }).click();
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
  await page.getByRole("button", { name: "接聽" }).click();
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

import {
  denseProfileHtml,
  liveLikeProfileHtml,
  metadataBackedProfileHtml,
  voyagerDashGraphqlProfilePayload,
  voyagerDashGraphqlSparseProfilePayload,
  voyagerDashProfilePayload,
  voyagerProfilePayload,
  voyagerSupplementalManyCoursesPayload,
  voyagerSupplementalManySkillsPayload,
  voyagerSupplementalSkillsPayload
} from "../../packages/fixtures/src";
import { SCHEMA_VERSION, type Profile } from "../../packages/core/src/schema";
import { defaultSettings } from "../../packages/core/src/settings";
import { expect, extensionPath, test } from "./extension-fixture";
import type { Frame, Page, Route } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const fullMetadataSettings = {
  ...defaultSettings,
  diagnostics: {
    ...defaultSettings.diagnostics,
    includeAllFields: true,
    includeProvenance: true,
    includeConfidence: true,
    verbose: true
  }
} as const;

const actionStatePollOptions = {
  intervals: [500, 1_000, 2_000, 5_000],
  timeout: 60_000
};

test("extension pages render and options persist locally", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Include all fields")).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const manifest = chrome.runtime.getManifest() as {
          action?: { default_popup?: string };
          browser_action?: { default_popup?: string };
          page_action?: { default_popup?: string };
        };
        return (
          manifest.action?.default_popup ??
          manifest.browser_action?.default_popup ??
          manifest.page_action?.default_popup
        );
      })
    )
    .toBe("popup.html");

  await page.getByLabel("Delivery").selectOption("clipboard");
  await page.getByLabel("Keep extracted profile locally").check();
  await page.getByLabel("Include provenance").check();
  await page.getByLabel("Include confidence").check();
  await page.getByLabel("Include all fields").check();
  await expect(page.getByLabel("Include provenance")).toBeChecked();
  await expect(page.getByLabel("Include provenance")).toBeEnabled();
  await expect(page.getByLabel("Include confidence")).toBeChecked();
  await expect(page.getByLabel("Include confidence")).toBeEnabled();
  await page.getByLabel("Include provenance").click();
  await page.getByLabel("Include confidence").click();
  await expect(page.getByLabel("Include provenance")).toBeChecked();
  await expect(page.getByLabel("Include confidence")).toBeChecked();
  await expect(page.getByLabel("Verbose diagnostics")).not.toBeChecked();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const stored = await chrome.storage.local.get("linkedin-profile-exporter.settings");
        return stored["linkedin-profile-exporter.settings"];
      })
    )
    .toMatchObject({
      deliveryMode: "clipboard",
      diagnostics: {
        includeAllFields: true,
        includeConfidence: false,
        includeProvenance: false,
        verbose: false
      },
      privacy: { persistExtractedData: true }
    });
  await page.reload();

  await expect(page.getByLabel("Delivery")).toHaveValue("clipboard");
  await expect(page.getByLabel("Keep extracted profile locally")).toBeChecked();
  await expect(page.getByLabel("Include all fields")).toBeChecked();
  await expect(page.getByLabel("Verbose diagnostics")).not.toBeChecked();

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Profile Exporter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  const deliveryModeGroup = page.getByRole("group", { name: "Delivery mode" });
  const clipboardDeliveryButton = deliveryModeGroup.getByRole("button", { name: "Clipboard" });
  const downloadDeliveryButton = deliveryModeGroup.getByRole("button", { name: "Download" });
  await expect(clipboardDeliveryButton).toBeVisible();
  await expect(clipboardDeliveryButton).toHaveAttribute("aria-pressed", "true");
  await expect(downloadDeliveryButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("footer").getByRole("button", { name: "Copy selected" })).toBeVisible();
  await expect(
    page.locator("footer").getByRole("button", { name: "Download selected" })
  ).toHaveCount(0);
  await downloadDeliveryButton.click();
  await expect(downloadDeliveryButton).toHaveAttribute("aria-pressed", "true");
  await expect(clipboardDeliveryButton).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.locator("footer").getByRole("button", { name: "Download selected" })
  ).toBeVisible();

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole("heading", { name: "Profile Exporter" })).toBeVisible();
  await expect(
    page.locator("footer").getByRole("button", { name: "Download selected" })
  ).toBeVisible();

  const sessionProfile = fixtureProfile();
  await page.evaluate(async (profile) => {
    await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
  }, sessionProfile);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
});

test("toolbar action activates on LinkedIn profile tabs", async ({ context, extensionWorker }) => {
  const fixtureUrl = "https://www.linkedin.com/in/action-state-fixture/";
  const feedUrl = "https://www.linkedin.com/feed/";
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1></main></body></html>`
    })
  );
  await page.route(feedUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>LinkedIn Feed</title><main>Feed</main>"
    })
  );

  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("toolbar fixture tab was not visible to the extension");

  await expect
    .poll(() => actionStateForTab(extensionWorker, tabId), actionStatePollOptions)
    .toMatchObject({
      badgeText: "IN",
      enabled: true,
      popup: expect.stringContaining("popup.html"),
      title: "Export this LinkedIn profile"
    });

  await page.goto(feedUrl, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await expect
    .poll(() => actionStateForTab(extensionWorker, tabId), actionStatePollOptions)
    .toMatchObject({
      badgeText: "",
      enabled: true,
      popup: expect.stringContaining("popup.html"),
      title: "Open a LinkedIn profile to export"
    });
});

test("popup auto-extracts a ready LinkedIn profile without an Extract click", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/popup-auto-extract/";
  const profilePage = await context.newPage();
  await profilePage.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replaceAll(
        "https://www.linkedin.com/in/alex-rivera-fixture/",
        fixtureUrl
      )
    })
  );
  await profilePage.goto(fixtureUrl);
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Profile Exporter" })).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  const stats = popup.locator('[aria-label="Profile stats"]');
  await expect(stats.locator("div")).toHaveCount(23);
  await expect(stats.getByText("Skills", { exact: true })).toBeVisible();
  await expect(stats.getByText("Diag", { exact: true })).toBeVisible();
  await expect(stats.getByText("Fmts", { exact: true })).toBeVisible();
  await expect
    .poll(() => storedSessionProfileSummary(popup))
    .toMatchObject({
      name: "Alex Rivera",
      workCount: 1
    });
  const cachedSummary = await storedSessionProfileSummary(popup);
  expect(cachedSummary?.capturedAt).toBeTruthy();
  await popup.getByRole("button", { name: /^Extract$/ }).click();
  await expect
    .poll(() => storedSessionProfileSummary(popup))
    .toMatchObject({
      name: "Alex Rivera",
      workCount: 1
    });
  const reusedSummary = await storedSessionProfileSummary(popup);
  expect(reusedSummary?.capturedAt).toBe(cachedSummary?.capturedAt);
});

test("popup reuses a same-page complete cache instead of auto-extracting again", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/popup-cache-reuse/";
  const cachedAt = "2020-01-01T12:00:00.000Z";
  const cachedProfile = {
    ...fixtureProfile(),
    identity: {
      ...fixtureProfile().identity,
      profileUrl: fixtureUrl
    },
    metadata: {
      ...fixtureProfile().metadata,
      capturedAt: cachedAt,
      sourceUrl: fixtureUrl
    }
  };

  const setupPage = await context.newPage();
  await setupPage.goto(`chrome-extension://${extensionId}/options.html`);
  await setupPage.evaluate(async (profile) => {
    await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
  }, cachedProfile);
  await setupPage.close();

  const profilePage = await context.newPage();
  await profilePage.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replaceAll(
        "https://www.linkedin.com/in/alex-rivera-fixture/",
        fixtureUrl
      )
    })
  );
  await profilePage.goto(fixtureUrl);
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  await expect
    .poll(() => storedSessionProfileSummary(popup), {
      intervals: [500, 1_000, 2_000],
      timeout: 5_000
    })
    .toMatchObject({
      capturedAt: cachedAt,
      name: "Alex Rivera",
      workCount: 0
    });
});

test("popup reuses a recent incomplete same-page cache instead of reopening recovery", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/popup-recent-incomplete-cache/";
  const cachedAt = new Date().toISOString();
  const skillsDetailsUrl = `${fixtureUrl}details/skills/`;
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/popup-recent-incomplete-cache/skillCategory";
  let detailRequests = 0;
  let skillCategoryRequests = 0;
  const cachedProfile = {
    ...fixtureProfile(),
    diagnostics: [
      {
        code: "coverage.budget.exhausted",
        level: "warning",
        message: "Recovery budget was exhausted.",
        source: "linkedin-voyager"
      },
      {
        code: "coverage.skills.capped",
        level: "warning",
        message: "Skills extraction returned exactly the known page cap.",
        source: "linkedin-voyager"
      }
    ],
    identity: {
      ...fixtureProfile().identity,
      profileUrl: fixtureUrl
    },
    metadata: {
      ...fixtureProfile().metadata,
      capturedAt: cachedAt,
      sourceUrl: fixtureUrl
    },
    skills: Array.from({ length: 20 }, (_, index) => ({
      name: `Cached Skill ${String(index + 1).padStart(3, "0")}`
    }))
  };

  const setupPage = await context.newPage();
  await setupPage.goto(`chrome-extension://${extensionId}/options.html`);
  await setupPage.evaluate(async (profile) => {
    await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
  }, cachedProfile);
  await setupPage.close();

  const profilePage = await context.newPage();
  await profilePage.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replaceAll(
        "https://www.linkedin.com/in/alex-rivera-fixture/",
        fixtureUrl
      )
    })
  );
  await profilePage.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManySkillsPayload)
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    detailRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedSkillsDetailHtml(fixtureUrl, 97)
    });
  });
  await profilePage.goto(fixtureUrl);
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  for (let index = 0; index < 2; index += 1) {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
    await expect
      .poll(() => storedSessionProfileSummary(popup), {
        intervals: [500, 1_000],
        timeout: 5_000
      })
      .toMatchObject({
        capturedAt: cachedAt,
        name: "Alex Rivera",
        skillsCount: 20
      });
    await popup.close();
  }

  expect(skillCategoryRequests).toBe(0);
  expect(detailRequests).toBe(0);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), skillsDetailsUrl))
          .length
    )
    .toBe(0);
});

test("popup manual extract reuses stale capped cache until explicit refresh", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const profileId = "alex-rivera-fixture";
  const skillCategoryUrl = `https://www.linkedin.com/voyager/api/identity/profiles/${profileId}/skillCategory`;
  const cachedAt = "2026-06-01T12:00:00.000Z";
  let skillCategoryRequests = 0;
  let skillPaginationRequests = 0;
  const cachedProfile = {
    ...fixtureProfile(),
    diagnostics: [
      {
        code: "coverage.skills.capped",
        level: "warning",
        message: "Skills extraction returned exactly the known page cap.",
        source: "linkedin-voyager"
      }
    ],
    identity: {
      ...fixtureProfile().identity,
      profileUrl: fixtureUrl
    },
    metadata: {
      ...fixtureProfile().metadata,
      capturedAt: cachedAt,
      sourceUrl: fixtureUrl
    },
    skills: Array.from({ length: 20 }, (_, index) => ({
      name: `Cached Skill ${String(index + 1).padStart(3, "0")}`
    }))
  };

  const setupPage = await context.newPage();
  await setupPage.goto(`chrome-extension://${extensionId}/options.html`);
  await setupPage.evaluate(async (profile) => {
    await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
  }, cachedProfile);
  await setupPage.close();

  const profilePage = await context.newPage();
  await profilePage.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml
        .replaceAll("https://www.linkedin.com/in/alex-rivera-fixture/", fixtureUrl)
        .replace(
          "</body>",
          [
            `<code id="bpr-guid-stale-cache-skills">`,
            escapeHtml(
              JSON.stringify(
                voyagerDashProfilePayloadWithPagedSections({ coursesTotal: 20, skillsTotal: 42 })
              )
            ),
            "</code></body>"
          ].join("")
        )
    })
  );
  await profilePage.route(`${skillCategoryUrl}**`, (route) => {
    const url = new URL(route.request().url());
    const start = url.searchParams.get("start");
    if (start) {
      skillPaginationRequests += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerPagedSkillsPayload(21, 42, undefined, 42, { pageCount: 22 }))
      });
    }
    skillCategoryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerPagedSkillsPayload(1, 42, undefined, 42, { pageCount: 42 }))
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await profilePage.goto(fixtureUrl);
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  await expect
    .poll(() => storedSessionProfileSummary(popup), {
      intervals: [500, 1_000, 2_000],
      timeout: 5_000
    })
    .toMatchObject({
      capturedAt: cachedAt,
      name: "Alex Rivera",
      skillsCount: 20,
      workCount: 0
    });
  expect(skillCategoryRequests).toBe(0);
  expect(skillPaginationRequests).toBe(0);

  await popup.getByRole("button", { name: /^Extract$/ }).click();
  await expect
    .poll(() => storedSessionProfileSummary(popup), {
      intervals: [500, 1_000, 2_000],
      timeout: 5_000
    })
    .toMatchObject({
      capturedAt: cachedAt,
      name: "Alex Rivera",
      skillsCount: 20,
      workCount: 0
    });
  expect(skillCategoryRequests).toBe(0);
  expect(skillPaginationRequests).toBe(0);

  await popup.getByRole("button", { name: "Refresh from LinkedIn" }).click();
  await expect.poll(() => skillCategoryRequests, { timeout: 5_000 }).toBe(1);
  await expect
    .poll(() => storedSessionProfileSummary(popup), {
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 45_000
    })
    .toMatchObject({
      name: "Alex Rivera",
      skillsCount: 42,
      workCount: 1
    });
  const refreshed = await storedSessionProfileSummary(popup);
  expect(refreshed?.capturedAt).toBeTruthy();
  expect(refreshed?.capturedAt).not.toBe(cachedAt);
  expect(skillCategoryRequests).toBe(1);
  expect(skillPaginationRequests).toBe(0);
});

test("popup recovers a pre-existing profile tab after extension reload", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/reload-recovery/";
  let profileRequests = 0;
  const profilePage = await context.newPage();
  await profilePage.route(fixtureUrl, (route) => {
    profileRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replaceAll(
        "https://www.linkedin.com/in/alex-rivera-fixture/",
        fixtureUrl
      )
    });
  });
  await profilePage.goto(fixtureUrl);
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  expect(profileRequests).toBe(1);

  const browser = context.browser();
  if (!browser) throw new Error("Extension reload test requires a browser-level CDP session");
  const cdpSession = await browser.newBrowserCDPSession();
  const reloadedExtension = (await cdpSession.send("Extensions.loadUnpacked", {
    path: extensionPath
  })) as { id?: string };
  await cdpSession.detach();
  const reloadedExtensionId = reloadedExtension.id ?? extensionId;
  await profilePage.bringToFront();
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const popup = await context.newPage();
  await expect
    .poll(
      async () => {
        try {
          await popup.goto(`chrome-extension://${reloadedExtensionId}/popup.html`, {
            waitUntil: "domcontentloaded",
            timeout: 2_000
          });
          return true;
        } catch {
          return false;
        }
      },
      { intervals: [500, 1_000, 2_000], timeout: 15_000 }
    )
    .toBe(true);
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  expect(profileRequests).toBe(1);
});

test("footer copy and download actions deliver the fresh profile", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const profilePage = await context.newPage();
  await profilePage.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replace(
        "</body>",
        [
          `<code id="bpr-guid-1">`,
          escapeHtml(JSON.stringify(voyagerDashProfilePayload)),
          "</code></body>"
        ].join("")
      )
    })
  );
  await profilePage.goto(fixtureUrl);
  await expect(profilePage.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const setupPage = await context.newPage();
  await setupPage.goto(`chrome-extension://${extensionId}/options.html`);
  await setupPage.evaluate(
    async (profile) => {
      await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
    },
    staleFixtureProfile(fixtureUrl, { incompleteSkills: true })
  );
  await setupPage.close();
  await profilePage.bringToFront();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Cached Snapshot" })).toBeVisible();
  await expect(popup.getByText("Ready", { exact: true })).toBeVisible();

  await captureClipboardWrites(popup);
  await popup.getByRole("button", { name: "Clipboard" }).click();
  await popup.locator("footer").getByRole("button", { name: "Copy selected" }).click();
  await expect
    .poll(() => storedSessionProfileSummary(popup), {
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 45_000
    })
    .toMatchObject({
      name: "Alex Rivera",
      coursesCount: 1,
      featuredCount: 1,
      patentsCount: 1,
      testScoresCount: 1,
      workCount: 1
    });
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  await expect
    .poll(() => clipboardProfileSummary(popup))
    .toMatchObject({
      name: "Alex Rivera",
      coursesCount: 1,
      featuredCount: 1,
      patentsCount: 1,
      testScoresCount: 1,
      workCount: 1
    });

  await popup.getByRole("button", { name: "Clear local profile" }).click();
  await expect
    .poll(() => storedSessionProfileSummary(popup), {
      intervals: [500, 1_000, 2_000, 5_000],
      timeout: 45_000
    })
    .toMatchObject({
      name: "Alex Rivera",
      coursesCount: 1,
      featuredCount: 1,
      patentsCount: 1,
      testScoresCount: 1,
      workCount: 1
    });
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  await installDownloadCapture(popup);
  await popup.getByRole("button", { name: "Download" }).click();
  await popup.locator("footer").getByRole("button", { name: "Download selected" }).click();
  await expect(popup.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  await expect
    .poll(() => storedSessionProfileSummary(popup))
    .toMatchObject({
      name: "Alex Rivera",
      coursesCount: 1,
      featuredCount: 1,
      patentsCount: 1,
      testScoresCount: 1,
      workCount: 1
    });
  await expect
    .poll(() => downloadedProfileSummary(popup))
    .toMatchObject({
      name: "Alex Rivera",
      coursesCount: 1,
      featuredCount: 1,
      patentsCount: 1,
      testScoresCount: 1,
      workCount: 1
    });
});

test("footer delivery uses a visible cached fallback when fresh extraction is unavailable", async ({
  context,
  extensionId
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(async (profile) => {
    await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
  }, staleFixtureProfile());
  await popup.reload();
  await expect(popup.getByRole("heading", { name: "Cached Snapshot" })).toBeVisible();

  await captureClipboardWrites(popup);
  await popup.getByRole("button", { name: "Clipboard" }).click();
  await popup.locator("footer").getByRole("button", { name: "Copy selected" }).click();

  await expect(
    popup.getByText("Using cached profile because fresh extraction failed")
  ).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Cached Snapshot" })).toBeVisible();
  await expect
    .poll(() => storedSessionProfileSummary(popup))
    .toMatchObject({
      name: "Cached Snapshot",
      coursesCount: 0,
      featuredCount: 0,
      patentsCount: 0,
      testScoresCount: 0,
      workCount: 0
    });
  await expect
    .poll(() => clipboardProfileSummary(popup))
    .toMatchObject({
      name: "Cached Snapshot",
      coursesCount: 0,
      featuredCount: 0,
      patentsCount: 0,
      testScoresCount: 0,
      workCount: 0
    });
});

test("content script reports readiness and extracts a fixture profile", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/e2e-extension/";
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replaceAll(
        "https://www.linkedin.com/in/alex-rivera-fixture/",
        fixtureUrl
      )
    })
  );
  await page.goto(fixtureUrl);
  await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);

  if (!tabId) throw new Error("fixture tab was not visible to the extension");

  const readiness = await sendTabMessage(extensionWorker, tabId, { type: "profile-readiness" });
  expect(readiness).toMatchObject({ ok: true, readiness: { state: "ready" } });

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: {
      ...defaultSettings,
      automationMode: "review-before-export" as const,
      deliveryMode: "clipboard" as const
    }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Alex Rivera", profileUrl: fixtureUrl },
      exportMetadata: { formats: ["json", "markdown"] }
    }
  });
  const profile = (extraction as { profile: Profile }).profile;
  expect(profile.diagnostics).toEqual([]);
  expect(profile.identity.provenance).toBeUndefined();
  expect(profile.identity.confidence).toBeUndefined();
});

test("content script prefers LinkedIn Voyager profile data when available", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  let staticDashRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) => {
    staticDashRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "stale static endpoint" })
    });
  });
  await page.route(
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/profileView",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerProfilePayload)
      })
  );
  await page.route(
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: {}, included: [] })
      })
  );
  await page.route(
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerSupplementalSkillsPayload)
      })
  );
  await page.route(
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/recommendations?q=received&recommendationStatuses=List(VISIBLE)",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: {}, included: [] })
      })
  );
  await context.addCookies([
    {
      domain: ".linkedin.com",
      name: "JSESSIONID",
      path: "/",
      value: "ajax:fixture"
    }
  ]);
  await page.goto(fixtureUrl);
  await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("voyager fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: {
        about:
          "I build local-first tools that turn messy browser workflows into structured, reviewable data."
      },
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }],
      education: [{ school: "Example University" }],
      skills: [{ name: "TypeScript" }, { name: "Browser Extensions" }]
    }
  });
  expect(staticDashRequests).toBe(1);
});

test("content script reuses observed LinkedIn Voyager Dash profile requests", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const observedGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:alex-rivera-fixture)&queryId=voyagerIdentityDashProfiles.memberIdentity";
  const observedDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles/urn%3Ali%3Afsd_profile%3Aalex-rivera-fixture?decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  let observedGraphqlRequests = 0;
  let observedDashRequests = 0;
  let coursesRequests = 0;
  let skillCategoryRequests = 0;
  let staticDashRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1></main></body></html>`
    })
  );
  await page.route(observedGraphqlUrl, (route) => {
    observedGraphqlRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashGraphqlSparseProfilePayload)
    });
  });
  await page.route(observedDashUrl, (route) => {
    observedDashRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    });
  });
  await page.route(coursesUrl, (route) => {
    coursesRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    });
  });
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManySkillsPayload)
    });
  });
  await page.route(staticDashUrl, (route) => {
    staticDashRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "stale decoration" })
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);
  await page.evaluate(
    async ([graphqlUrl, dashUrl]) => {
      await Promise.all(
        [graphqlUrl, dashUrl].map(async (url) => {
          const response = await fetch(url, { credentials: "include" });
          await response.text();
        })
      );
    },
    [observedGraphqlUrl, observedDashUrl]
  );

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("network-dash fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }],
      courses: expect.arrayContaining([
        expect.objectContaining({ name: "AUT-201 - Accessible Automation Systems" }),
        expect.objectContaining({ name: "CRS-028 - Course 028" })
      ]),
      skills: expect.arrayContaining([
        expect.objectContaining({ name: "TypeScript" }),
        expect.objectContaining({ name: "Skill 097" })
      ])
    }
  });
  expect((extraction as { profile: Profile }).profile.skills).toHaveLength(97);
  expect((extraction as { profile: Profile }).profile.courses).toHaveLength(28);
  expectExtractionDiagnostic(
    extraction,
    "linkedin-voyager.parsed",
    "linkedin-voyager.network.dashProfileUrn"
  );
  expect(observedGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(observedDashRequests).toBeGreaterThanOrEqual(2);
  expect(coursesRequests).toBe(1);
  expect(skillCategoryRequests).toBe(1);
  expect(staticDashRequests).toBe(0);
});

test("content script recovers full skills from the details page when skillCategory is gone", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillPaginationUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory?start=20";
  const skillsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/skills/";
  let coursesRequests = 0;
  let skillCategoryRequests = 0;
  let skillPaginationRequests = 0;
  let skillDetailsDocumentRequests = 0;
  let skillDetailsFetchRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 97 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    })
  );
  await page.route(coursesUrl, (route) => {
    coursesRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    });
  });
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ message: "gone" })
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    const recoveryRequest = isRecoveryDetailRequest(route.request().url());
    if (route.request().resourceType() !== "document" && !recoveryRequest) {
      skillDetailsFetchRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        headers: { "Cache-Control": "no-store" },
        body: [
          '<!doctype html><html><body><code id="bpr-guid-skills">',
          escapeHtml(JSON.stringify(voyagerPagedSkillsPayload(1, 20, skillPaginationUrl))),
          "</code></body></html>"
        ].join("")
      });
    }
    skillDetailsDocumentRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: [
        '<!doctype html><html><body><code id="bpr-guid-skills">',
        escapeHtml(JSON.stringify(voyagerPagedSkillsPayload(1, 20, skillPaginationUrl))),
        "</code></body></html>"
      ].join("")
    });
  });
  await page.route(skillPaginationUrl, (route) => {
    skillPaginationRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerPagedSkillsPayload(21, 97))
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  await captureExtractionStatuses(extensionPage);
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("skill details fallback fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } catch (error) {
    throw new Error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        openPages: context.pages().map((openPage) => openPage.url()),
        coursesRequests,
        skillCategoryRequests,
        skillDetailsDocumentRequests,
        skillDetailsFetchRequests,
        skillPaginationRequests,
        statuses: await extractionStatuses(extensionPage)
      })
    );
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(
    profile.skills,
    JSON.stringify({
      diagnostics: profile.diagnostics.map((diagnostic) => diagnostic.code),
      skillCategoryRequests,
      skillDetailsFetchRequests,
      skillDetailsDocumentRequests,
      skillPaginationRequests
    })
  ).toHaveLength(97);
  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      skills: expect.arrayContaining([
        expect.objectContaining({ name: "TypeScript" }),
        expect.objectContaining({ name: "Skill 097" })
      ])
    }
  });
  expectNoUnavailableCoverageForNonemptySections(profile);
  const diagnosticCodes = profile.diagnostics.map((diagnostic) => diagnostic.code);
  const requestSummary = JSON.stringify({
    diagnosticCodes,
    skillCategoryRequests,
    skillDetailsFetchRequests,
    skillDetailsDocumentRequests,
    skillPaginationRequests
  });
  expect(diagnosticCodes, requestSummary).toEqual(
    expect.arrayContaining(["coverage.skills.recovered", "linkedin-voyager.skills.recovered"])
  );
  expect(
    profile.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "linkedin-voyager.supplement.skill.failed" ||
        diagnostic.code === "coverage.skills.unavailable"
    )
  ).toBe(false);
  expect(coursesRequests, requestSummary).toBe(1);
  expect(skillCategoryRequests, requestSummary).toBe(1);
  expect(skillPaginationRequests, requestSummary).toBe(1);
  expect(skillDetailsFetchRequests, requestSummary).toBe(1);
  expect(skillDetailsDocumentRequests, requestSummary).toBe(0);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), skillsDetailsUrl))
          .length
    )
    .toBe(0);
});

test("content script derives the skill recovery target from the advertised count", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/skills/";
  let skillCategoryRequests = 0;
  let skillPaginationRequests = 0;
  const skillPaginationStarts: string[] = [];
  let skillDetailsRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 42 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections({ skillsTotal: 42 }))
    })
  );
  await page.route(`${skillCategoryUrl}**`, (route) => {
    const url = new URL(route.request().url());
    const start = url.searchParams.get("start");
    if (start) {
      skillPaginationRequests += 1;
      skillPaginationStarts.push(start);
      if (start !== "20") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(voyagerPagedSkillsPayload(43, 42, undefined, 42, { pageCount: 0 }))
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerPagedSkillsPayload(21, 42, undefined, 42, { pageCount: 22 }))
      });
    }
    skillCategoryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerPagedSkillsPayload(1, 20, undefined, 42, { pageCount: 20 }))
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    skillDetailsRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<!doctype html><html><body>detail fallback should not be needed</body></html>"
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("non-97 skills fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(
    profile.skills,
    JSON.stringify({
      diagnosticCodes: profile.diagnostics.map((diagnostic) => diagnostic.code),
      skillCategoryRequests,
      skillDetailsRequests,
      skillPaginationRequests,
      skillPaginationStarts
    })
  ).toHaveLength(42);
  expect(profile.skills).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Skill 042" })])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.skills.recovered", "coverage.skills.complete"])
  );
  expectNoDiagnosticCodes(profile, ["coverage.skills.capped", "coverage.skills.unavailable"]);
  const requestSummary = JSON.stringify({
    skillCategoryRequests,
    skillDetailsRequests,
    skillPaginationRequests,
    skillPaginationStarts
  });
  expect(skillCategoryRequests, requestSummary).toBe(1);
  expect(skillPaginationRequests, requestSummary).toBe(1);
  expect(skillPaginationStarts, requestSummary).toEqual(["20"]);
  expect(skillDetailsRequests, requestSummary).toBe(0);
});

test("content script does not count skill category containers as recovered skills", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillPaginationUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory?start=96";
  let skillCategoryRequests = 0;
  let skillPaginationRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 97 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections({ skillsTotal: 97 }))
    })
  );
  await page.route(`${skillCategoryUrl}**`, (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("start")) {
      skillPaginationRequests += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerPagedSkillsPayload(97, 97, undefined, 97, { pageCount: 1 }))
      });
    }
    skillCategoryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        voyagerPagedSkillsPayload(1, 96, skillPaginationUrl, 97, { pageCount: 96 })
      )
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("skill category container fixture tab was not visible");

  try {
    const extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
    const profile = (extraction as { profile: Profile }).profile;
    expect(profile.skills).toHaveLength(97);
    expect(profile.skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Skill 097" })])
    );
    expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["coverage.skills.complete"])
    );
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  expect(skillCategoryRequests).toBe(1);
  expect(skillPaginationRequests).toBe(1);
});

test("content script recovers rendered detail rows when embedded detail payloads are absent", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/skills/";
  let skillCategoryRequests = 0;
  let skillDetailsFetchRequests = 0;
  let skillDetailsFrameRequests = 0;
  let skillDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 97 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    })
  );
  await page.route(coursesUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    })
  );
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ message: "gone" })
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    const recoveryRequest = isRecoveryDetailRequest(route.request().url());
    if (route.request().resourceType() !== "document" && !recoveryRequest) {
      skillDetailsFetchRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedSkillsDetailHtml(fixtureUrl, 97)
      });
    }

    if (recoveryRequest) {
      const frame = safeRequestFrame(route);
      if (frame && !detailUrlMatches(frame.url(), skillsDetailsUrl)) {
        return route.fulfill({
          status: 404,
          contentType: "text/html",
          body: "<!doctype html><html><body>same-page cache-busted detail fetch unavailable</body></html>"
        });
      }
      skillDetailsTabRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedSkillsDetailHtml(fixtureUrl, 97)
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      skillDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedSkillsDetailHtml(fixtureUrl, 97)
      });
    }

    skillDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedSkillsDetailHtml(fixtureUrl, 97)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("rendered skill detail fixture tab was not visible");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });
  const profile = (extraction as { profile: Profile }).profile;

  expect(
    profile.skills,
    JSON.stringify({
      diagnostics: profile.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message
      })),
      skillCategoryRequests,
      skillDetailsFetchRequests,
      skillDetailsFrameRequests,
      skillDetailsTabRequests
    })
  ).toHaveLength(97);
  expect(profile.skills).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "TypeScript", endorsements: 12 }),
      expect.objectContaining({ name: "Skill 097" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.skills.recovered", "coverage.skills.complete"])
  );
  expectNoDiagnosticCodes(profile, [
    "coverage.skills.capped",
    "coverage.skills.unavailable",
    "linkedin-voyager.skills.partial",
    "linkedin-voyager.skills.possibly-capped"
  ]);
  expect(skillCategoryRequests).toBe(1);
  expect(skillDetailsFetchRequests).toBeGreaterThanOrEqual(1);
  expect(skillDetailsFrameRequests).toBe(0);
  expect(skillDetailsTabRequests).toBe(0);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), skillsDetailsUrl))
          .length
    )
    .toBe(0);
});

test("content script uses a temporary inactive detail tab when same-page detail recovery is blocked", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/skills/";
  let skillCategoryRequests = 0;
  let skillDetailsFetchRequests = 0;
  let skillDetailsFrameRequests = 0;
  let skillDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 97 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    })
  );
  await page.route(coursesUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    })
  );
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ message: "gone" })
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    if (route.request().resourceType() !== "document") {
      skillDetailsFetchRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      skillDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body>iframe detail render blocked</body></html>"
      });
    }

    skillDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedSkillsDetailHtml(fixtureUrl, 97)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("inactive detail tab fallback fixture profile tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } catch (error) {
    throw new Error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        openPages: context.pages().map((openPage) => openPage.url()),
        skillCategoryRequests,
        skillDetailsFetchRequests,
        skillDetailsFrameRequests,
        skillDetailsTabRequests
      })
    );
  }
  await extensionPage.close();
  const profile = (extraction as { profile: Profile }).profile;

  expect(
    profile.skills,
    JSON.stringify({
      diagnostics: profile.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message
      })),
      skillCategoryRequests,
      skillDetailsFetchRequests,
      skillDetailsFrameRequests,
      skillDetailsTabRequests
    })
  ).toHaveLength(97);
  expect(profile.skills).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "TypeScript", endorsements: 12 }),
      expect.objectContaining({ name: "Skill 097" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.skills.recovered", "coverage.skills.complete"])
  );
  expect(skillCategoryRequests).toBe(1);
  expect(skillDetailsFetchRequests).toBeGreaterThanOrEqual(1);
  expect(skillDetailsTabRequests).toBeGreaterThanOrEqual(1);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), skillsDetailsUrl))
          .length
    )
    .toBe(0);
});

test("content script recovers rendered skills from same-page detail HTML when iframe recovery is blocked", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/skills/";
  let skillCategoryRequests = 0;
  let skillDetailsFetchRequests = 0;
  let skillDetailsFrameRequests = 0;
  let skillDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 97 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    })
  );
  await page.route(coursesUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    })
  );
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ message: "gone" })
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    const recoveryRequest = isRecoveryDetailRequest(route.request().url());
    if (route.request().resourceType() !== "document" && !recoveryRequest) {
      skillDetailsFetchRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedSkillsDetailHtml(fixtureUrl, 97)
      });
    }

    if (recoveryRequest) {
      skillDetailsTabRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedSkillsDetailHtml(fixtureUrl, 97)
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      skillDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body>iframe detail render blocked</body></html>"
      });
    }

    skillDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedSkillsDetailHtml(fixtureUrl, 97)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("inactive detail tab fixture profile tab was not visible");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });
  const profile = (extraction as { profile: Profile }).profile;

  expect(profile.skills).toHaveLength(97);
  expect(profile.skills).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "TypeScript", endorsements: 12 }),
      expect.objectContaining({ name: "Skill 097" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.skills.recovered", "coverage.skills.complete"])
  );
  expectNoDiagnosticCodes(profile, ["coverage.skills.capped", "coverage.skills.unavailable"]);
  expect(skillCategoryRequests).toBe(1);
  expect(skillDetailsFetchRequests).toBe(1);
  expect(skillDetailsFrameRequests).toBe(0);
  expect(skillDetailsTabRequests).toBe(0);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), skillsDetailsUrl))
          .length
    )
    .toBe(0);
});

test("content script reuses observed same-profile section Voyager requests before fallbacks", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const observedSkillsUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:alex-rivera-fixture)&queryId=voyagerIdentityDashProfileComponents.opaque";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const skillsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/skills/";
  let observedSkillsRequests = 0;
  let coursesRequests = 0;
  let skillCategoryRequests = 0;
  let skillDetailsRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/skills/">Show all 97 skills</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    })
  );
  await page.route("https://www.linkedin.com/voyager/api/graphql**", (route) => {
    const url = route.request().url();
    if (!url.includes("queryId=voyagerIdentityDashProfileComponents.opaque")) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "unexpected graphql" })
      });
    }
    observedSkillsRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManySkillsPayload)
    });
  });
  await page.route(coursesUrl, (route) => {
    coursesRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    });
  });
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ message: "gone" })
    });
  });
  await context.route(detailUrlPattern(skillsDetailsUrl), (route) => {
    skillDetailsRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<!doctype html><html><body>detail fallback should not be needed</body></html>"
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);
  await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    await response.text();
  }, observedSkillsUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("observed section fixture tab was not visible");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });
  const profile = (extraction as { profile: Profile }).profile;

  expect(profile.skills).toHaveLength(97);
  expect(profile.skills).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "TypeScript" }),
      expect.objectContaining({ name: "Skill 097" })
    ])
  );
  expect(profile.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "coverage.skills.recovered",
        message: expect.stringContaining("observed data")
      })
    ])
  );
  expect(observedSkillsRequests).toBeGreaterThanOrEqual(2);
  expect(coursesRequests).toBe(1);
  expect(skillCategoryRequests).toBe(0);
  expect(skillDetailsRequests).toBe(0);
});

test("content script ignores count-only course metadata and recovers rendered detail rows", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const coursesDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/courses/";
  let coursesRequests = 0;
  let courseDetailsFetchRequests = 0;
  let courseDetailsRecoveryFetchRequests = 0;
  let courseDetailsFrameRequests = 0;
  let courseDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/courses/">Show all 28 courses</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    })
  );
  await page.route(coursesUrl, (route) => {
    coursesRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        included: [
          {
            $recipeTypes: [
              "com.linkedin.voyager.dash.deco.identity.profile.FullProfileCoursesInjection"
            ],
            $type: "com.linkedin.restli.common.CollectionResponse",
            entityUrn: "urn:li:collection:profile-courses",
            paging: { count: 28, links: [], start: 0, total: 28 }
          }
        ]
      })
    });
  });
  await page.route(skillCategoryUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManySkillsPayload)
    })
  );
  await context.route(detailUrlPattern(coursesDetailsUrl), (route) => {
    const recoveryRequest = isRecoveryDetailRequest(route.request().url());
    if (route.request().resourceType() !== "document" && !recoveryRequest) {
      courseDetailsFetchRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
      });
    }

    if (recoveryRequest && route.request().resourceType() !== "document") {
      courseDetailsRecoveryFetchRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedCoursesDetailHtml(fixtureUrl, 28)
      });
    }

    if (recoveryRequest) {
      courseDetailsTabRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedCoursesDetailHtml(fixtureUrl, 28)
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      courseDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedCoursesDetailHtml(fixtureUrl, 28)
      });
    }

    courseDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedCoursesDetailHtml(fixtureUrl, 28)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("rendered course detail fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(profile.courses).toHaveLength(28);
  expect(profile.courses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        number: "AUT-201",
        provider: "Example University"
      }),
      expect.objectContaining({ number: "CRS-028" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.courses.recovered", "coverage.courses.complete"])
  );
  expectNoDiagnosticCodes(profile, ["coverage.courses.capped", "coverage.courses.unavailable"]);
  expect(coursesRequests).toBe(1);
  expect(courseDetailsFetchRequests).toBe(1);
  expect(courseDetailsRecoveryFetchRequests).toBe(0);
  expect(courseDetailsFrameRequests + courseDetailsTabRequests).toBeGreaterThanOrEqual(1);
  expect(courseDetailsTabRequests).toBeLessThanOrEqual(1);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), coursesDetailsUrl))
          .length
    )
    .toBe(0);
});

test("content script recovers rendered interest detail rows when the base payload omits interests", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const interestsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/interests/";
  let interestDetailsFetchRequests = 0;
  let interestDetailsFrameRequests = 0;
  let interestDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/interests/">Show all 3 interests</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profilePayloadWithoutInterests(voyagerDashProfilePayload))
    })
  );
  await context.route(interestsDetailsUrl, (route) => {
    if (route.request().resourceType() !== "document") {
      interestDetailsFetchRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      interestDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedInterestsDetailHtml(fixtureUrl)
      });
    }

    interestDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedInterestsDetailHtml(fixtureUrl)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("rendered interest detail fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(profile.interests).toHaveLength(3);
  expect(profile.interests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Local-first software",
        url: "https://www.linkedin.com/company/local-first/"
      }),
      expect.objectContaining({ name: "Browser Automation" }),
      expect.objectContaining({ name: "Privacy Engineering" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.interests.recovered", "coverage.interests.complete"])
  );
  expectNoDiagnosticCodes(profile, ["coverage.interests.unavailable"]);
  expect(interestDetailsFetchRequests).toBe(1);
  expect(interestDetailsFrameRequests + interestDetailsTabRequests).toBeGreaterThanOrEqual(1);
  expect(interestDetailsTabRequests).toBeLessThanOrEqual(1);
  await expect
    .poll(() => context.pages().filter((openPage) => openPage.url() === interestsDetailsUrl).length)
    .toBe(0);
});

test("content script recovers rendered project and featured detail rows when base payload omits them", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const projectsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/projects/";
  const featuredDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/featured/";
  let projectDetailsFetchRequests = 0;
  let projectDetailsFrameRequests = 0;
  let projectDetailsTabRequests = 0;
  let featuredDetailsFetchRequests = 0;
  let featuredDetailsFrameRequests = 0;
  let featuredDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/projects/">Show all 3 projects</a><a href="/in/alex-rivera-fixture/details/featured/">Show all 3 featured items</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profilePayloadWithoutProjectsAndFeatured(voyagerDashProfilePayload))
    })
  );
  await context.route(detailUrlPattern(projectsDetailsUrl), (route) => {
    if (route.request().resourceType() !== "document") {
      projectDetailsFetchRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      projectDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedProjectsDetailHtml(fixtureUrl)
      });
    }

    projectDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedProjectsDetailHtml(fixtureUrl)
    });
  });
  await context.route(featuredDetailsUrl, (route) => {
    if (route.request().resourceType() !== "document") {
      featuredDetailsFetchRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      featuredDetailsFrameRequests += 1;
      return route.fulfill({
        contentType: "text/html",
        body: renderedFeaturedDetailHtml(fixtureUrl)
      });
    }

    featuredDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedFeaturedDetailHtml(fixtureUrl)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("rendered project/featured detail fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(
    profile.projects,
    JSON.stringify({
      diagnostics: profile.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        source: diagnostic.source
      })),
      projectDetailsFetchRequests,
      projectDetailsFrameRequests,
      projectDetailsTabRequests
    })
  ).toHaveLength(3);
  expect(profile.projects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: "Open-source browser export workflow.",
        name: "Local Export Toolkit",
        url: "https://example.test/local-export"
      }),
      expect.objectContaining({ name: "Privacy Report Builder" }),
      expect.objectContaining({ name: "Data Review Console" })
    ])
  );
  expect(profile.featured).toHaveLength(3);
  expect(profile.featured).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: "A walkthrough for privacy-first extraction.",
        title: "Privacy-first extension demo",
        url: "https://example.test/privacy-demo"
      }),
      expect.objectContaining({ title: "Local Export README" }),
      expect.objectContaining({ title: "Data Review Dashboard" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.projects.recovered", "coverage.featured.recovered"])
  );
  expectNoDiagnosticCodes(profile, [
    "coverage.projects.unavailable",
    "coverage.featured.unavailable"
  ]);
  expect(projectDetailsFetchRequests).toBe(1);
  expect(projectDetailsFrameRequests + projectDetailsTabRequests).toBeGreaterThanOrEqual(1);
  expect(projectDetailsTabRequests).toBeLessThanOrEqual(1);
  expect(featuredDetailsFetchRequests).toBe(1);
  expect(featuredDetailsFrameRequests + featuredDetailsTabRequests).toBeGreaterThanOrEqual(1);
  expect(featuredDetailsTabRequests).toBeLessThanOrEqual(1);
  await expect
    .poll(
      () =>
        context
          .pages()
          .filter(
            (openPage) =>
              openPage.url() === projectsDetailsUrl || openPage.url() === featuredDetailsUrl
          ).length
    )
    .toBe(0);
});

test("content script uses inactive detail tabs for non-skill sections when iframe recovery is blocked", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const projectsDetailsUrl = "https://www.linkedin.com/in/alex-rivera-fixture/details/projects/";
  let projectDetailsFetchRequests = 0;
  let projectDetailsFrameRequests = 0;
  let projectDetailsTabRequests = 0;

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><a href="/in/alex-rivera-fixture/details/projects/">Show all 3 projects</a></main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profilePayloadWithoutProjectsAndFeatured(voyagerDashProfilePayload))
    })
  );
  await context.route(projectsDetailsUrl, (route) => {
    if (route.request().resourceType() !== "document") {
      projectDetailsFetchRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
      });
    }

    const frame = safeRequestFrame(route);
    if (frame?.parentFrame()) {
      projectDetailsFrameRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><body>iframe detail render blocked</body></html>"
      });
    }

    projectDetailsTabRequests += 1;
    return route.fulfill({
      contentType: "text/html",
      body: renderedProjectsDetailHtml(fixtureUrl)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("non-skill inactive detail tab fixture profile tab was not visible");
  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } catch (error) {
    throw new Error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        openPages: context.pages().map((openPage) => openPage.url()),
        projectDetailsFetchRequests,
        projectDetailsFrameRequests,
        projectDetailsTabRequests
      })
    );
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(
    profile.projects,
    JSON.stringify({
      diagnostics: profile.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        source: diagnostic.source
      })),
      projectDetailsFetchRequests,
      projectDetailsFrameRequests,
      projectDetailsTabRequests
    })
  ).toHaveLength(3);
  expect(profile.projects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: "Open-source browser export workflow.",
        name: "Local Export Toolkit",
        url: "https://example.test/local-export"
      }),
      expect.objectContaining({ name: "Privacy Report Builder" }),
      expect.objectContaining({ name: "Data Review Console" })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining(["coverage.projects.recovered", "coverage.projects.complete"])
  );
  expectNoDiagnosticCodes(profile, ["coverage.projects.unavailable"]);
  expect(projectDetailsFetchRequests).toBe(1);
  expect(projectDetailsTabRequests).toBeGreaterThanOrEqual(1);
  await expect
    .poll(
      () =>
        context.pages().filter((openPage) => detailUrlMatches(openPage.url(), projectsDetailsUrl))
          .length
    )
    .toBe(0);
});

test("content script recovers broad rendered detail sections when base payload omits them", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const detailFixtures = [
    {
      key: "certifications",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/certifications/",
      html: renderedCertificationDetailHtml(fixtureUrl)
    },
    {
      key: "publications",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/publications/",
      html: renderedPublicationDetailHtml(fixtureUrl)
    },
    {
      key: "volunteering",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/volunteering-experiences/",
      html: renderedVolunteeringDetailHtml(fixtureUrl)
    },
    {
      key: "honors",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/honors/",
      html: renderedHonorDetailHtml(fixtureUrl)
    },
    {
      key: "test-scores",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/test-scores/",
      html: renderedTestScoreDetailHtml(fixtureUrl)
    },
    {
      key: "patents",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/patents/",
      html: renderedPatentDetailHtml(fixtureUrl)
    },
    {
      key: "languages",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/languages/",
      html: renderedLanguageDetailHtml(fixtureUrl)
    },
    {
      key: "organizations",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/organizations/",
      html: renderedOrganizationDetailHtml(fixtureUrl)
    }
  ];
  const requests = new Map<string, { fetch: number; frame: number; tab: number }>();

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1>${detailFixtures
        .map(
          (fixture) => `<a href="${new URL(fixture.url).pathname}">Show all 1 ${fixture.key}</a>`
        )
        .join("")}</main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profilePayloadWithoutBroadDetailSections(voyagerDashProfilePayload))
    })
  );
  for (const detail of detailFixtures) {
    requests.set(detail.key, { fetch: 0, frame: 0, tab: 0 });
    await context.route(detail.url, (route) => {
      const counts = requests.get(detail.key);
      if (!counts) throw new Error(`Missing request counts for ${detail.key}`);
      if (route.request().resourceType() !== "document") {
        counts.fetch += 1;
        return route.fulfill({
          status: 404,
          contentType: "text/html",
          body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
        });
      }

      const frame = safeRequestFrame(route);
      if (frame?.parentFrame()) {
        counts.frame += 1;
        return route.fulfill({
          contentType: "text/html",
          body: detail.html
        });
      }

      counts.tab += 1;
      return route.fulfill({
        contentType: "text/html",
        body: detail.html
      });
    });
  }
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("broad rendered detail fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(profile.licensesCertifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        credentialId: "CERT-123",
        issuer: "Example Standards Institute",
        name: "Privacy Engineering Certificate"
      })
    ])
  );
  expect(profile.publications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authors: ["Alex Rivera", "Sam Lee"],
        name: "Practical Provenance for Browser Data",
        publisher: "Example Journal"
      })
    ])
  );
  expect(profile.volunteering).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        organization: "Local Tech Fellows",
        role: "Mentor"
      })
    ])
  );
  expect(profile.honorsAwards).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        issuer: "Northstar Labs",
        title: "Data Quality Leadership Award"
      })
    ])
  );
  expect(profile.testScores).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "GRE", score: "168" })])
  );
  expect(profile.patents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        patentNumber: "US-123",
        title: "Local Export Verification System"
      })
    ])
  );
  expect(profile.languages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fluency: "Native or bilingual", language: "English" })
    ])
  );
  expect(profile.organizations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Local Data Guild",
        role: "Member"
      })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining([
      "coverage.licensesCertifications.recovered",
      "coverage.publications.recovered",
      "coverage.volunteering.recovered",
      "coverage.honorsAwards.recovered",
      "coverage.testScores.recovered",
      "coverage.patents.recovered",
      "coverage.languages.recovered",
      "coverage.organizations.recovered"
    ])
  );
  for (const counts of requests.values()) {
    expect(counts.fetch).toBe(1);
    expect(counts.frame + counts.tab).toBeGreaterThanOrEqual(1);
    expect(counts.tab).toBeLessThanOrEqual(1);
  }
});

test("content script recovers rendered core detail sections when base payload omits them", async ({
  context,
  extensionId
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  const detailFixtures = [
    {
      key: "experience",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/experience/",
      html: renderedWorkDetailHtml(fixtureUrl)
    },
    {
      key: "education",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/education/",
      html: renderedEducationDetailHtml(fixtureUrl)
    },
    {
      key: "recommendations",
      url: "https://www.linkedin.com/in/alex-rivera-fixture/details/recommendations/",
      html: renderedRecommendationsDetailHtml(fixtureUrl)
    }
  ];
  const requests = new Map<string, { fetch: number; frame: number; tab: number }>();

  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1>${detailFixtures
        .map(
          (fixture) =>
            `<a href="${new URL(fixture.url).pathname}">Show all ${fixture.key === "recommendations" ? 1 : 2} ${fixture.key}</a>`
        )
        .join("")}</main></body></html>`
    })
  );
  await page.route(staticDashUrl, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(profilePayloadWithoutCoreDetailSections(voyagerDashProfilePayload))
    })
  );
  for (const detail of detailFixtures) {
    requests.set(detail.key, { fetch: 0, frame: 0, tab: 0 });
    await context.route(detail.url, (route) => {
      const counts = requests.get(detail.key);
      if (!counts) throw new Error(`Missing request counts for ${detail.key}`);
      if (route.request().resourceType() !== "document") {
        counts.fetch += 1;
        return route.fulfill({
          status: 404,
          contentType: "text/html",
          body: "<!doctype html><html><body>same-page detail fetch unavailable</body></html>"
        });
      }

      const frame = safeRequestFrame(route);
      if (frame?.parentFrame()) {
        counts.frame += 1;
        return route.fulfill({
          contentType: "text/html",
          body: detail.html
        });
      }

      counts.tab += 1;
      return route.fulfill({
        contentType: "text/html",
        body: detail.html
      });
    });
  }
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`, {
    timeout: 15_000,
    waitUntil: "domcontentloaded"
  });
  const tabId = await tabIdForUrlFromPage(extensionPage, fixtureUrl);
  if (!tabId) throw new Error("core rendered detail fixture tab was not visible");

  let extraction: unknown;
  try {
    extraction = await sendTabMessageFromPage(extensionPage, tabId, {
      type: "extract-profile",
      settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
    });
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
  const profile = (extraction as { profile: Profile }).profile;

  expect(profile.work).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        company: "Northstar Labs",
        title: "Director of Engineering"
      }),
      expect.objectContaining({
        company: "Example Systems",
        title: "Staff Engineer"
      })
    ])
  );
  expect(profile.education).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        degree: "BS",
        field: "Computer Science",
        school: "Example University"
      }),
      expect.objectContaining({
        school: "Local Community College"
      })
    ])
  );
  expect(profile.recommendations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Dana Kim",
        relationship: "Product partner at Northstar Labs",
        text: "Alex consistently turned messy browser workflows into reliable local data products."
      })
    ])
  );
  expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
    expect.arrayContaining([
      "coverage.work.recovered",
      "coverage.education.recovered",
      "coverage.recommendations.recovered"
    ])
  );
  for (const counts of requests.values()) {
    expect(counts.fetch).toBe(1);
    expect(counts.frame + counts.tab).toBeGreaterThanOrEqual(1);
    expect(counts.tab).toBeLessThanOrEqual(1);
  }
});

test("content script reuses observed LinkedIn Voyager GraphQL profile requests", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const sparseGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(profileUrn:urn%3Ali%3Afsd_profile%3Aalex-rivera-fixture)&queryId=voyagerIdentityDashProfiles.short";
  const fullGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(profileUrn:urn%3Ali%3Afsd_profile%3Aalex-rivera-fixture)&queryId=voyagerIdentityDashProfiles.full";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  let sparseGraphqlRequests = 0;
  let fullGraphqlRequests = 0;
  let staticDashRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1></main></body></html>`
    })
  );
  await page.route(sparseGraphqlUrl, (route) => {
    sparseGraphqlRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...voyagerDashGraphqlSparseProfilePayload,
        meta: { padding: "x".repeat(200_000) }
      })
    });
  });
  await page.route(fullGraphqlUrl, (route) => {
    fullGraphqlRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashGraphqlProfilePayload)
    });
  });
  await page.route(staticDashUrl, (route) => {
    staticDashRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "stale static endpoint" })
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);
  await page.evaluate(
    async ([sparseUrl, fullUrl]) => {
      await Promise.all(
        [sparseUrl, fullUrl].map(async (url) => {
          const response = await fetch(url, { credentials: "include" });
          await response.text();
        })
      );
    },
    [sparseGraphqlUrl, fullGraphqlUrl]
  );

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("graphql-dash fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: {
      ...defaultSettings,
      automationMode: "review-before-export" as const,
      diagnostics: { ...defaultSettings.diagnostics, verbose: true }
    }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }],
      education: [{ school: "Example University" }],
      courses: [{ name: "AUT-201 - Accessible Automation Systems" }],
      featured: [{ title: "Privacy-first extension demo" }],
      testScores: [{ name: "GRE Quantitative Reasoning" }],
      patents: [{ title: "Local Browser Export Workflow" }],
      organizations: [{ name: "Browser Tools Guild" }],
      interests: [{ name: "Local-first software" }]
    }
  });
  const profile = (extraction as { profile: Profile }).profile;
  expect(profile.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "linkedin-voyager.parsed",
        source: "linkedin-voyager.network.identityDashProfiles"
      }),
      expect.objectContaining({
        code: "linkedin-voyager.inventory.sections",
        source: "linkedin-voyager.network.identityDashProfiles"
      }),
      expect.objectContaining({
        code: "linkedin-voyager.inventory.toc",
        source: "linkedin-voyager.network.identityDashProfiles"
      }),
      expect.objectContaining({
        code: "linkedin-voyager.inventory.entities",
        source: "linkedin-voyager.network.identityDashProfiles"
      }),
      expect.objectContaining({
        code: "linkedin-voyager.inventory.fields",
        source: "linkedin-voyager.network.identityDashProfiles"
      })
    ])
  );
  const sectionsMessage = profile.diagnostics.find(
    (diagnostic) => diagnostic.code === "linkedin-voyager.inventory.sections"
  )?.message;
  expect(sectionsMessage).toContain('"workPositionGroups":1');
  expect(sectionsMessage).toContain('"courses":1');
  expect(sectionsMessage).toContain('"testScores":1');
  expect(sectionsMessage).toContain('"patents":1');
  expect(
    profile.diagnostics.find((diagnostic) => diagnostic.code === "linkedin-voyager.inventory.toc")
      ?.message
  ).toContain('"identityDashProfilesByMemberIdentity":1');
  expect(sparseGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(fullGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(staticDashRequests).toBe(0);
});

test("content script ignores unrelated observed LinkedIn Voyager requests before static fallback", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const unrelatedGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:unrelated-profile)&queryId=voyagerIdentityDashProfiles.memberIdentity";
  const unrelatedDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles/urn%3Ali%3Afsd_profile%3Aunrelated-profile?decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  let unrelatedGraphqlRequests = 0;
  let unrelatedDashRequests = 0;
  let coursesRequests = 0;
  let skillCategoryRequests = 0;
  let staticDashRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1></main></body></html>`
    })
  );
  await page.route(unrelatedGraphqlUrl, (route) => {
    unrelatedGraphqlRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...voyagerDashGraphqlSparseProfilePayload,
        included: []
      })
    });
  });
  await page.route(unrelatedDashUrl, (route) => {
    unrelatedDashRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: {}, included: [] })
    });
  });
  await page.route(staticDashUrl, (route) => {
    staticDashRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerDashProfilePayloadWithPagedSections())
    });
  });
  await page.route(coursesUrl, (route) => {
    coursesRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
    });
  });
  await page.route(skillCategoryUrl, (route) => {
    skillCategoryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(voyagerSupplementalManySkillsPayload)
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);
  await page.evaluate(
    async ([graphqlUrl, dashUrl]) => {
      await Promise.all(
        [graphqlUrl, dashUrl].map(async (url) => {
          const response = await fetch(url, { credentials: "include" });
          await response.text();
        })
      );
    },
    [unrelatedGraphqlUrl, unrelatedDashUrl]
  );

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("unrelated observed fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }],
      courses: expect.arrayContaining([
        expect.objectContaining({ name: "AUT-201 - Accessible Automation Systems" }),
        expect.objectContaining({ name: "CRS-028 - Course 028" })
      ]),
      skills: expect.arrayContaining([
        expect.objectContaining({ name: "TypeScript" }),
        expect.objectContaining({ name: "Skill 097" })
      ])
    }
  });
  expect((extraction as { profile: Profile }).profile.skills).toHaveLength(97);
  expect((extraction as { profile: Profile }).profile.courses).toHaveLength(28);
  expectExtractionDiagnostic(
    extraction,
    "linkedin-voyager.parsed",
    "linkedin-voyager.dashFullProfileWithEntities"
  );
  expect(unrelatedGraphqlRequests).toBe(1);
  expect(unrelatedDashRequests).toBe(1);
  expect(coursesRequests).toBe(1);
  expect(skillCategoryRequests).toBe(1);
  expect(staticDashRequests).toBe(1);
});

test("content script accepts memberIdentity GraphQL when referenced identity follows unrelated included identities", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const unrelatedGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:ACoAunrelated)&queryId=voyagerIdentityDashProfiles.memberIdentity";
  const validGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:alex-rivera-fixture)&queryId=voyagerIdentityDashProfiles.memberIdentity";
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  let unrelatedGraphqlRequests = 0;
  let validGraphqlRequests = 0;
  let staticDashRequests = 0;
  let unexpectedVoyagerRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1></main></body></html>`
    })
  );
  await page.route("https://www.linkedin.com/voyager/api/**", (route) => {
    const requestUrl = route.request().url();
    if (requestUrl === unrelatedGraphqlUrl) {
      unrelatedGraphqlRequests += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...profilePayloadWithIdentity(voyagerDashGraphqlProfilePayload, {
            publicIdentifier: "unrelated-profile",
            firstName: "Wrong",
            lastName: "Person"
          }),
          meta: { padding: "x".repeat(200_000) }
        })
      });
    }
    if (requestUrl === validGraphqlUrl) {
      validGraphqlRequests += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          profilePayloadWithPrependedIdentity(voyagerDashGraphqlProfilePayload, {
            publicIdentifier: "unrelated-profile",
            firstName: "Wrong",
            lastName: "Person"
          })
        )
      });
    }
    if (requestUrl === staticDashUrl) {
      staticDashRequests += 1;
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "stale static endpoint" })
      });
    }
    unexpectedVoyagerRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `unexpected request: ${requestUrl}` })
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);
  await page.evaluate(
    async ([unrelatedUrl, validUrl]) => {
      await Promise.all(
        [unrelatedUrl, validUrl].map(async (url) => {
          const response = await fetch(url, { credentials: "include" });
          await response.text();
        })
      );
    },
    [unrelatedGraphqlUrl, validGraphqlUrl]
  );

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId)
    throw new Error("memberIdentity GraphQL fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Alex Rivera" },
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }]
    }
  });
  expectExtractionDiagnostic(
    extraction,
    "linkedin-voyager.parsed",
    "linkedin-voyager.network.identityDashProfiles"
  );
  expect(unrelatedGraphqlRequests).toBe(1);
  expect(validGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(staticDashRequests).toBe(0);
  expect(unexpectedVoyagerRequests).toBe(0);
});

test("content script parses embedded LinkedIn Voyager state before fetching endpoints", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const coursesUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/courses";
  const skillCategoryUrl =
    "https://www.linkedin.com/voyager/api/identity/profiles/alex-rivera-fixture/skillCategory";
  let coursesRequests = 0;
  let skillCategoryRequests = 0;
  let detailRequests = 0;
  let voyagerRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><p>1,475 followers • 500+ connections</p><code id="bpr-guid-1">${escapeHtml(
        JSON.stringify(
          profilePayloadWithoutSocialCounts(voyagerDashProfilePayloadWithPagedSections())
        )
      )}</code></main></body></html>`
    })
  );
  await page.route("https://www.linkedin.com/in/alex-rivera-fixture/details/**", (route) => {
    detailRequests += 1;
    return route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<!doctype html><html><body>not needed</body></html>"
    });
  });
  await page.route("https://www.linkedin.com/voyager/api/**", (route) => {
    const url = route.request().url();
    if (url === coursesUrl) {
      coursesRequests += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerSupplementalManyCoursesPayload)
      });
    }
    if (url === skillCategoryUrl) {
      skillCategoryRequests += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(voyagerSupplementalManySkillsPayload)
      });
    }
    voyagerRequests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "unexpected request" })
    });
  });
  await context.addCookies([
    { domain: ".linkedin.com", name: "JSESSIONID", path: "/", value: "ajax:fixture" }
  ]);
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("embedded voyager fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { connections: "500+", followers: "1,475" },
      courses: expect.arrayContaining([
        expect.objectContaining({ name: "AUT-201 - Accessible Automation Systems" }),
        expect.objectContaining({ name: "CRS-028 - Course 028" })
      ]),
      skills: expect.arrayContaining([
        expect.objectContaining({ name: "TypeScript" }),
        expect.objectContaining({ name: "Skill 097" })
      ]),
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }]
    }
  });
  expect((extraction as { profile: Profile }).profile.skills).toHaveLength(97);
  expect((extraction as { profile: Profile }).profile.courses).toHaveLength(28);
  expectExtractionDiagnostic(extraction, "linkedin-voyager.parsed", "linkedin-voyager.embedded");
  expect(coursesRequests).toBe(1);
  expect(skillCategoryRequests).toBe(1);
  expect(detailRequests).toBe(0);
  expect(voyagerRequests).toBe(0);
});

test("content script skips embedded Voyager state from another profile", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  let voyagerRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><code id="bpr-guid-1">${escapeHtml(
        JSON.stringify(
          profilePayloadWithIdentity(voyagerDashProfilePayload, {
            publicIdentifier: "unrelated-profile",
            firstName: "Wrong",
            lastName: "Person"
          })
        )
      )}</code><code id="bpr-guid-2">${escapeHtml(
        JSON.stringify(voyagerDashProfilePayload)
      )}</code></main></body></html>`
    })
  );
  await page.route("https://www.linkedin.com/voyager/api/**", (route) => {
    voyagerRequests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "unexpected request" })
    });
  });
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("embedded unrelated voyager fixture tab was not visible");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Alex Rivera" },
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }]
    }
  });
  expectExtractionDiagnostic(extraction, "linkedin-voyager.parsed", "linkedin-voyager.embedded");
  expect(voyagerRequests).toBe(0);
});

test("content script skips embedded Voyager state without an identifiable profile", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  let voyagerRequests = 0;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main><h1 class="text-heading-xlarge">Alex Rivera</h1><code id="bpr-guid-1">${escapeHtml(
        JSON.stringify(
          profilePayloadWithIdentity(voyagerDashProfilePayload, {
            firstName: "Missing",
            lastName: "Identity"
          })
        )
      )}</code><code id="bpr-guid-2">${escapeHtml(
        JSON.stringify(voyagerDashProfilePayload)
      )}</code></main></body></html>`
    })
  );
  await page.route("https://www.linkedin.com/voyager/api/**", (route) => {
    voyagerRequests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "unexpected request" })
    });
  });
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("embedded missing-id voyager fixture tab was not visible");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Alex Rivera" },
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }]
    }
  });
  expectExtractionDiagnostic(extraction, "linkedin-voyager.parsed", "linkedin-voyager.embedded");
  expect(voyagerRequests).toBe(0);
});

test("content script waits for delayed live-style profile landmarks", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/e2e-live-like/";
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta property="og:url" content="${fixtureUrl}" /></head><body><main id="profile-shell"></main></body></html>`
    })
  );
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);

  if (!tabId) throw new Error("delayed fixture tab was not visible to the extension");

  const readinessPromise = sendTabMessage(extensionWorker, tabId, { type: "profile-readiness" });

  await page.evaluate((html) => {
    window.setTimeout(() => {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      document.body.replaceChildren(
        ...Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true))
      );
    }, 100);
  }, liveLikeProfileHtml);

  await expect.poll(() => page.locator(".text-heading-xlarge").textContent()).toBe("Jordan Lee");
  await expect(readinessPromise).resolves.toMatchObject({
    ok: true,
    readiness: { state: "ready" }
  });

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: {
      ...defaultSettings,
      automationMode: "review-before-export" as const,
      deliveryMode: "clipboard" as const
    }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Jordan Lee", profileUrl: fixtureUrl },
      exportMetadata: { formats: ["json", "markdown"] }
    }
  });
});

test("content script extracts a metadata-backed profile shell", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/e2e-metadata/";
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: metadataBackedProfileHtml.replaceAll(
        "https://www.linkedin.com/in/taylor-metadata/",
        fixtureUrl
      )
    })
  );
  await page.goto(fixtureUrl);

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("metadata fixture tab was not visible to the extension");

  const readiness = await sendTabMessage(extensionWorker, tabId, { type: "profile-readiness" });
  expect(readiness).toMatchObject({ ok: true, readiness: { state: "ready" } });

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: {
      ...defaultSettings,
      automationMode: "review-before-export" as const,
      deliveryMode: "clipboard" as const
    }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Taylor Morgan", headline: "Privacy engineer", profileUrl: fixtureUrl },
      exportMetadata: { formats: ["json", "markdown"] }
    }
  });
});

test("content script does not click navigational show-more links during extraction", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/e2e-safe-expansion/";
  const unsafeLink = String.raw`<a id="unsafe-more" href="https://www.linkedin.com/feed/" onclick="window.__unsafeShowMoreClicked = true; location.href = 'https://www.linkedin.com/feed/'; return false;">Show more</a>`;
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml
        .replace("<body>", `<body>${unsafeLink}`)
        .replaceAll("https://www.linkedin.com/in/alex-rivera-fixture/", fixtureUrl)
    })
  );
  await page.goto(fixtureUrl);
  await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();

  const tabId = await tabIdForUrl(extensionWorker, fixtureUrl);
  if (!tabId) throw new Error("safe expansion fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: {
      ...defaultSettings,
      automationMode: "review-before-export" as const,
      expandShowMore: true
    }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Alex Rivera", profileUrl: fixtureUrl }
    }
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as typeof window & { __unsafeShowMoreClicked?: boolean }).__unsafeShowMoreClicked
        )
      )
    )
    .toBe(false);
  expect(page.url()).toBe(fixtureUrl);
});

async function tabIdForUrl(extensionWorker: Page, url: string): Promise<number | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      extensionWorker.evaluate(async (targetUrl) => {
        const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
        const latestExactTab = (tabs: any[]) =>
          tabs
            .filter((candidate) => candidate.url === targetUrl && typeof candidate.id === "number")
            .sort((left, right) => right.id - left.id)[0];
        const queryTabs = (details: Record<string, unknown>) =>
          new Promise<any[]>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("chrome.tabs.query timed out")),
              5_000
            );
            chromeApi.tabs.query(details, (queriedTabs: any[]) => {
              clearTimeout(timeout);
              const error = chromeApi.runtime.lastError;
              if (error) reject(new Error(error.message));
              else resolve(queriedTabs);
            });
          });

        const tabs = await queryTabs({ url: targetUrl });
        const tab = latestExactTab(tabs);
        if (tab) return tab.id;

        const activeTabs = await queryTabs({ active: true, currentWindow: true });
        const activeMatch = latestExactTab(activeTabs);
        if (activeMatch) return activeMatch.id;

        return tab?.id;
      }, url),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("tab lookup timed out in Playwright")), 15_000);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function sendTabMessage(
  extensionWorker: Page,
  tabId: number,
  message: unknown
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      extensionWorker.evaluate(
        async ({ id, runtimeMessage }) => {
          const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
          const sendOnce = () =>
            new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("tab message timed out in service worker")),
                65_000
              );
              chromeApi.tabs.sendMessage(id, runtimeMessage, (response: unknown) => {
                clearTimeout(timeout);
                const error = chromeApi.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve(response);
              });
            });
          const isMissingReceiver = (error: unknown) =>
            /Could not establish connection|Receiving end does not exist|No matching message handler|message channel closed before a response was received|asynchronous response/i.test(
              error instanceof Error ? error.message : String(error)
            );
          const contentScriptFile = () => {
            const linkedInScripts =
              chromeApi.runtime
                .getManifest()
                .content_scripts?.filter((entry: { matches?: string[] }) =>
                  entry.matches?.some((match) => /^https:\/\/www\.linkedin\.com\/in\//i.test(match))
                ) ?? [];
            const file = linkedInScripts
              .flatMap((entry: { js?: string[] }) => entry.js ?? [])
              .find(
                (script: string) => script.replace(/^\/+/, "") === "content-scripts/linkedin.js"
              );
            return file?.replace(/^\/+/, "") || "content-scripts/linkedin.js";
          };
          try {
            return await sendOnce();
          } catch (error) {
            if (!isMissingReceiver(error)) throw error;
          }
          await chromeApi.scripting.executeScript({
            target: { tabId: id },
            files: [contentScriptFile()]
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
          return sendOnce();
        },
        { id: tabId, runtimeMessage: message }
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("tab message timed out in Playwright")),
          70_000
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function sendTabMessageFromPage(
  page: Page,
  tabId: number,
  message: unknown
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      page.evaluate(
        async ({ id, runtimeMessage }) =>
          new Promise((resolve, reject) => {
            const inPageTimeout = setTimeout(
              () => reject(new Error("tab message timed out in extension page")),
              120_000
            );
            chrome.tabs.sendMessage(id, runtimeMessage, (response: unknown) => {
              clearTimeout(inPageTimeout);
              const error = chrome.runtime.lastError;
              if (error) reject(new Error(error.message));
              else resolve(response);
            });
          }),
        { id: tabId, runtimeMessage: message }
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("tab message timed out in Playwright")),
          125_000
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function tabIdForUrlFromPage(page: Page, url: string): Promise<number | undefined> {
  return page.evaluate(async (targetUrl) => {
    const latestExactTab = (tabs: any[]) =>
      tabs
        .filter((candidate) => candidate.url === targetUrl && typeof candidate.id === "number")
        .sort((left, right) => (right.id ?? 0) - (left.id ?? 0))[0];
    const queryTabs = (details: Record<string, unknown>) =>
      new Promise<any[]>((resolve, reject) => {
        chrome.tabs.query(details, (queriedTabs) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(queriedTabs);
        });
      });

    const tabs = await queryTabs({ url: targetUrl });
    const tab = latestExactTab(tabs);
    if (tab?.id) return tab.id;

    const activeTabs = await queryTabs({ active: true, currentWindow: true });
    return latestExactTab(activeTabs)?.id;
  }, url);
}

async function captureExtractionStatuses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = globalThis as typeof globalThis & {
      __lpeExtractionStatuses?: unknown[];
      __lpeExtractionStatusListener?: (message: unknown) => void;
    };
    runtime.__lpeExtractionStatuses = [];
    if (runtime.__lpeExtractionStatusListener) {
      chrome.runtime.onMessage.removeListener(runtime.__lpeExtractionStatusListener);
    }
    runtime.__lpeExtractionStatusListener = (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "extraction-status"
      ) {
        runtime.__lpeExtractionStatuses?.push((message as { status?: unknown }).status);
      }
    };
    chrome.runtime.onMessage.addListener(runtime.__lpeExtractionStatusListener);
  });
}

async function extractionStatuses(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __lpeExtractionStatuses?: unknown[] })
        .__lpeExtractionStatuses ?? []
  );
}

async function actionStateForTab(
  extensionWorker: Page,
  tabId: number
): Promise<{ badgeText: string; enabled: boolean; popup: string; title: string }> {
  return extensionWorker.evaluate(async (id) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
    const action = chromeApi.action;
    const callAction = <T>(
      label: string,
      method: (...args: any[]) => Promise<T> | void,
      arg: any
    ) => {
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${label} did not resolve`)), 10_000);
        const finish = (value: T) => {
          clearTimeout(timeout);
          resolve(value);
        };
        const fail = (error: unknown) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        };
        try {
          const maybePromise = method(arg, (value: T) => {
            const error = chromeApi.runtime.lastError;
            if (error) fail(new Error(error.message));
            else finish(value);
          });
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.then(finish, fail);
          }
        } catch (error) {
          fail(error);
        }
      });
    };
    return {
      badgeText: await callAction<string>("action.getBadgeText", action.getBadgeText.bind(action), {
        tabId: id
      }),
      enabled: await callAction<boolean>("action.isEnabled", action.isEnabled.bind(action), id),
      popup: await callAction<string>("action.getPopup", action.getPopup.bind(action), {
        tabId: id
      }),
      title: await callAction<string>("action.getTitle", action.getTitle.bind(action), {
        tabId: id
      })
    };
  }, tabId);
}

function expectExtractionDiagnostic(extraction: unknown, code: string, source: string): void {
  const profile = (extraction as { profile?: Profile }).profile;
  expect(profile?.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        source
      })
    ])
  );
}

function expectNoDiagnosticCodes(profile: Profile, codes: string[]): void {
  const diagnosticCodes = profile.diagnostics.map((diagnostic) => diagnostic.code);
  for (const code of codes) {
    expect(diagnosticCodes).not.toContain(code);
  }
}

function expectNoUnavailableCoverageForNonemptySections(profile: Profile): void {
  const nonemptySections: Array<[string, number]> = [
    ["work", profile.work.length],
    ["education", profile.education.length],
    ["skills", profile.skills.length],
    ["licensesCertifications", profile.licensesCertifications.length],
    ["projects", profile.projects.length],
    ["courses", profile.courses.length]
  ];
  for (const [section, count] of nonemptySections) {
    if (!count) continue;
    expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      `coverage.${section}.unavailable`
    );
  }
}

interface ExportedProfileSummary {
  capturedAt: string | null;
  coursesCount: number;
  featuredCount: number;
  name: string | null;
  patentsCount: number;
  skillsCount: number;
  testScoresCount: number;
  workCount: number;
}

async function storedSessionProfileSummary(page: Page): Promise<ExportedProfileSummary | null> {
  return page.evaluate(async () => {
    const sessionStored = await chrome.storage.session.get(
      "linkedin-profile-exporter.profile.session"
    );
    const localStored = await chrome.storage.local.get("linkedin-profile-exporter.profile");
    const profile = (sessionStored["linkedin-profile-exporter.profile.session"] ??
      localStored["linkedin-profile-exporter.profile"]) as
      | {
          courses?: unknown[];
          featured?: unknown[];
          identity?: { name?: string };
          patents?: unknown[];
          skills?: unknown[];
          testScores?: unknown[];
          work?: unknown[];
        }
      | undefined;
    if (!profile) return null;
    return {
      capturedAt: profile.metadata?.capturedAt ?? null,
      coursesCount: profile.courses?.length ?? 0,
      featuredCount: profile.featured?.length ?? 0,
      name: profile.identity?.name ?? null,
      patentsCount: profile.patents?.length ?? 0,
      skillsCount: profile.skills?.length ?? 0,
      testScoresCount: profile.testScores?.length ?? 0,
      workCount: profile.work?.length ?? 0
    };
  });
}

async function captureClipboardWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const writes: string[] = [];
    Object.defineProperty(window, "__lpeClipboardWrites", {
      configurable: true,
      value: writes
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => writes.at(-1) ?? "",
        writeText: async (text: string) => {
          writes.push(text);
        }
      }
    });
  });
}

async function clipboardProfileSummary(page: Page): Promise<ExportedProfileSummary | null> {
  return page.evaluate(() => {
    const writes =
      (window as typeof window & { __lpeClipboardWrites?: string[] }).__lpeClipboardWrites ?? [];
    for (const text of writes) {
      try {
        const profile = JSON.parse(text) as {
          courses?: unknown[];
          featured?: unknown[];
          identity?: { name?: string };
          patents?: unknown[];
          schemaVersion?: string;
          skills?: unknown[];
          testScores?: unknown[];
          work?: unknown[];
        };
        if (profile.schemaVersion !== "linkedin-profile-exporter.profile.v1") continue;
        return {
          coursesCount: profile.courses?.length ?? 0,
          featuredCount: profile.featured?.length ?? 0,
          name: profile.identity?.name ?? null,
          patentsCount: profile.patents?.length ?? 0,
          skillsCount: profile.skills?.length ?? 0,
          testScoresCount: profile.testScores?.length ?? 0,
          workCount: profile.work?.length ?? 0
        };
      } catch {
        // Non-JSON formats are expected when multiple clipboard formats are selected.
      }
    }
    return null;
  });
}

async function installDownloadCapture(target: Page): Promise<void> {
  await target.evaluate(() => {
    const runtime = globalThis as typeof globalThis & {
      __lpeDownloadOptions?: Array<{ filename?: string; url?: string }>;
      chrome: any;
    };
    const captured: Array<{ filename?: string; url?: string }> = [];
    runtime.__lpeDownloadOptions = captured;
    runtime.chrome.downloads.download = (
      options: { filename?: string; url?: string },
      callback?: (downloadId: number) => void
    ) => {
      captured.push(options);
      if (callback) {
        callback(captured.length);
        return;
      }
      return Promise.resolve(captured.length);
    };
  });
}

async function downloadedProfileSummary(target: Page): Promise<ExportedProfileSummary | null> {
  return target.evaluate(() => {
    const captured =
      (
        globalThis as typeof globalThis & {
          __lpeDownloadOptions?: Array<{ filename?: string; url?: string }>;
        }
      ).__lpeDownloadOptions ?? [];
    for (const download of captured) {
      if (!download.filename?.endsWith(".json") || !download.url) continue;
      const encoded = download.url.split(",")[1];
      if (!encoded) continue;
      const json = new TextDecoder().decode(
        Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
      );
      const profile = JSON.parse(json) as {
        courses?: unknown[];
        featured?: unknown[];
        identity?: { name?: string };
        patents?: unknown[];
        testScores?: unknown[];
        work?: unknown[];
      };
      return {
        coursesCount: profile.courses?.length ?? 0,
        featuredCount: profile.featured?.length ?? 0,
        name: profile.identity?.name ?? null,
        patentsCount: profile.patents?.length ?? 0,
        testScoresCount: profile.testScores?.length ?? 0,
        workCount: profile.work?.length ?? 0
      };
    }
    return null;
  });
}

function fixtureProfile(): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    identity: {
      name: "Alex Rivera",
      headline: "Engineering leader building privacy-preserving data products",
      profileUrl: "https://www.linkedin.com/in/alex-rivera-fixture/",
      links: []
    },
    work: [],
    education: [],
    skills: [],
    licensesCertifications: [],
    projects: [],
    publications: [],
    volunteering: [],
    honorsAwards: [],
    testScores: [],
    patents: [],
    languages: [],
    courses: [],
    recommendations: [],
    featured: [],
    organizations: [],
    interests: [],
    metadata: {
      capturedAt: "2026-05-25T12:00:00.000Z",
      sourceUrl: "https://www.linkedin.com/in/alex-rivera-fixture/",
      generator: "linkedin-profile-exporter"
    },
    diagnostics: [],
    exportMetadata: {
      formats: ["json", "markdown"],
      filenameTemplate: "{name}-{date}-{format}"
    }
  };
}

function staleFixtureProfile(
  profileUrl = "https://www.linkedin.com/in/cached-snapshot/",
  options: { incompleteSkills?: boolean } = {}
): Profile {
  const profile = fixtureProfile();
  return {
    ...profile,
    diagnostics: options.incompleteSkills
      ? [
          {
            code: "coverage.skills.capped",
            level: "warning",
            message: "Cached skills stopped at the default detail page size.",
            source: "linkedin-voyager"
          }
        ]
      : profile.diagnostics,
    identity: {
      ...profile.identity,
      name: "Cached Snapshot",
      profileUrl
    },
    metadata: {
      ...profile.metadata,
      capturedAt: "2020-01-01T12:00:00.000Z",
      sourceUrl: profileUrl
    },
    work: [],
    education: [],
    skills: options.incompleteSkills
      ? Array.from({ length: 20 }, (_, index) => ({
          name: `Cached Skill ${String(index + 1).padStart(3, "0")}`
        }))
      : [],
    licensesCertifications: [],
    projects: [],
    publications: [],
    volunteering: [],
    honorsAwards: [],
    testScores: [],
    patents: [],
    languages: [],
    courses: [],
    recommendations: [],
    featured: [],
    organizations: [],
    interests: []
  };
}

function voyagerDashProfilePayloadWithPagedSections(
  options: { coursesTotal?: number; skillsTotal?: number } = {}
): unknown {
  const coursesTotal = options.coursesTotal ?? 28;
  const skillsTotal = options.skillsTotal ?? 97;
  const courseUrns = Array.from(
    { length: 20 },
    (_, index) =>
      `urn:li:fsd_profileCourse:(alex-rivera-fixture,course-${String(index + 1).padStart(3, "0")})`
  );
  const skillUrns = Array.from({ length: 20 }, (_, index) =>
    index === 0
      ? "urn:li:fsd_profileSkill:(alex-rivera-fixture,typescript)"
      : `urn:li:fsd_profileSkill:(alex-rivera-fixture,skill-${String(index + 1).padStart(3, "0")})`
  );
  return {
    ...voyagerDashProfilePayload,
    data: {
      ...voyagerDashProfilePayload.data,
      "*profileCourses": courseUrns,
      "*profileSkills": skillUrns
    },
    included: [
      ...voyagerDashProfilePayload.included.filter(
        (item) => !isCourseEntity(item) && !isSkillEntity(item)
      ),
      ...courseUrns.map((entityUrn, index) => ({
        entityUrn,
        $type: "com.linkedin.voyager.dash.identity.profile.Course",
        name:
          index === 0
            ? "Accessible Automation Systems"
            : `Course ${String(index + 1).padStart(3, "0")}`,
        number: index === 0 ? "AUT-201" : `CRS-${String(index + 1).padStart(3, "0")}`,
        ...(index === 0 ? { providerName: "Example University" } : {})
      })),
      ...skillUrns.map((entityUrn, index) => ({
        entityUrn,
        $type: "com.linkedin.voyager.dash.identity.profile.Skill",
        name: index === 0 ? "TypeScript" : `Skill ${String(index + 1).padStart(3, "0")}`,
        ...(index === 0 ? { endorsementCount: 12 } : {})
      })),
      {
        entityUrn: "urn:li:collection:profile-courses",
        $type: "com.linkedin.restli.common.CollectionResponse",
        $recipeTypes: [
          "com.linkedin.voyager.dash.deco.identity.profile.FullProfileCoursesInjection"
        ],
        "*elements": courseUrns,
        paging: { count: coursesTotal, links: [], start: 0 }
      },
      {
        entityUrn: "urn:li:collection:profile-skills",
        $type: "com.linkedin.restli.common.CollectionResponse",
        $recipeTypes: [
          "com.linkedin.voyager.dash.deco.identity.profile.FullProfileSkillsInjection"
        ],
        "*elements": skillUrns,
        paging: { count: skillsTotal, links: [], start: 0 }
      }
    ]
  };
}

function voyagerPagedSkillsPayload(
  start: number,
  end: number,
  nextUrl?: string,
  totalCount = 97,
  options: { pageCount?: number; profileId?: string } = {}
): unknown {
  const profileId = options.profileId ?? "alex-rivera-fixture";
  const skillUrns = Array.from({ length: end - start + 1 }, (_, index) => {
    const skillIndex = start + index;
    return skillIndex === 1
      ? `urn:li:fsd_profileSkill:(${profileId},typescript)`
      : `urn:li:fsd_profileSkill:(${profileId},skill-${String(skillIndex).padStart(3, "0")})`;
  });
  const categoryUrn = `urn:li:fsd_profileSkillCategory:(${profileId},top-skills)`;
  return {
    data: {
      "*elements": [categoryUrn]
    },
    included: [
      {
        entityUrn: categoryUrn,
        $type: "com.linkedin.voyager.dash.identity.profile.SkillCategory",
        "*skills": skillUrns,
        paging: {
          count: options.pageCount ?? totalCount,
          links: nextUrl ? [{ href: nextUrl, rel: "next" }] : [],
          start: start - 1,
          total: totalCount
        }
      },
      ...skillUrns.map((entityUrn, index) => {
        const skillIndex = start + index;
        const name =
          skillIndex === 1 ? "TypeScript" : `Skill ${String(skillIndex).padStart(3, "0")}`;
        return {
          entityUrn,
          skillUrn: entityUrn,
          $type: "com.linkedin.voyager.dash.identity.profile.ProfileSkill",
          title: { text: name },
          ...(skillIndex === 1 ? { endorsementCount: 12 } : {})
        };
      })
    ]
  };
}

function renderedSkillsDetailHtml(profileUrl: string, count: number): string {
  const rows = Array.from({ length: count }, (_, index) => {
    const skillIndex = index + 1;
    const name = skillIndex === 1 ? "TypeScript" : `Skill ${String(skillIndex).padStart(3, "0")}`;
    const endorsements = skillIndex === 1 ? "<span>12 endorsements</span>" : "";
    return `<li class="pvs-list__paged-list-item"><div class="display-flex"><div class="mr1 t-bold"><span aria-hidden="true">${escapeHtml(
      name
    )}</span></div>${endorsements}</div></li>`;
  }).join("");
  return `<!doctype html><html><head><meta property="og:url" content="${profileUrl}" /></head><body><main><h1>Skills</h1><ul>${rows}</ul></main></body></html>`;
}

function renderedCoursesDetailHtml(profileUrl: string, count: number): string {
  const rows = Array.from({ length: count }, (_, index) => {
    const courseIndex = index + 1;
    const number = courseIndex === 1 ? "AUT-201" : `CRS-${String(courseIndex).padStart(3, "0")}`;
    const name =
      courseIndex === 1
        ? "Accessible Automation Systems"
        : `Course ${String(courseIndex).padStart(3, "0")}`;
    const provider =
      courseIndex === 1 ? '<span aria-hidden="true">Associated with Example University</span>' : "";
    return `<li class="pvs-list__paged-list-item"><div class="display-flex"><div class="mr1 t-bold"><span aria-hidden="true">${escapeHtml(
      `${number} - ${name}`
    )}</span></div>${provider}</div></li>`;
  }).join("");
  return `<!doctype html><html><head><meta property="og:url" content="${profileUrl}" /></head><body><main><h1>Courses</h1><ul>${rows}</ul></main></body></html>`;
}

function renderedInterestsDetailHtml(profileUrl: string): string {
  const rows = [
    ["Local-first software", "/company/local-first/"],
    ["Browser Automation", "/groups/browser-automation/"],
    ["Privacy Engineering", "/school/privacy-engineering/"]
  ]
    .map(
      ([name, href]) =>
        `<li class="pvs-list__paged-list-item"><a href="${href}"><div class="mr1 t-bold"><span aria-hidden="true">${escapeHtml(
          name
        )}</span></div></a></li>`
    )
    .join("");
  return `<!doctype html><html><head><meta property="og:url" content="${profileUrl}" /></head><body><main><h1>Interests</h1><ul>${rows}</ul></main></body></html>`;
}

function renderedProjectsDetailHtml(profileUrl: string): string {
  const rows = [
    [
      "Local Export Toolkit",
      "Open-source browser export workflow.",
      "https://example.test/local-export"
    ],
    [
      "Privacy Report Builder",
      "Generates local aggregate diagnostics.",
      "https://example.test/privacy-report"
    ],
    [
      "Data Review Console",
      "Review-before-export profile data console.",
      "https://example.test/review-console"
    ]
  ]
    .map(
      ([name, description, href]) =>
        `<li class="pvs-list__paged-list-item"><a href="${href}"><div class="mr1 t-bold"><span aria-hidden="true">${escapeHtml(
          name
        )}</span></div></a><span aria-hidden="true">${escapeHtml(description)}</span></li>`
    )
    .join("");
  return `<!doctype html><html><head><meta property="og:url" content="${profileUrl}" /></head><body><main><h1>Projects</h1><ul>${rows}</ul></main></body></html>`;
}

function renderedFeaturedDetailHtml(profileUrl: string): string {
  const rows = [
    [
      "Privacy-first extension demo",
      "A walkthrough for privacy-first extraction.",
      "https://example.test/privacy-demo"
    ],
    [
      "Local Export README",
      "Reference documentation for local exports.",
      "https://example.test/readme"
    ],
    [
      "Data Review Dashboard",
      "Compact review UI for profile data.",
      "https://example.test/dashboard"
    ]
  ]
    .map(
      ([title, description, href]) =>
        `<li class="pvs-list__paged-list-item"><a href="${href}"><div class="mr1 t-bold"><span aria-hidden="true">${escapeHtml(
          title
        )}</span></div></a><span aria-hidden="true">${escapeHtml(description)}</span></li>`
    )
    .join("");
  return `<!doctype html><html><head><meta property="og:url" content="${profileUrl}" /></head><body><main><h1>Featured</h1><ul>${rows}</ul></main></body></html>`;
}

function renderedCertificationDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Licenses & certifications", [
    detailRowHtml(
      "Privacy Engineering Certificate",
      ["Example Standards Institute", "Issued Jan 2024", "Credential ID CERT-123"],
      "https://example.test/certification/privacy"
    )
  ]);
}

function renderedPublicationDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Publications", [
    detailRowHtml(
      "Practical Provenance for Browser Data",
      [
        "Example Journal",
        "Published Jan 2025",
        "Authors: Alex Rivera and Sam Lee",
        "A fixture article about auditable browser data exports."
      ],
      "https://example.test/publications/provenance"
    )
  ]);
}

function renderedVolunteeringDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Volunteering", [
    detailRowHtml(
      "Mentor",
      ["Local Tech Fellows", "Jan 2020 - Present", "Mentored early-career engineers."],
      "https://www.linkedin.com/company/local-tech-fellows/"
    )
  ]);
}

function renderedHonorDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Honors", [
    detailRowHtml("Data Quality Leadership Award", [
      "Northstar Labs",
      "Issued Jan 2023",
      "Recognized for improving auditability."
    ])
  ]);
}

function renderedTestScoreDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Test scores", [
    detailRowHtml("GRE", ["Score: 168", "Sep 2014"])
  ]);
}

function renderedPatentDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Patents", [
    detailRowHtml(
      "Local Export Verification System",
      [
        "United States Patent Office",
        "Patent Number US-123",
        "Application Number APP-456",
        "Issued Jan 2025",
        "A local verification workflow for browser exports."
      ],
      "https://example.test/patents/local-export"
    )
  ]);
}

function renderedLanguageDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Languages", [
    detailRowHtml("English", ["Native or bilingual"])
  ]);
}

function renderedOrganizationDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Organizations", [
    detailRowHtml(
      "Local Data Guild",
      ["Member", "Jan 2021 - Present", "Community group for local-first data tools."],
      "https://example.test/organizations/local-data-guild"
    )
  ]);
}

function renderedWorkDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Experience", [
    detailRowHtml(
      "Director of Engineering",
      [
        "Northstar Labs · Full-time",
        "Jan 2021 - Present",
        "Led browser automation and data quality teams."
      ],
      "https://www.linkedin.com/company/northstar-labs/"
    ),
    detailRowHtml(
      "Staff Engineer",
      [
        "Example Systems · Full-time",
        "Jan 2018 - Dec 2020",
        "Built privacy-preserving data workflows."
      ],
      "https://www.linkedin.com/company/example-systems/"
    )
  ]);
}

function renderedEducationDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Education", [
    detailRowHtml(
      "Example University",
      ["BS in Computer Science", "2011 - 2015", "Research assistant, accessibility lab."],
      "https://www.linkedin.com/school/example-university/"
    ),
    detailRowHtml(
      "Local Community College",
      ["Associate coursework in Mathematics", "2009 - 2011"],
      "https://www.linkedin.com/school/local-community-college/"
    )
  ]);
}

function renderedRecommendationsDetailHtml(profileUrl: string): string {
  return renderedSimpleDetailHtml(profileUrl, "Recommendations", [
    detailRowHtml("Dana Kim", [
      "Product partner at Northstar Labs",
      "Alex consistently turned messy browser workflows into reliable local data products."
    ])
  ]);
}

function renderedSimpleDetailHtml(profileUrl: string, heading: string, rows: string[]): string {
  return `<!doctype html><html><head><meta property="og:url" content="${profileUrl}" /></head><body><main><h1>${escapeHtml(
    heading
  )}</h1><ul>${rows.join("")}</ul></main></body></html>`;
}

function detailRowHtml(title: string, lines: string[], href?: string): string {
  const titleHtml = `<div class="mr1 t-bold"><span aria-hidden="true">${escapeHtml(title)}</span></div>`;
  const body = lines.map((line) => `<span aria-hidden="true">${escapeHtml(line)}</span>`).join("");
  return `<li class="pvs-list__paged-list-item">${
    href ? `<a href="${href}">${titleHtml}</a>` : titleHtml
  }${body}</li>`;
}

function profilePayloadWithoutSocialCounts(payload: unknown): unknown {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown> & { included?: unknown[] })
      : undefined;
  if (!record || !Array.isArray(record.included)) {
    return payload;
  }
  return {
    ...record,
    included: record.included.map((item) => {
      if (!isProfileEntity(item)) return item;
      const next = { ...item };
      delete next.connectionsCount;
      delete next.connectionCount;
      delete next.numConnections;
      delete next.followersCount;
      delete next.followerCount;
      delete next.numFollowers;
      return next;
    })
  };
}

function profilePayloadWithoutBroadDetailSections(payload: unknown): unknown {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown> & {
          data?: Record<string, unknown>;
          included?: unknown[];
        })
      : undefined;
  if (!record || !Array.isArray(record.included)) {
    return payload;
  }
  const data = record.data ? { ...record.data } : undefined;
  if (data) {
    for (const key of [
      "*certificationView",
      "*profileCertifications",
      "*publicationView",
      "*profilePublications",
      "*volunteerExperienceView",
      "*profileVolunteerExperiences",
      "*honorView",
      "*profileHonors",
      "*testScoreView",
      "*profileTestScores",
      "*patentView",
      "*profilePatents",
      "*languageView",
      "*profileLanguages",
      "*organizationView",
      "*profileOrganizations"
    ]) {
      delete data[key];
    }
  }
  return {
    ...record,
    ...(data ? { data } : {}),
    included: record.included.filter((item) => !isBroadDetailSectionEntity(item))
  };
}

function profilePayloadWithoutCoreDetailSections(payload: unknown): unknown {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown> & {
          data?: Record<string, unknown>;
          included?: unknown[];
        })
      : undefined;
  if (!record || !Array.isArray(record.included)) {
    return payload;
  }
  const data = record.data ? { ...record.data } : undefined;
  if (data) {
    for (const key of [
      "*positionView",
      "*profilePositions",
      "*positionGroupView",
      "*profilePositionGroups",
      "*educationView",
      "*profileEducations",
      "*recommendationView",
      "*profileRecommendations"
    ]) {
      delete data[key];
    }
  }
  return {
    ...record,
    ...(data ? { data } : {}),
    included: record.included.filter((item) => !isCoreDetailSectionEntity(item))
  };
}

function profilePayloadWithoutInterests(payload: unknown): unknown {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown> & {
          data?: Record<string, unknown>;
          included?: unknown[];
        })
      : undefined;
  if (!record || !Array.isArray(record.included)) {
    return payload;
  }
  const data = record.data ? { ...record.data } : undefined;
  if (data) delete data["*profileInterests"];
  return {
    ...record,
    ...(data ? { data } : {}),
    included: record.included.filter((item) => !isInterestEntity(item))
  };
}

function profilePayloadWithoutProjectsAndFeatured(payload: unknown): unknown {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown> & {
          data?: Record<string, unknown>;
          included?: unknown[];
        })
      : undefined;
  if (!record || !Array.isArray(record.included)) {
    return payload;
  }
  const data = record.data ? { ...record.data } : undefined;
  if (data) {
    delete data["*profileProjects"];
    delete data["*summaryTreasuryMedias"];
  }
  return {
    ...record,
    ...(data ? { data } : {}),
    included: record.included.filter((item) => !isProjectEntity(item) && !isFeaturedEntity(item))
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function profilePayloadWithIdentity<T extends { data?: unknown; included: readonly unknown[] }>(
  payload: T,
  identity: { publicIdentifier?: string; firstName: string; lastName: string }
): T {
  return {
    ...payload,
    data: profileReferencePayload(payload.data, identity.publicIdentifier),
    included: payload.included.map((item) => {
      if (!isProfileEntity(item)) return item;
      const updated: Record<string, unknown> = {
        ...item,
        firstName: identity.firstName,
        lastName: identity.lastName
      };
      if (identity.publicIdentifier) {
        updated.publicIdentifier = identity.publicIdentifier;
        updated.entityUrn = `urn:li:fsd_profile:${identity.publicIdentifier}`;
      } else {
        delete updated.publicIdentifier;
        delete updated.entityUrn;
      }
      return updated;
    })
  };
}

function profilePayloadWithPrependedIdentity<T extends { included: readonly unknown[] }>(
  payload: T,
  identity: { publicIdentifier: string; firstName: string; lastName: string }
): T {
  return {
    ...payload,
    included: [
      {
        entityUrn: `urn:li:fsd_profile:${identity.publicIdentifier}`,
        $type: "com.linkedin.voyager.dash.identity.profile.Profile",
        firstName: identity.firstName,
        lastName: identity.lastName,
        publicIdentifier: identity.publicIdentifier
      },
      ...payload.included
    ]
  };
}

function profileReferencePayload(value: unknown, publicIdentifier: string | undefined): unknown {
  if (typeof value === "string") {
    if (!/^urn:li:fsd_profile:/i.test(value)) return value;
    return publicIdentifier ? `urn:li:fsd_profile:${publicIdentifier}` : undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => profileReferencePayload(item, publicIdentifier))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nested]) => [key, profileReferencePayload(nested, publicIdentifier)] as const)
        .filter(([, nested]) => nested !== undefined)
    );
  }
  return value;
}

function isProfileEntity(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.Profile$/.test((value as { $type: string }).$type)
  );
}

function isCourseEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(FullProfile)?Course$/.test((value as { $type: string }).$type)
  );
}

function isSkillEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(FullProfile)?Skill$/.test((value as { $type: string }).$type)
  );
}

function isInterestEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(FullProfile)?Interest$/.test((value as { $type: string }).$type)
  );
}

function isProjectEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(FullProfile)?Project$/.test((value as { $type: string }).$type)
  );
}

function isFeaturedEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(Treasury|Featured|ProfileTreasuryMedia)/i.test(
      (value as { $type: string }).$type
    )
  );
}

function isBroadDetailSectionEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(Certification|Publication|VolunteerExperience|Honor|TestScore|Patent|Language|Organization)$/i.test(
      (value as { $type: string }).$type
    )
  );
}

function isCoreDetailSectionEntity(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $type?: unknown }).$type === "string" &&
    /identity\.profile\.(Position|PositionGroup|Education|Recommendation)$/i.test(
      (value as { $type: string }).$type
    )
  );
}

function detailUrlPattern(value: string): RegExp {
  return new RegExp(`^${escapeRegExp(value.replace(/\/+$/, ""))}\\/?(?:\\?.*)?$`);
}

function safeRequestFrame(route: Route): Frame | undefined {
  try {
    return route.request().frame();
  } catch {
    return undefined;
  }
}

function detailUrlMatches(actual: string, expected: string): boolean {
  return detailUrlPattern(expected).test(actual);
}

function isRecoveryDetailRequest(value: string): boolean {
  try {
    return new URL(value).searchParams.has("linkedin-profile-exporter-recovery");
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

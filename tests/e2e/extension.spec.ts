import {
  denseProfileHtml,
  liveLikeProfileHtml,
  metadataBackedProfileHtml,
  voyagerDashGraphqlProfilePayload,
  voyagerDashGraphqlSparseProfilePayload,
  voyagerDashProfilePayload,
  voyagerProfilePayload,
  voyagerSupplementalSkillsPayload
} from "../../packages/fixtures/src";
import { SCHEMA_VERSION, type Profile } from "../../packages/core/src/schema";
import { defaultSettings } from "../../packages/core/src/settings";
import { expect, test } from "./extension-fixture";
import type { Page, Worker } from "@playwright/test";

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

  await page.getByLabel("Delivery").selectOption("clipboard");
  await page.getByLabel("Keep extracted profile locally").check();
  await page.getByLabel("Include all fields").check();
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
        includeConfidence: true,
        includeProvenance: true,
        verbose: true
      },
      privacy: { persistExtractedData: true }
    });
  await page.reload();

  await expect(page.getByLabel("Delivery")).toHaveValue("clipboard");
  await expect(page.getByLabel("Keep extracted profile locally")).toBeChecked();
  await expect(page.getByLabel("Include all fields")).toBeChecked();

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
      title: "Export this LinkedIn profile"
    });

  await page.goto(feedUrl, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await expect
    .poll(() => actionStateForTab(extensionWorker, tabId), actionStatePollOptions)
    .toMatchObject({
      badgeText: "",
      enabled: false,
      title: "Open a LinkedIn profile to export"
    });
});

test("footer copy and download actions auto-extract before delivery", async ({
  context,
  extensionId,
  extensionWorker
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

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(async (profile) => {
    await chrome.storage.session.set({ "linkedin-profile-exporter.profile.session": profile });
  }, staleFixtureProfile());
  await popup.reload();
  await expect(popup.getByRole("heading", { name: "Cached Snapshot" })).toBeVisible();
  await expect(popup.getByText("Ready", { exact: true })).toBeVisible();

  await captureClipboardWrites(popup);
  await popup.getByRole("button", { name: "Clipboard" }).click();
  await popup.locator("footer").getByRole("button", { name: "Copy selected" }).click();
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
  await expect(popup.getByText("Ready to extract")).toBeVisible();
  await installDownloadCapture(extensionWorker);
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
    .poll(() => downloadedProfileSummary(extensionWorker))
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
  const staticDashUrl =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=alex-rivera-fixture&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93";
  let observedGraphqlRequests = 0;
  let observedDashRequests = 0;
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
      body: JSON.stringify(voyagerDashProfilePayload)
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
      await fetch(graphqlUrl, { credentials: "include" });
      await fetch(dashUrl, { credentials: "include" });
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
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }]
    }
  });
  expectExtractionDiagnostic(
    extraction,
    "linkedin-voyager.parsed",
    "linkedin-voyager.network.dashProfileUrn"
  );
  expect(observedGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(observedDashRequests).toBeGreaterThanOrEqual(2);
  expect(staticDashRequests).toBe(0);
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
      await fetch(sparseUrl, { credentials: "include" });
      await fetch(fullUrl, { credentials: "include" });
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

test("content script accepts memberIdentity GraphQL when referenced identity follows unrelated included identities", async ({
  context,
  extensionWorker
}) => {
  const fixtureUrl = "https://www.linkedin.com/in/alex-rivera-fixture/";
  const unrelatedGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:ACoAunrelated)&queryId=voyagerIdentityDashProfiles.memberIdentity";
  const validGraphqlUrl =
    "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:ACoAfixture)&queryId=voyagerIdentityDashProfiles.memberIdentity";
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
      await fetch(unrelatedUrl, { credentials: "include" });
      await fetch(validUrl, { credentials: "include" });
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
  expect(unrelatedGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(validGraphqlRequests).toBeGreaterThanOrEqual(2);
  expect(staticDashRequests).toBe(0);
  expect(unexpectedVoyagerRequests).toBe(0);
});

test("content script parses embedded LinkedIn Voyager state before fetching endpoints", async ({
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
  if (!tabId) throw new Error("embedded voyager fixture tab was not visible to the extension");

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...fullMetadataSettings, automationMode: "review-before-export" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      work: [{ title: "Director of Engineering", company: "Northstar Labs" }]
    }
  });
  expectExtractionDiagnostic(extraction, "linkedin-voyager.parsed", "linkedin-voyager.embedded");
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

async function tabIdForUrl(extensionWorker: Worker, url: string): Promise<number | undefined> {
  return extensionWorker.evaluate(async (targetUrl) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
    const queryTabs = (details: Record<string, unknown>) =>
      new Promise<any[]>((resolve, reject) => {
        chromeApi.tabs.query(details, (queriedTabs: any[]) => {
          const error = chromeApi.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(queriedTabs);
        });
      });
    const activeTabs = await queryTabs({ active: true, currentWindow: true });
    const activeMatch = activeTabs.find((candidate) => candidate.url === targetUrl);
    if (typeof activeMatch?.id === "number") return activeMatch.id;

    const tabs = await new Promise<any[]>((resolve, reject) => {
      chromeApi.tabs.query({ url: targetUrl }, (queriedTabs: any[]) => {
        const error = chromeApi.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(queriedTabs);
      });
    });
    const tab = tabs.find((candidate) => candidate.url === targetUrl);
    return tab?.id;
  }, url);
}

async function sendTabMessage(
  extensionWorker: Worker,
  tabId: number,
  message: unknown
): Promise<unknown> {
  return extensionWorker.evaluate(
    async ({ id, runtimeMessage }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
      return new Promise((resolve, reject) => {
        chromeApi.tabs.sendMessage(id, runtimeMessage, (response: unknown) => {
          const error = chromeApi.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(response);
        });
      });
    },
    { id: tabId, runtimeMessage: message }
  );
}

async function actionStateForTab(
  extensionWorker: Worker,
  tabId: number
): Promise<{ badgeText: string; enabled: boolean; title: string }> {
  return extensionWorker.evaluate(async (id) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
    const action = chromeApi.action;
    const callAction = <T>(
      label: string,
      method: (...args: any[]) => Promise<T> | void,
      arg: any
    ) => {
      const withTimeout = (operation: () => Promise<T>) =>
        new Promise<T>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`${label} did not resolve`)), 10_000);
          operation().then(
            (value) => {
              clearTimeout(timeout);
              resolve(value);
            },
            (error: unknown) => {
              clearTimeout(timeout);
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          );
        });

      const callbackAction = (initialError?: unknown) =>
        new Promise<T>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(initialError ?? new Error(`${label} did not resolve`)),
            10_000
          );
          const finish = (value: T) => {
            clearTimeout(timeout);
            resolve(value);
          };
          const fail = (error: unknown) => {
            clearTimeout(timeout);
            reject(error instanceof Error ? error : new Error(String(error)));
          };
          try {
            method(arg, (value: T) => {
              const error = chromeApi.runtime.lastError;
              if (error) fail(new Error(error.message));
              else finish(value);
            });
          } catch (error) {
            fail(initialError ?? error);
          }
        });

      return withTimeout(async () => {
        try {
          const maybePromise = method(arg);
          if (maybePromise && typeof maybePromise.then === "function") {
            return await maybePromise;
          }
          return await callbackAction();
        } catch (error) {
          return await callbackAction(error);
        }
      });
    };
    return {
      badgeText: await callAction<string>("action.getBadgeText", action.getBadgeText.bind(action), {
        tabId: id
      }),
      enabled: await callAction<boolean>("action.isEnabled", action.isEnabled.bind(action), id),
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

interface ExportedProfileSummary {
  coursesCount: number;
  featuredCount: number;
  name: string | null;
  patentsCount: number;
  testScoresCount: number;
  workCount: number;
}

async function storedSessionProfileSummary(page: Page): Promise<ExportedProfileSummary | null> {
  return page.evaluate(async () => {
    const stored = await chrome.storage.session.get("linkedin-profile-exporter.profile.session");
    const profile = stored["linkedin-profile-exporter.profile.session"] as
      | {
          courses?: unknown[];
          featured?: unknown[];
          identity?: { name?: string };
          patents?: unknown[];
          testScores?: unknown[];
          work?: unknown[];
        }
      | undefined;
    if (!profile) return null;
    return {
      coursesCount: profile.courses?.length ?? 0,
      featuredCount: profile.featured?.length ?? 0,
      name: profile.identity?.name ?? null,
      patentsCount: profile.patents?.length ?? 0,
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
          testScores?: unknown[];
          work?: unknown[];
        };
        if (profile.schemaVersion !== "linkedin-profile-exporter.profile.v1") continue;
        return {
          coursesCount: profile.courses?.length ?? 0,
          featuredCount: profile.featured?.length ?? 0,
          name: profile.identity?.name ?? null,
          patentsCount: profile.patents?.length ?? 0,
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

async function installDownloadCapture(extensionWorker: Worker): Promise<void> {
  await extensionWorker.evaluate(() => {
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

async function downloadedProfileSummary(
  extensionWorker: Worker
): Promise<ExportedProfileSummary | null> {
  return extensionWorker.evaluate(() => {
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

function staleFixtureProfile(): Profile {
  const profile = fixtureProfile();
  return {
    ...profile,
    identity: {
      ...profile.identity,
      name: "Cached Snapshot",
      profileUrl: "https://www.linkedin.com/in/cached-snapshot/"
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
    interests: []
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

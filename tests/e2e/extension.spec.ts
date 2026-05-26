import { denseProfileHtml, liveLikeProfileHtml } from "../../packages/fixtures/src";
import { defaultSettings } from "../../packages/core/src/settings";
import { expect, test } from "./extension-fixture";
import type { Worker } from "@playwright/test";

test("extension pages render and options persist locally", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByLabel("Delivery").selectOption("clipboard");
  await page.getByLabel("Keep extracted profile locally").check();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const stored = await chrome.storage.local.get("linkedin-profile-exporter.settings");
        return stored["linkedin-profile-exporter.settings"];
      })
    )
    .toMatchObject({ deliveryMode: "clipboard", privacy: { persistExtractedData: true } });
  await page.reload();

  await expect(page.getByLabel("Delivery")).toHaveValue("clipboard");
  await expect(page.getByLabel("Keep extracted profile locally")).toBeChecked();

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("heading", { name: "Profile Exporter" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy|Download/ })).toBeVisible();

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
});

test("content script reports readiness and extracts a fixture profile", async ({ context, extensionWorker }) => {
  const fixtureUrl = "https://www.linkedin.com/in/e2e-extension/";
  const page = await context.newPage();
  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml.replaceAll("https://www.linkedin.com/in/alex-rivera-fixture/", fixtureUrl)
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
    settings: { ...defaultSettings, automationMode: "review-before-export" as const, deliveryMode: "clipboard" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Alex Rivera", profileUrl: fixtureUrl },
      exportMetadata: { formats: ["json", "markdown"] }
    }
  });
});

test("content script waits for delayed live-style profile landmarks", async ({ context, extensionWorker }) => {
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
      document.body.replaceChildren(...Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true)));
    }, 100);
  }, liveLikeProfileHtml);

  await expect.poll(() => page.locator(".text-heading-xlarge").textContent()).toBe("Jordan Lee");
  await expect(readinessPromise).resolves.toMatchObject({ ok: true, readiness: { state: "ready" } });

  const extraction = await sendTabMessage(extensionWorker, tabId, {
    type: "extract-profile",
    settings: { ...defaultSettings, automationMode: "review-before-export" as const, deliveryMode: "clipboard" as const }
  });

  expect(extraction).toMatchObject({
    ok: true,
    profile: {
      identity: { name: "Jordan Lee", profileUrl: fixtureUrl },
      exportMetadata: { formats: ["json", "markdown"] }
    }
  });
});

async function tabIdForUrl(extensionWorker: Worker, url: string): Promise<number | undefined> {
  return extensionWorker.evaluate(async (targetUrl) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: any }).chrome;
    const [tab] = await new Promise<any[]>((resolve, reject) => {
      chromeApi.tabs.query({ url: targetUrl }, (tabs: any[]) => {
        const error = chromeApi.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(tabs);
      });
    });
    return tab?.id;
  }, url);
}

async function sendTabMessage(extensionWorker: Worker, tabId: number, message: unknown): Promise<unknown> {
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

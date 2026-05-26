import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Worker } from "@playwright/test";

const extensionPath = join(process.cwd(), "apps/extension/.output/chrome-mv3");

export const test = base.extend<{
  context: BrowserContext;
  extensionWorker: Worker;
  extensionId: string;
}>({
  context: async ({}, use, testInfo) => {
    expect(existsSync(join(extensionPath, "manifest.json")), "Chrome MV3 extension must be built before E2E").toBe(true);
    const context = await chromium.launchPersistentContext(testInfo.outputPath("chromium-user-data"), {
      acceptDownloads: true,
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    await use(context);
    await context.close();
  },
  extensionWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await use(worker);
  },
  extensionId: async ({ extensionWorker }, use) => {
    await use(extensionWorker.url().split("/")[2] ?? "");
  }
});

export { expect };

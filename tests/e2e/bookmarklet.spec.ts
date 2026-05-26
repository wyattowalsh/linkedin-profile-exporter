import { expect, test } from "@playwright/test";
import { createBookmarklet } from "../../packages/bookmarklet/src";
import { denseProfileHtml } from "../../packages/fixtures/src";

test("bookmarklet exports canonical JSON from a fixture-backed LinkedIn URL", async ({ page }) => {
  await page.route("https://www.linkedin.com/in/e2e-bookmarklet/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: denseProfileHtml
    })
  );

  await page.goto("https://www.linkedin.com/in/e2e-bookmarklet/");
  const source = decodeURIComponent(createBookmarklet().replace(/^javascript:/, ""));
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(source);
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("download stream was not available");

  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    schemaVersion: string;
    identity: { name: string; profileUrl: string };
    diagnostics: Array<{ code: string }>;
  };

  expect(download.suggestedFilename()).toBe("alex-rivera.linkedin-profile.json");
  expect(payload.schemaVersion).toBe("linkedin-profile-exporter.profile.v1");
  expect(payload.identity).toMatchObject({
    name: "Alex Rivera",
    profileUrl: "https://www.linkedin.com/in/e2e-bookmarklet/"
  });
  expect(payload.diagnostics.some((diagnostic) => diagnostic.code === "bookmarklet.minimal")).toBe(true);
});

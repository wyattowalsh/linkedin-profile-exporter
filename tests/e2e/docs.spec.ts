import { expect, test } from "@playwright/test";

test("docs routes render public v0.1.0 pages", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("clipboard delivery")).toBeVisible();

  await page.goto("/docs/settings-privacy");
  await expect(page.getByRole("heading", { name: "Settings And Privacy" }).first()).toBeVisible();
  await expect(page.getByText("persist extracted data")).toBeVisible();
});

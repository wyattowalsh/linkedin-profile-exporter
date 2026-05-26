import { describe, expect, it } from "vitest";
import { createBookmarklet, createInstallerHtml } from "../src";

describe("bookmarklet generator", () => {
  it("creates deterministic bookmarklet and installer outputs", () => {
    expect(createBookmarklet()).toMatch(/^javascript:/);
    expect(decodeURIComponent(createBookmarklet())).toContain("linkedin-profile-exporter.profile.v1");
    expect(createInstallerHtml()).toContain("Export LinkedIn Profile");
  });
});

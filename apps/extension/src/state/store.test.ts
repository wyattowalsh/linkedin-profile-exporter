import { describe, expect, it } from "vitest";
import { denseProfileHtml } from "@linkedin-profile-exporter/fixtures";
import { extractProfileFromHtml } from "@linkedin-profile-exporter/core/extraction";
import { profileToClipboardText, profileToDownload } from "../export-download";
import { useExtensionStore } from "./store";

describe("extension store", () => {
  it("does not allow empty selected formats", () => {
    useExtensionStore.setState({ selectedFormats: ["json"] });
    useExtensionStore.getState().toggleFormat("json");
    expect(useExtensionStore.getState().selectedFormats).toEqual(["json"]);
  });
});

describe("extension downloads", () => {
  it("encodes string exports as UTF-8 data URLs", async () => {
    const profile = extractProfileFromHtml(denseProfileHtml, { now: "2026-05-25T12:00:00.000Z" });
    profile.identity.name = "Ana Maria";
    profile.identity.about = "Designs accessible data systems with cafe, résumé, and São Paulo context.";

    const download = await profileToDownload(profile, "json");
    const [, encoded] = download.dataUrl.split(",");
    if (!encoded) throw new Error("download data URL did not include an encoded payload");
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));

    expect(JSON.parse(decoded).identity.about).toContain("résumé");
    expect(download.filename).toBe("ana-maria-2026-05-25-json.json");
  });

  it("copies only text exports", async () => {
    const profile = extractProfileFromHtml(denseProfileHtml, { now: "2026-05-25T12:00:00.000Z" });
    await expect(profileToClipboardText(profile, "markdown")).resolves.toContain("# Alex Rivera");
    await expect(profileToClipboardText(profile, "xlsx")).rejects.toThrow("binary");
  });
});
